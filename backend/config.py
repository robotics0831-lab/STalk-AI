import os

from dotenv import load_dotenv

load_dotenv()

HOSTED = os.getenv("STALK_HOSTED", "false").lower() in ("1", "true", "yes")
DEFAULT_PROVIDER = os.getenv("STALK_PROVIDER", "free")
DEFAULT_MODEL = os.getenv("STALK_MODEL", "openai-fast")
RATE_LIMIT_PER_MINUTE = int(os.getenv("STALK_RATE_LIMIT", "15" if HOSTED else "30"))


def effective_provider() -> str:
    """Pick the provider that will actually be used."""
    # Prefer Groq/Gemini when keys exist — much more reliable on Render than shared free tier
    if os.getenv("GROQ_API_KEY", "").strip():
        return "groq"
    if os.getenv("GEMINI_API_KEY", "").strip():
        return "gemini"

    provider = DEFAULT_PROVIDER
    if provider in ("groq", "gemini", "ollama") and HOSTED:
        return "free"
    if provider == "groq" and not os.getenv("GROQ_API_KEY", "").strip():
        return "free"
    if provider == "gemini" and not os.getenv("GEMINI_API_KEY", "").strip():
        return "free"
    if provider == "ollama" and HOSTED:
        return "free"
    return provider


def effective_model() -> str:
    provider = effective_provider()
    if provider == "groq":
        return DEFAULT_MODEL if DEFAULT_MODEL not in ("openai-fast", "") else "llama-3.3-70b-versatile"
    if provider == "gemini":
        return DEFAULT_MODEL if "gemini" in DEFAULT_MODEL else "gemini-2.5-flash"
    if provider == "free":
        return DEFAULT_MODEL if DEFAULT_MODEL not in ("llama-3.3-70b-versatile", "llama3.2") else "openai-fast"
    return DEFAULT_MODEL or "llama3.2"


def is_ai_configured() -> bool:
    return True


def groq_key_configured() -> bool:
    key = os.getenv("GROQ_API_KEY", "").strip()
    return key.startswith("gsk_")


def public_config() -> dict:
    provider = effective_provider()
    return {
        "hosted": HOSTED,
        "ready": True,
        "provider": provider,
        "model": effective_model(),
        "name": "STalk",
        "version": "1.1.1",
        "no_api_key": provider == "free",
        "groq_configured": groq_key_configured(),
    }
