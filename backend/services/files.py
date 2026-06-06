from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "uploads"
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf", ".csv", ".json"}


def ensure_upload_dir() -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR


def extract_text(filename: str, content: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext in {".txt", ".md", ".csv", ".json"}:
        return content.decode("utf-8", errors="replace")

    if ext == ".pdf":
        reader = PdfReader(BytesIO(content))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(pages)

    raise ValueError(f"Unsupported file type: {ext}")


def truncate_context(text: str, max_chars: int = 12000) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n[... truncated for length ...]"
