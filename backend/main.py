import base64
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from auth import (
    create_token,
    get_optional_user,
    get_required_user,
    hash_password,
    verify_password,
)
from config import HOSTED, public_config
from conversations import (
    add_message,
    conversation_to_dict,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
)
from database import User, get_db, init_db
from rate_limit import check_rate_limit
from services import files as file_service
from services import images as image_service
from services import llm as llm_service

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="STalk", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class SignInRequest(BaseModel):
    email: EmailStr
    password: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    conversation_id: str | None = None
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


class CreateConversationRequest(BaseModel):
    title: str = "New chat"


def resolve_chat_backend(req: ChatRequest) -> tuple[str, str, str | None]:
    if HOSTED:
        cfg = public_config()
        return cfg["provider"], cfg["model"], None
    provider = req.provider
    if provider in ("groq", "gemini") and not req.api_key:
        from services.llm import resolve_api_key
        if not resolve_api_key(provider, None):
            provider = "free"
    model = req.model
    if provider == "free" and model in ("llama-3.3-70b-versatile", "llama3.2"):
        model = "openai-fast"
    return provider, model, req.api_key


def user_to_dict(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name}


@app.get("/api/health")
async def health():
    return {"status": "ok", "name": "STalk", "version": "1.1.0"}


@app.get("/api/config")
async def config():
    return public_config()


@app.post("/api/auth/signup")
async def signup(req: SignUpRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = User(
        email=email,
        name=req.name.strip(),
        password_hash=hash_password(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id, user.email)
    return {"token": token, "user": user_to_dict(user)}


@app.post("/api/auth/login")
async def login(req: SignInRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    token = create_token(user.id, user.email)
    return {"token": token, "user": user_to_dict(user)}


@app.get("/api/auth/me")
async def me(user: User = Depends(get_required_user)):
    return {"user": user_to_dict(user)}


@app.get("/api/conversations")
async def get_conversations(user: User = Depends(get_required_user), db: Session = Depends(get_db)):
    convs = list_conversations(db, user.id)
    return {"conversations": [conversation_to_dict(c) for c in convs]}


@app.post("/api/conversations")
async def create_new_conversation(
    req: CreateConversationRequest,
    user: User = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    conv = create_conversation(db, user.id, req.title)
    return conversation_to_dict(conv)


@app.get("/api/conversations/{conversation_id}")
async def get_single_conversation(
    conversation_id: str,
    user: User = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    conv = get_conversation(db, user.id, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation_to_dict(conv, include_messages=True)


@app.delete("/api/conversations/{conversation_id}")
async def remove_conversation(
    conversation_id: str,
    user: User = Depends(get_required_user),
    db: Session = Depends(get_db),
):
    if not delete_conversation(db, user.id, conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"ok": True}


@app.post("/api/chat")
async def chat(
    req: ChatRequest,
    request: Request,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    check_rate_limit(request)

    cfg = public_config()
    if not cfg["ready"]:
        raise HTTPException(
            status_code=503,
            detail="STalk AI is temporarily unavailable. Please try again shortly.",
        )

    if req.conversation_id and user:
        conv = get_conversation(db, user.id, req.conversation_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found.")
    elif req.conversation_id and not user:
        raise HTTPException(status_code=401, detail="Sign in to save conversations.")

    if not req.messages:
        raise HTTPException(status_code=400, detail="No messages provided.")

    last_user_msg = next((m for m in reversed(req.messages) if m.role == "user"), None)
    if not last_user_msg:
        raise HTTPException(status_code=400, detail="No user message found.")

    system_content = llm_service.build_system_prompt(
        req.personality, req.custom_prompt, req.file_context or None
    )
    messages = [{"role": "system", "content": system_content}]
    messages.extend({"role": m.role, "content": m.content} for m in req.messages)

    provider, model, api_key = resolve_chat_backend(req)

    try:
        reply = await llm_service.generate_response(messages, provider, model, api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat failed: {e}")

    if user and req.conversation_id:
        add_message(db, req.conversation_id, "user", last_user_msg.content)
        add_message(db, req.conversation_id, "assistant", reply)

    return {"reply": reply}


@app.post("/api/test-connection")
async def test_connection(req: TestConnectionRequest):
    if HOSTED:
        cfg = public_config()
        provider, model, api_key = cfg["provider"], cfg["model"], None
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
