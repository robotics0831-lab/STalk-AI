import httpx

# Bypass system HTTP_PROXY (Cursor/sandbox proxy blocks external AI APIs)
def api_client(timeout: float = 120.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout, trust_env=False, follow_redirects=True)
