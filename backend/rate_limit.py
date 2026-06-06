import os
import time
from collections import defaultdict

from fastapi import HTTPException, Request

from config import RATE_LIMIT_PER_MINUTE, HOSTED

_buckets: dict[str, list[float]] = defaultdict(list)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(request: Request) -> None:
    if not HOSTED:
        return
    ip = client_ip(request)
    now = time.time()
    window = _buckets[ip]
    _buckets[ip] = [t for t in window if now - t < 60]
    if len(_buckets[ip]) >= RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail="Too many messages. Please wait a minute and try again.",
        )
    _buckets[ip].append(now)
