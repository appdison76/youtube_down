#!/bin/bash
# YouTube Down - Server (Cloudflare Tunnel) — 맥미니 등 macOS용
# Windows: start-server-cloudflare.bat / Mac: ./start-server-cloudflare.sh

cd "$(dirname "$0")"

# 3000번 포트 사용 중이면 종료
if lsof -ti:3000 >/dev/null 2>&1; then
  echo "[*] Port 3000 in use - killing process..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null
  sleep 2
fi

echo ""
echo "========================================"
echo "  YouTube Down - melodysnap.mediacommercelab.com"
echo "========================================"
echo "  Check: cloudflared service running (맥미니 터널 설정 시)"
echo "========================================"
echo ""
node server_local.js
