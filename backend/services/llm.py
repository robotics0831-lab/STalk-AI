import os

import httpx
from dotenv import load_dotenv

from services.http_client import api_client

load_dotenv()

OLLAMA_URL = "http://localhost:11434"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

PERSONALITY_PROMPTS = {
    "friendly": "You are STalk, a warm and helpful AI assistant. Be conversational and supportive.",
    "professional": "You are STalk, a professional AI assistant. Be clear, concise, and accurate.",
    "creative": "You are STalk, a creative AI assistant. Be imaginative and offer unique perspectives.",
    "teacher": "You are STalk, a patient teacher. Explain concepts step by step with examples.",
    "custom": "",
}


def resolve_api_key(provider: str, api_key: str | None) -> str | None:
    key = (api_key or "").strip()
    if key:
        return key
    if provider == "groq":
        return os.getenv("GROQ_API_KEY", "").strip() or None
    if provider == "gemini":
        return os.getenv("GEMINI_API_KEY", "").strip() or None
    return None


def build_system_prompt(personality: str, custom_prompt: str, file_context: str | None) -> str:
    base = PERSONALITY_PROMPTS.get(personality, PERSONALITY_PROMPTS["friendly"])
    if personality == "custom" and custom_prompt.strip():
        base = custom_prompt.strip()
    elif personality != "custom":
        base = PERSONALITY_PROMPTS[personality]

    parts = [base]
    if file_context:
        parts.append(
            "The user uploaded files. Use this content when relevant:\n\n" + file_context
        )
    return "\n\n".join(parts)


def parse_api_error(response: httpx.Response) -> str:
    try:
        data = response.json()
        error = data.get("error")
        if isinstance(error, dict):
            return error.get("message") or str(error)
        if error:
            return str(error)
    except Exception:
        pass
    text = (response.text or "").strip()
    return text[:300] if text else f"HTTP {response.status_code}"


async def chat_ollama(messages: list[dict], model: str = "llama3.2") -> str:
    async with api_client() as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={"model": model, "messages": messages, "stream": False},
        )
        response.raise_for_status()
        return response.json()["message"]["content"]


async def chat_groq(
    messages: list[dict],
    api_key: str,
    model: str = "llama-3.3-70b-versatile",
) -> str:
    async with api_client() as client:
        response = await client.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {api_key.strip()}"},
            json={"model": model, "messages": messages, "temperature": 0.7},
        )
        if response.status_code >= 400:
            detail = parse_api_error(response)
            raise ValueError(f"Groq error ({response.status_code}): {detail}")
        return response.json()["choices"][0]["message"]["content"]


async def chat_gemini(
    messages: list[dict],
    api_key: str,
    model: str = "gemini-2.5-flash",
) -> str:
    system_text = next((m["content"] for m in messages if m["role"] == "system"), "")
    contents = []
    for msg in messages:
        if msg["role"] == "system":
            continue
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    payload: dict = {"contents": contents}
    if system_text:
        payload["systemInstruction"] = {"parts": [{"text": system_text}]}

    url = f"{GEMINI_BASE}/{model}:generateContent"
    async with api_client() as client:
        response = await client.post(url, params={"key": api_key.strip()}, json=payload)
        if response.status_code >= 400:
            detail = parse_api_error(response)
            if response.status_code == 429:
                if "limit: 0" in detail:
                    raise ValueError(
                        "Gemini free tier is not available on this Google account "
                        "(quota limit is 0). Use Groq instead, or install Ollama locally. "
                        "Details: ai.google.dev/gemini-api/docs/rate-limits"
                    )
                raise ValueError(
                    f"Gemini rate limit hit. Wait a minute and try again, or switch to Groq/Ollama. {detail[:200]}"
                )
            raise ValueError(f"Gemini error ({response.status_code}): {detail}")

        data = response.json()
        try:
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError):
            raise ValueError("Gemini returned an empty response. Try again.")


async def generate_response(
    messages: list[dict],
    provider: str,
    model: str,
    api_key: str | None,
) -> str:
    resolved_key = resolve_api_key(provider, api_key)

    if provider == "groq":
        if not resolved_key:
            raise ValueError(
                "Groq API key is required. Add it in Settings or set GROQ_API_KEY in backend/.env"
            )
        if not resolved_key.startswith("gsk_"):
            raise ValueError("Groq API keys start with 'gsk_'. Check for extra spaces or a partial copy.")
        try:
            return await chat_groq(messages, resolved_key, model or "llama-3.3-70b-versatile")
        except httpx.ProxyError:
            raise ValueError(
                "Network proxy blocked Groq. Run STalk with ./start.sh from Terminal, or use Ollama locally."
            )

    if provider == "gemini":
        if not resolved_key:
            raise ValueError(
                "Gemini API key is required. Get a free key at aistudio.google.com/apikey"
            )
        try:
            return await chat_gemini(messages, resolved_key, model or "gemini-2.5-flash")
        except httpx.ProxyError:
            raise ValueError(
                "Network proxy blocked Gemini. Run STalk with ./start.sh from Terminal, or use Ollama locally."
            )

    try:
        return await chat_ollama(messages, model or "llama3.2")
    except httpx.ConnectError:
        raise ValueError(
            "Ollama is not running. Install from ollama.com, run 'ollama pull llama3.2', "
            "or switch to Groq/Gemini in Settings."
        )
    except httpx.ProxyError:
        raise ValueError(
            "Network proxy blocked the request. Restart STalk using the latest version on port 8001."
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise ValueError(
                f"Model '{model}' not found. Run: ollama pull {model or 'llama3.2'}"
            )
        raise ValueError(parse_api_error(e.response))


async def test_connection(provider: str, api_key: str | None, model: str) -> dict:
    test_messages = [
        {"role": "system", "content": "You are STalk."},
        {"role": "user", "content": "Reply with exactly: STalk is connected."},
    ]
    reply = await generate_response(test_messages, provider, model, api_key)
    return {
        "ok": True,
        "provider": provider,
        "model": model,
        "reply": reply.strip(),
        "key_source": "settings" if (api_key or "").strip() else "env",
    }
