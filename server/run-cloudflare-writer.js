/**
 * Cloudflare Quick Tunnel 실행 + URL을 tunnel-url.txt에 저장
 * - cloudflared tunnel --url http://localhost:3000 실행
 * - stdout에서 https://*.trycloudflare.com URL 추출 후 server 디렉터리에 tunnel-url.txt로 저장
 * - 서버(server_local.js)가 이 파일을 읽어 /api/tunnel-url 및 config 비교에 사용
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TUNNEL_URL_FILE = path.join(__dirname, 'tunnel-url.txt');
const TUNNEL_URL_REGEX = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/g;

function writeTunnelUrl(url) {
  try {
    fs.writeFileSync(TUNNEL_URL_FILE, url.trim(), 'utf8');
    console.log('[cloudflare-writer] Tunnel URL saved to tunnel-url.txt:', url.trim());
  } catch (e) {
    console.error('[cloudflare-writer] Failed to write tunnel-url.txt:', e.message);
  }
}

// cloudflared 찾기 순서: (1) server 폴더 (2) winget 설치 경로 절대경로 (3) PATH
// DECK 등에서 실행 시 PATH가 비어 있어도 winget 절대경로로 동작하도록
function findCloudflared() {
  const localExe = path.join(__dirname, 'cloudflared.exe');
  if (fs.existsSync(localExe)) return localExe;

  const localAppData = process.env.LOCALAPPDATA || process.env.USERPROFILE || '';
  const winGetPackages = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  if (fs.existsSync(winGetPackages)) {
    try {
      const dirs = fs.readdirSync(winGetPackages);
      const pkg = dirs.find((d) => d.startsWith('Cloudflare.cloudflared'));
      if (pkg) {
        const exe = path.join(winGetPackages, pkg, 'cloudflared.exe');
        if (fs.existsSync(exe)) return exe;
      }
    } catch (e) {}
  }

  return 'cloudflared'; // PATH
}

const cloudflaredCmd = findCloudflared();

const child = spawn(cloudflaredCmd, ['tunnel', '--url', 'http://localhost:3000'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

let found = false;
child.stdout.setEncoding('utf8');
child.stdout.on('data', (data) => {
  process.stdout.write(data);
  if (!found) {
    const match = data.match(TUNNEL_URL_REGEX);
    if (match && match[0]) {
      found = true;
      writeTunnelUrl(match[0]);
    }
  }
});

child.stderr.setEncoding('utf8');
child.stderr.on('data', (data) => {
  process.stderr.write(data);
  if (!found) {
    const match = data.match(TUNNEL_URL_REGEX);
    if (match && match[0]) {
      found = true;
      writeTunnelUrl(match[0]);
    }
  }
});

child.on('error', (err) => {
  console.error('[cloudflare-writer] Failed to start cloudflared:', err.message);
  console.error('Install: winget install cloudflare.cloudflared  or  https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/');
  process.exit(1);
});

child.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    process.exit(code);
  }
});
