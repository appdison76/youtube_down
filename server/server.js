const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어
app.use(cors());
app.use(express.json());

// 다운로드 디렉토리 생성
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// YouTube 영상 정보 가져오기
app.post('/api/video-info', async (req, res) => {
  try {
    console.log('[Server] ===== Video info request received =====');
    console.log('[Server] Request body:', req.body);
    console.log('[Server] Headers:', req.headers);
    
    const { url } = req.body;
    
    if (!url) {
      console.error('[Server] ❌ URL missing in request body');
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    console.log('[Server] Getting video info for:', url);
    
    // yt-dlp를 사용하여 영상 정보 가져오기
    const { stdout } = await execAsync(`python3 -m yt_dlp --dump-json --no-warnings "${url}"`);
    const info = JSON.parse(stdout);
    
    res.json({
      title: info.title,
      author: info.uploader || info.channel || '',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      formats: [] // yt-dlp는 다른 방식으로 포맷을 제공
    });
  } catch (error) {
    console.error('[Server] Error getting video info:', error);
    res.status(500).json({ error: '영상 정보를 가져오는 데 실패했습니다.' });
  }
});

// 영상 다운로드 (스트리밍)
app.get('/api/download/video', async (req, res) => {
  try {
    const { url, quality } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    console.log('[Server] Downloading video:', url, 'quality:', quality);

    // 헤더 설정
    res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    // yt-dlp를 사용하여 영상 다운로드 및 스트리밍
    // spawn을 사용하여 더 세밀한 제어 가능
    // 비디오와 오디오가 합쳐진 파일을 다운로드 (best[ext=mp4]는 이미 합쳐진 비디오)
    // stdout으로 출력할 때는 합치기가 어려우므로, 이미 합쳐진 비디오를 우선 선택
    const ytdlpProcess = spawn('python3', [
      '-m', 'yt_dlp',
      '-f', 'best/bestvideo+bestaudio',
      '--merge-output-format', 'mp4',
      '--no-warnings',
      '--progress',
      '--extractor-args', 'youtube:player_client=android',
      '--retries', '3',
      '--fragment-retries', '3',
      '--user-agent', 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      '-o', '-',
      url
    ], {
      stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe, stderr: pipe
    });
    
    let hasStarted = false;
    let isCompleted = false;
    let clientDisconnected = false;
    
    ytdlpProcess.stdout.on('data', (chunk) => {
      if (!res.headersSent) {
        res.writeHead(200);
        hasStarted = true;
      }
      if (!res.destroyed && !clientDisconnected) {
        try {
          const canContinue = res.write(chunk);
          // 버퍼가 가득 차면 drain 이벤트를 기다림
          if (!canContinue) {
            res.once('drain', () => {
              // 버퍼가 비워지면 계속 진행
            });
          }
        } catch (error) {
          console.error('[Server] Error writing chunk:', error);
          // 에러가 발생해도 프로세스는 계속 실행
          clientDisconnected = true;
        }
      } else if (clientDisconnected) {
        // 클라이언트가 연결을 끊었어도 데이터는 계속 읽어서 버퍼링
        // (프로세스가 종료되지 않도록)
      }
    });

    ytdlpProcess.stdout.on('end', () => {
      isCompleted = true;
      if (!res.destroyed && !clientDisconnected) {
        res.end();
      }
      console.log('[Server] Video stream completed');
    });

    ytdlpProcess.stderr.on('data', (data) => {
      const message = data.toString();
      // 진행률 정보는 info로, 실제 에러만 error로 처리
      if (message.includes('[download]') || message.includes('[info]')) {
        console.log('[Server] yt-dlp:', message.trim());
      } else if (message.includes('ERROR') || message.includes('WARNING')) {
        console.error('[Server] yt-dlp error:', message.trim());
      } else {
        console.log('[Server] yt-dlp:', message.trim());
      }
    });

    ytdlpProcess.on('error', (error) => {
      console.error('[Server] Process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: '다운로드 프로세스 오류가 발생했습니다.' });
      } else if (!res.destroyed && !clientDisconnected) {
        res.end();
      }
    });

    ytdlpProcess.on('close', (code, signal) => {
      console.log('[Server] yt-dlp exited with code:', code, 'signal:', signal);
      if (code !== 0 && code !== null && !isCompleted) {
        if (!res.headersSent && !clientDisconnected) {
          res.status(500).json({ error: '다운로드가 실패했습니다.' });
        } else if (!res.destroyed && !clientDisconnected) {
          res.end();
        }
      } else if (code === null && !hasStarted && !clientDisconnected) {
        // 프로세스가 시작되지 않고 종료된 경우
        if (!res.headersSent) {
          res.status(500).json({ error: '다운로드를 시작할 수 없습니다.' });
        }
      }
    });
    
    // 클라이언트 연결 종료 시 처리 - 프로세스를 종료하지 않음
    req.on('close', () => {
      if (!clientDisconnected) {
        clientDisconnected = true;
        console.log('[Server] Client disconnected, but keeping yt-dlp process running');
        // stdout을 계속 읽어서 프로세스가 종료되지 않도록 함
        ytdlpProcess.stdout.on('data', () => {
          // 데이터는 버리지만 프로세스는 계속 실행
        });
      }
    });
    
    // 응답 종료 시에도 프로세스는 계속 실행
    res.on('close', () => {
      if (!isCompleted && ytdlpProcess && !ytdlpProcess.killed) {
        console.log('[Server] Response closed, but yt-dlp will continue');
        // stdout을 계속 읽어서 프로세스가 종료되지 않도록 함
        ytdlpProcess.stdout.on('data', () => {
          // 데이터는 버리지만 프로세스는 계속 실행
        });
      }
    });
    
    console.log('[Server] Video stream started');
  } catch (error) {
    console.error('[Server] Error downloading video:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '영상 다운로드 중 오류가 발생했습니다.' });
    }
  }
});

// 오디오 다운로드 (스트리밍)
app.get('/api/download/audio', async (req, res) => {
  try {
    console.log('[Server] ===== Audio download request received =====');
    console.log('[Server] Query params:', req.query);
    console.log('[Server] Full URL:', req.url);
    
    const { url, quality } = req.query;
    
    if (!url) {
      console.error('[Server] ❌ URL missing in query params');
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    console.log('[Server] Downloading audio:', url, 'quality:', quality);

    // 헤더 설정
    res.setHeader('Content-Disposition', 'attachment; filename="audio.m4a"');
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Transfer-Encoding', 'chunked');

    // yt-dlp를 사용하여 오디오 다운로드 및 스트리밍
    // 로컬 서버와 동일하게 작동하도록 단순한 포맷 선택
    // bestaudio 사용 (어떤 오디오 포맷이든 허용)
    const ytdlpProcess = spawn('python3', [
      '-m', 'yt_dlp',
      '-f', 'bestaudio',
      '--no-warnings',
      '--progress',
      '--extractor-args', 'youtube:player_client=android',
      '--retries', '3',
      '--fragment-retries', '3',
      '--user-agent', 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      '-o', '-',
      url
    ], {
      stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe, stderr: pipe
    });
    
    let hasStarted = false;
    let isCompleted = false;
    let clientDisconnected = false;
    
    ytdlpProcess.stdout.on('data', (chunk) => {
      if (!res.headersSent) {
        res.writeHead(200);
        hasStarted = true;
      }
      if (!res.destroyed && !clientDisconnected) {
        try {
          const canContinue = res.write(chunk);
          // 버퍼가 가득 차면 drain 이벤트를 기다림
          if (!canContinue) {
            res.once('drain', () => {
              // 버퍼가 비워지면 계속 진행
            });
          }
        } catch (error) {
          console.error('[Server] Error writing chunk:', error);
          // 에러가 발생해도 프로세스는 계속 실행
          clientDisconnected = true;
        }
      } else if (clientDisconnected) {
        // 클라이언트가 연결을 끊었어도 데이터는 계속 읽어서 버퍼링
        // (프로세스가 종료되지 않도록)
      }
    });

    ytdlpProcess.stdout.on('end', () => {
      isCompleted = true;
      if (!res.destroyed && !clientDisconnected) {
        res.end();
      }
      console.log('[Server] Audio stream completed');
    });

    ytdlpProcess.stderr.on('data', (data) => {
      const message = data.toString();
      // 진행률 정보는 info로, 실제 에러만 error로 처리
      if (message.includes('[download]') || message.includes('[info]')) {
        console.log('[Server] yt-dlp:', message.trim());
      } else if (message.includes('ERROR') || message.includes('WARNING')) {
        console.error('[Server] yt-dlp error:', message.trim());
      } else {
        console.log('[Server] yt-dlp:', message.trim());
      }
    });

    ytdlpProcess.on('error', (error) => {
      console.error('[Server] Process error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: '다운로드 프로세스 오류가 발생했습니다.' });
      } else if (!res.destroyed && !clientDisconnected) {
        res.end();
      }
    });

    ytdlpProcess.on('close', (code, signal) => {
      console.log('[Server] yt-dlp exited with code:', code, 'signal:', signal);
      if (code !== 0 && code !== null && !isCompleted) {
        if (!res.headersSent && !clientDisconnected) {
          res.status(500).json({ error: '다운로드가 실패했습니다.' });
        } else if (!res.destroyed && !clientDisconnected) {
          res.end();
        }
      } else if (code === null && !hasStarted && !clientDisconnected) {
        // 프로세스가 시작되지 않고 종료된 경우
        if (!res.headersSent) {
          res.status(500).json({ error: '다운로드를 시작할 수 없습니다.' });
        }
      }
    });
    
    // 클라이언트 연결 종료 시 처리 - 프로세스를 종료하지 않음
    req.on('close', () => {
      if (!clientDisconnected) {
        clientDisconnected = true;
        console.log('[Server] Client disconnected, but keeping yt-dlp process running');
        // stdout을 계속 읽어서 프로세스가 종료되지 않도록 함
        ytdlpProcess.stdout.on('data', () => {
          // 데이터는 버리지만 프로세스는 계속 실행
        });
      }
    });
    
    // 응답 종료 시에도 프로세스는 계속 실행
    res.on('close', () => {
      if (!isCompleted && ytdlpProcess && !ytdlpProcess.killed) {
        console.log('[Server] Response closed, but yt-dlp will continue');
        // stdout을 계속 읽어서 프로세스가 종료되지 않도록 함
        ytdlpProcess.stdout.on('data', () => {
          // 데이터는 버리지만 프로세스는 계속 실행
        });
      }
    });
  } catch (error) {
    console.error('[Server] Error downloading audio:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '오디오 다운로드 중 오류가 발생했습니다.' });
    }
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] YouTube Downloader Server running on port ${PORT}`);
  console.log(`[Server] Accessible at http://localhost:${PORT}`);
  console.log(`[Server] Accessible at http://172.30.1.25:${PORT}`);
});

