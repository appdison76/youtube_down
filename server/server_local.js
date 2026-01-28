/**
 * 로컬 전용 서버 진입점 (ngrok + .env + config.json 비교)
 * - dotenv로 .env 로드
 * - /api/ngrok-url, ngrok URL 감지, config.json 비교
 * - start-server-ngrok.bat 에서 실행
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { app, PORT, DAILY_LIMIT } = require('./server');

// --- 로컬 전용: ngrok URL 감지 ---
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

const getCurrentConfigUrl = () => {
  try {
    const configPath = path.join(__dirname, '..', 'install-page', 'config.json');
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

app.get('/api/ngrok-url', async (req, res) => {
  try {
    const ngrokUrl = await getNgrokUrl();
    if (ngrokUrl) {
      res.json({ success: true, url: ngrokUrl, message: 'Ngrok URL detected' });
    } else {
      res.json({ success: false, url: null, message: 'Ngrok not detected. Make sure ngrok is running on port 4040.' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- 로컬 전용: listen + ngrok 감지 ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] YouTube Downloader Server (local) running on port ${PORT}`);
  console.log(`[Server] Accessible at http://localhost:${PORT}`);
  console.log(``);
  console.log(`[Server] 📋 환경 변수:`);
  console.log(`[Server]   YOUTUBE_API_KEY: ${process.env.YOUTUBE_API_KEY ? '✅ set' : '❌ not set (검색 불가)'}`);
  console.log(`[Server]   DAILY_LIMIT: ${DAILY_LIMIT} (검색 일일 제한)`);
  console.log(``);
  console.log(`[Server] 📋 ============================================`);
  console.log(`[Server] 📋 Ngrok URL 확인 방법:`);
  console.log(`[Server] 📋 1. API: http://localhost:${PORT}/api/ngrok-url`);
  console.log(`[Server] 📋 2. Web UI: http://localhost:4040`);
  console.log(`[Server] 📋 ============================================`);
  console.log(``);

  let lastNgrokUrl = null;

  const checkNgrokUrl = async () => {
    const ngrokUrl = await getNgrokUrl();
    const currentConfigUrl = getCurrentConfigUrl();

    if (ngrokUrl) {
      if (lastNgrokUrl === null) {
        console.log(`[Server] 🌐 Ngrok URL detected: ${ngrokUrl}`);
        if (currentConfigUrl) {
          if (currentConfigUrl === ngrokUrl) {
            console.log(`[Server] ✅ config.json matches: ${currentConfigUrl}`);
          } else {
            console.log(`[Server] ⚠️  config.json mismatch:`);
            console.log(`[Server]    현재 config.json: ${currentConfigUrl}`);
            console.log(`[Server]    감지된 ngrok URL: ${ngrokUrl}`);
            console.log(`[Server] 💡 Update config.json with: "apiBaseUrl": "${ngrokUrl}"`);
          }
        } else {
          console.log(`[Server] 💡 Update config.json with: "apiBaseUrl": "${ngrokUrl}"`);
        }
        lastNgrokUrl = ngrokUrl;
      } else if (lastNgrokUrl !== ngrokUrl) {
        console.log(`[Server] ⚠️  Ngrok URL CHANGED!`);
        console.log(`[Server] 🔴 Old URL: ${lastNgrokUrl}`);
        console.log(`[Server] 🟢 New URL: ${ngrokUrl}`);
        if (currentConfigUrl) {
          if (currentConfigUrl === ngrokUrl) {
            console.log(`[Server] ✅ config.json already matches: ${currentConfigUrl}`);
          } else {
            console.log(`[Server] ⚠️  config.json mismatch:`);
            console.log(`[Server]    현재 config.json: ${currentConfigUrl}`);
            console.log(`[Server]    감지된 ngrok URL: ${ngrokUrl}`);
            console.log(`[Server] 💡 IMPORTANT: Update config.json with: "apiBaseUrl": "${ngrokUrl}"`);
          }
        } else {
          console.log(`[Server] 💡 IMPORTANT: Update config.json with: "apiBaseUrl": "${ngrokUrl}"`);
        }
        lastNgrokUrl = ngrokUrl;
      }
    } else if (lastNgrokUrl !== null) {
      console.log(`[Server] ⚠️  Ngrok connection lost. Waiting for reconnection...`);
      lastNgrokUrl = null;
    }
  };

  setTimeout(checkNgrokUrl, 5000);
  setInterval(checkNgrokUrl, 30000);
});
