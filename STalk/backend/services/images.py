import base64
import os
from urllib.parse import quote

from services.http_client import api_client
from services.llm import parse_api_error

GEN_BASE = "https://gen.pollinations.ai"
DEFAULT_MODEL = "flux"

MISSING_KEY_MSG = (
    "Image generation needs a free Pollinations API key. "
    "Get one at enter.pollinations.ai, then add POLLINATIONS_API_KEY on Render "
    "(hosted) or in Settings (local)."
)


def resolve_pollinations_key(api_key: str | None) -> str | None:
    key = (api_key or "").strip()
    if key:
        return key
    env = os.getenv("POLLINATIONS_API_KEY", "").strip()
    return env or None


def pollinations_key_configured() -> bool:
    key = resolve_pollinations_key(None)
    return bool(key and (key.startswith("sk_") or key.startswith("pk_")))


def _mime_for_bytes(data: bytes) -> str:
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return "image/jpeg"


def _friendly_image_error(status: int, detail: str) -> str:
    lower = (detail or "").lower()
    if status in (401, 403) or "api key" in lower or "unauthorized" in lower or "forbidden" in lower:
        return MISSING_KEY_MSG
    if "rate limit" in lower or status == 429:
        return "Too many image requests. Wait a minute and try again."
    if detail:
        return detail[:300]
    return "Image generation failed. Try a different prompt."


def _parse_post_response(response) -> tuple[bytes, str]:
    data = response.json()
    items = data.get("data") or []
    if not items:
        raise ValueError("Image generation returned no data. Try again.")
    item = items[0]
    b64 = item.get("b64_json")
    if b64:
        raw = base64.b64decode(b64)
        return raw, _mime_for_bytes(raw)
    url = item.get("url")
    if url:
        raise ValueError("Unexpected URL response from image API.")
    raise ValueError("Image generation failed. Try a different prompt.")


async def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    api_key: str | None = None,
    model: str = DEFAULT_MODEL,
) -> tuple[bytes, str]:
    """Generate an image via Pollinations gen.pollinations.ai (API key required)."""
    key = resolve_pollinations_key(api_key)
    if not key:
        raise ValueError(MISSING_KEY_MSG)

    headers = {"Authorization": f"Bearer {key}"}
    size = f"{width}x{height}"
    last_status = 500
    last_detail = "Image generation failed."

    async with api_client(timeout=180.0) as client:
        post_resp = await client.post(
            f"{GEN_BASE}/v1/images/generations",
            headers={**headers, "Content-Type": "application/json"},
            json={
                "prompt": prompt,
                "model": model or DEFAULT_MODEL,
                "size": size,
                "response_format": "b64_json",
                "n": 1,
            },
        )
        if post_resp.status_code < 400:
            return _parse_post_response(post_resp)

        last_status = post_resp.status_code
        last_detail = parse_api_error(post_resp)

        encoded_prompt = quote(prompt, safe="")
        get_url = (
            f"{GEN_BASE}/image/{encoded_prompt}"
            f"?model={quote(model or DEFAULT_MODEL, safe='')}"
            f"&width={width}&height={height}&key={quote(key, safe='')}"
        )
        get_resp = await client.get(get_url, headers=headers)
        if get_resp.status_code < 400:
            content_type = get_resp.headers.get("content-type", "")
            if content_type.startswith("image/"):
                mime = content_type.split(";")[0].strip()
                return get_resp.content, mime
            last_detail = "Unexpected response from image service."

        last_status = get_resp.status_code
        last_detail = parse_api_error(get_resp) or last_detail

    raise ValueError(_friendly_image_error(last_status, last_detail))
