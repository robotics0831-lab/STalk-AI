from urllib.parse import quote

import httpx

from services.http_client import api_client

POLLINATIONS_BASE = "https://image.pollinations.ai/prompt"


async def generate_image(prompt: str, width: int = 1024, height: int = 1024) -> bytes:
    """Free image generation via Pollinations.ai (no API key required)."""
    encoded = quote(prompt)
    url = f"{POLLINATIONS_BASE}/{encoded}?width={width}&height={height}&nologo=true"

    async with api_client() as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("image/"):
            raise ValueError("Image generation failed. Try a different prompt.")
        return response.content
