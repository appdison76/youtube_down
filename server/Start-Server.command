#!/bin/bash
# 맥: 이 파일에 대해 '별칭 만들기' → 바탕화면에 별칭 두고 더블클릭해서 실행
cd "$(dirname "$0")"

# Node가 PATH에 없으면 nvm 로드 (더블클릭 실행 시)
if ! command -v node >/dev/null 2>&1; then
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
  [ -f "$HOME/.zshrc" ] && . "$HOME/.zshrc" 2>/dev/null
fi

bash start-server-cloudflare.sh
