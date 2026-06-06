import os

from dotenv import load_dotenv

load_dotenv()

HOSTED = os.getenv("STALK_HOSTED", "false").lower() in ("1", "true", "yes")
DEFAULT_PROVIDER = os.getenv("STALK_PROVIDER", "groq")
DEFAULT_MODEL = os.getenv("STALK_MODEL", "llama-3.3-70b-versatile")
RATE_LIMIT_PER_MINUTE = int(os.getenv("STALK_RATE_LIMIT", "30"))


def is_ai_configured() -> bool:
    if DEFAULT_PROVIDER == "groq":
        return bool(os.getenv("GROQ_API_KEY", "").strip())
    if DEFAULT_PROVIDER == "gemini":
        return bool(os.getenv("GEMINI_API_KEY", "").strip())
    return DEFAULT_PROVIDER == "ollama"


def public_config() -> dict:
    return {
        "hosted": HOSTED,
        "ready": is_ai_configured(),
        "provider": DEFAULT_PROVIDER,
        "model": DEFAULT_MODEL,
        "name": "STalk",
    }
