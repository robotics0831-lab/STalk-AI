import os

from dotenv import load_dotenv

load_dotenv()

HOSTED = os.getenv("STALK_HOSTED", "false").lower() in ("1", "true", "yes")
DEFAULT_PROVIDER = os.getenv("STALK_PROVIDER", "free")
DEFAULT_MODEL = os.getenv("STALK_MODEL", "openai-fast")
RATE_LIMIT_PER_MINUTE = int(os.getenv("STALK_RATE_LIMIT", "30"))


def effective_provider() -> str:
    """Pick the provider that will actually be used."""
    provider = DEFAULT_PROVIDER
    if provider == "groq" and not os.getenv("GROQ_API_KEY", "").strip():
        return "free"
    if provider == "gemini" and not os.getenv("GEMINI_API_KEY", "").strip():
        return "free"
    if provider == "ollama" and HOSTED:
        return "free"
    return provider


def is_ai_configured() -> bool:
    provider = effective_provider()
    if provider == "free":
        return True
    if provider == "groq":
        return bool(os.getenv("GROQ_API_KEY", "").strip())
    if provider == "gemini":
        return bool(os.getenv("GEMINI_API_KEY", "").strip())
    return provider == "ollama"


def public_config() -> dict:
    provider = effective_provider()
    model = DEFAULT_MODEL
    if provider == "free":
        model = DEFAULT_MODEL if DEFAULT_MODEL != "llama-3.3-70b-versatile" else "openai-fast"
    elif provider == "groq":
        model = DEFAULT_MODEL or "llama-3.3-70b-versatile"
    return {
        "hosted": HOSTED,
        "ready": is_ai_configured(),
        "provider": provider,
        "model": model,
        "name": "STalk",
        "no_api_key": provider == "free",
    }
