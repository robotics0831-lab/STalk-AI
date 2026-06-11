#!/bin/bash
# Start STalk without Cursor/sandbox proxy interfering with AI API calls.
cd "$(dirname "$0")/backend"

unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
unset SOCKS_PROXY SOCKS5_PROXY socks_proxy socks5_proxy

echo "Starting STalk at http://localhost:8000"
python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
