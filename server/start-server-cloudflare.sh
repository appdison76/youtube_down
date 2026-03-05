#!/bin/bash
# YouTube Down - Server (Cloudflare Tunnel) — 맥미니 등 macOS용
# Windows: start-server-cloudflare.bat / Mac: ./start-server-cloudflare.sh

cd "$(dirname "$0")"

# Node가 PATH에 없으면 nvm/경로 시도
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  [ -x "/opt/homebrew/bin/node" ] && export PATH="/opt/homebrew/bin:$PATH"
  [ -f "$HOME/.zshrc" ] && . "$HOME/.zshrc" 2>/dev/null
fi
if ! command -v node >/dev/null 2>&1; then
  echo "오류: Node.js를 찾을 수 없습니다. node -v 로 확인하거나 https://nodejs.org 에서 설치하세요."
  exit 1
fi

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
