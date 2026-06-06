import base64
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from config import DEFAULT_MODEL, DEFAULT_PROVIDER, HOSTED, public_config
from rate_limit import check_rate_limit
from services import files as file_service
from services import images as image_service
from services import llm as llm_service

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"

app = FastAPI(title="STalk", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    personality: str = "friendly"
    custom_prompt: str = ""
    file_context: str = ""
    provider: str = "groq"
    model: str = "llama-3.3-70b-versatile"
    api_key: str | None = None


class TestConnectionRequest(BaseModel):
    provider: str = "groq"
    model: str = "llama-3.3-70b-versatile"
    api_key: str | None = None


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    width: int = 1024
    height: int = 1024


def resolve_chat_backend(req: ChatRequest) -> tuple[str, str, str | None]:
    if HOSTED:
        return DEFAULT_PROVIDER, DEFAULT_MODEL, None
    return req.provider, req.model, req.api_key


@app.get("/api/health")
async def health():
    return {"status": "ok", "name": "STalk"}


@app.get("/api/config")
async def config():
    return public_config()


@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    check_rate_limit(request)

    cfg = public_config()
    if not cfg["ready"]:
        raise HTTPException(
            status_code=503,
            detail="STalk is not configured yet. The owner needs to add a GROQ_API_KEY.",
        )

    system_content = llm_service.build_system_prompt(
        req.personality, req.custom_prompt, req.file_context or None
    )
    messages = [{"role": "system", "content": system_content}]
    messages.extend({"role": m.role, "content": m.content} for m in req.messages)

    provider, model, api_key = resolve_chat_backend(req)

    try:
        reply = await llm_service.generate_response(messages, provider, model, api_key)
        return {"reply": reply}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")


@app.post("/api/test-connection")
async def test_connection(req: TestConnectionRequest):
    if HOSTED:
        provider, model, api_key = DEFAULT_PROVIDER, DEFAULT_MODEL, None
    else:
        provider, model, api_key = req.provider, req.model, req.api_key

    try:
        result = await llm_service.test_connection(provider, api_key, model)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Connection test failed: {e}")


@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    ext = Path(file.filename).suffix.lower()
    if ext not in file_service.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(file_service.ALLOWED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > file_service.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    try:
        text = file_service.extract_text(file.filename, content)
        text = file_service.truncate_context(text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    upload_dir = file_service.ensure_upload_dir()
    file_id = str(uuid.uuid4())
    saved_path = upload_dir / f"{file_id}{ext}"
    saved_path.write_bytes(content)

    return {
        "id": file_id,
        "filename": file.filename,
        "chars": len(text),
        "preview": text[:500] + ("..." if len(text) > 500 else ""),
        "context": text,
    }


@app.post("/api/image")
async def generate_image(req: ImageRequest, request: Request):
    check_rate_limit(request)
    try:
        image_bytes = await image_service.generate_image(
            req.prompt, req.width, req.height
        )
        b64 = base64.b64encode(image_bytes).decode("ascii")
        return {"image": f"data:image/jpeg;base64,{b64}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")


app.mount("/css", StaticFiles(directory=FRONTEND / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND / "js"), name="js")


@app.get("/")
async def index():
    return FileResponse(FRONTEND / "index.html")
