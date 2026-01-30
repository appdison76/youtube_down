/**
 * 로컬 전용 서버 진입점 (Cloudflare Tunnel / ngrok + .env + config.json 비교)
 * - dotenv로 .env 로드
 * - /api/tunnel-url, /api/ngrok-url, 터널 URL 감지, config.json 비교
 * - start-server-cloudflare.bat 또는 start-server-ngrok.bat 에서 실행
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, PORT, DAILY_LIMIT } = require('./server');

const TUNNEL_URL_FILE = path.join(__dirname, 'tunnel-url.txt');

// --- 로컬 전용: Cloudflare Tunnel URL (tunnel-url.txt) ---
const getTunnelUrl = () => {
  try {
    if (fs.existsSync(TUNNEL_URL_FILE)) {
      const url = fs.readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
      if (url && url.startsWith('http')) return url;
    }
    return null;
  } catch (e) {
    return null;
  }
};

// --- 로컬 전용: ngrok URL 감지 (localhost:4040 API) ---
const getNgrokUrl = async () => {
  try {
    const response = await fetch('http://localhost:4040/api/tunnels');
    if (!response.ok) return null;
    const data = await response.json();
    if (data.tunnels && data.tunnels.length > 0) {
      const httpsTunnel = data.tunnels.find(t => t.proto === 'https');
      const tunnel = httpsTunnel || data.tunnels[0];
      return tunnel.public_url;
    }
    return null;
  } catch (error) {
    return null;
  }
};

/** 터널 공용 URL: Cloudflare(tunnel-url.txt) 우선, 없으면 ngrok */
const getPublicUrl = async () => {
  const tunnelUrl = getTunnelUrl();
  if (tunnelUrl) return tunnelUrl;
  return await getNgrokUrl();
};

const getCurrentConfigUrl = () => {
  try {
    const configPath = path.join(__dirname, '..', 'web-app', 'install-page', 'config.json');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configContent);
      return config.apiBaseUrl || null;
    }
    return null;
  } catch (error) {
    return null;
  }
};

app.get('/api/tunnel-url', async (req, res) => {
  try {
    let url = await getPublicUrl();
    if (!url) url = getCurrentConfigUrl();
    if (url) {
      res.json({ success: true, url, message: 'Config or tunnel URL' });
    } else {
      res.json({ success: false, url: null, message: 'config.json에 apiBaseUrl을 설정하세요.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/ngrok-url', async (req, res) => {
  try {
    const url = await getPublicUrl();
    if (url) {
      res.json({ success: true, url, message: getTunnelUrl() ? 'Cloudflare Tunnel URL' : 'Ngrok URL detected' });
    } else {
      res.json({ success: false, url: null, message: 'Ngrok not detected. Make sure ngrok is running on port 4040.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- 로컬 전용: listen + 터널 URL 감지 (Cloudflare / ngrok) ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] YouTube Downloader Server (local) running on port ${PORT}`);
  console.log(`[Server] Accessible at http://localhost:${PORT}`);
  console.log(``);
  console.log(`[Server] 📋 환경 변수:`);
  console.log(`[Server]   YOUTUBE_API_KEY: ${process.env.YOUTUBE_API_KEY ? '✅ set' : '❌ not set (검색 불가)'}`);
  console.log(`[Server]   DAILY_LIMIT: ${DAILY_LIMIT} (검색 일일 제한)`);
  console.log(``);
  const configUrl = getCurrentConfigUrl();
  if (configUrl) {
    console.log(`[Server] 📋 접속 주소: ${configUrl}`);
    console.log(`[Server] 📋 cloudflared 서비스(services.msc)가 "시작됨"인지 확인하세요.`);
  }
  console.log(``);

  let lastPublicUrl = null;

  const checkPublicUrl = async () => {
    const publicUrl = await getPublicUrl();
    const currentConfigUrl = getCurrentConfigUrl();

    const isFixedHostname = currentConfigUrl && !currentConfigUrl.includes('trycloudflare.com');
    if (publicUrl) {
      if (lastPublicUrl === null) {
        if (isFixedHostname) {
          console.log(`[Server] 🌐 Using fixed hostname: ${currentConfigUrl}`);
        } else {
          const source = getTunnelUrl() ? 'Cloudflare Tunnel' : 'Ngrok';
          console.log(`[Server] 🌐 ${source} URL detected: ${publicUrl}`);
        }
        if (currentConfigUrl) {
          if (currentConfigUrl === publicUrl) {
            console.log(`[Server] ✅ config.json matches: ${currentConfigUrl}`);
          } else if (isFixedHostname) {
            console.log(`[Server] ✅ App uses config URL`);
          } else {
            console.log(`[Server] ⚠️  config.json mismatch:`);
            console.log(`[Server]    현재 config.json: ${currentConfigUrl}`);
            console.log(`[Server]    감지된 터널 URL: ${publicUrl}`);
            console.log(`[Server] 💡 Update config.json with: "apiBaseUrl": "${publicUrl}"`);
          }
        } else {
          console.log(`[Server] 💡 Update config.json with: "apiBaseUrl": "${publicUrl}"`);
        }
        lastPublicUrl = publicUrl;
      } else if (lastPublicUrl !== publicUrl) {
        if (!isFixedHostname) {
          console.log(`[Server] ⚠️  Tunnel URL CHANGED!`);
          console.log(`[Server] 🔴 Old URL: ${lastPublicUrl}`);
          console.log(`[Server] 🟢 New URL: ${publicUrl}`);
        }
        if (currentConfigUrl) {
          if (currentConfigUrl === publicUrl) {
            console.log(`[Server] ✅ config.json already matches: ${currentConfigUrl}`);
          } else if (isFixedHostname) {
            console.log(`[Server] ✅ Using fixed hostname from config: ${currentConfigUrl}`);
          } else {
            console.log(`[Server] ⚠️  config.json mismatch:`);
            console.log(`[Server]    현재 config.json: ${currentConfigUrl}`);
            console.log(`[Server]    감지된 터널 URL: ${publicUrl}`);
            console.log(`[Server] 💡 IMPORTANT: Update config.json with: "apiBaseUrl": "${publicUrl}"`);
          }
        } else {
          console.log(`[Server] 💡 IMPORTANT: Update config.json with: "apiBaseUrl": "${publicUrl}"`);
        }
        lastPublicUrl = publicUrl;
      }
    } else if (lastPublicUrl !== null) {
      console.log(`[Server] ⚠️  Tunnel connection lost. Waiting for reconnection...`);
      lastPublicUrl = null;
    }
  };

  setTimeout(checkPublicUrl, 5000);
  setInterval(checkPublicUrl, 30000);
});
