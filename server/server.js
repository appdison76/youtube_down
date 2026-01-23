const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// 여러 player_client를 순차적으로 시도 (봇 감지 우회)
// 매 요청마다 랜덤 순서로 시도하여 패턴 감지 방지
// 더 많은 옵션을 추가하여 차단 확률 감소
const PLAYER_CLIENTS = [
  'web', 
  'ios', 
  'android', 
  'mweb',           // 모바일 웹
  'tv_embedded', 
  'web_embedded',
  'android_embedded' // Android 임베디드
];

// 배열을 랜덤하게 섞는 함수 (Fisher-Yates 알고리즘)
const shuffleArray = (array) => {
  const shuffled = [...array]; // 원본 배열 복사
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// User-Agent 설정 (player_client에 맞게)
const getUserAgent = (client) => {
  switch (client) {
    case 'android':
      return 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    case 'ios':
      return 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
    case 'web':
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    case 'tv_embedded':
      return 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    case 'web_embedded':
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    case 'mweb':
      return 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    case 'android_embedded':
      return 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    default:
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
};

console.log(`[Server] Will try player_clients in order: ${PLAYER_CLIENTS.join(' -> ')}`);

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
    // YouTube 봇 감지 우회를 위한 옵션 추가 (환경 변수로 설정 가능)
    const userAgent = getUserAgent(YOUTUBE_PLAYER_CLIENT);
    const { stdout } = await execAsync(`python3 -m yt_dlp --dump-json --no-warnings --extractor-args "youtube:player_client=${YOUTUBE_PLAYER_CLIENT}" --user-agent "${userAgent}" "${url}"`);
    const info = JSON.parse(stdout);
    
    // 파일 크기 정보 추출 (filesize, filesize_approx, filesize_estimate 순으로 시도)
    const filesize = info.filesize || info.filesize_approx || info.filesize_estimate || null;
    
    console.log('[Server] Video info - filesize:', filesize, 'bytes');
    if (filesize) {
      console.log('[Server] Video info - filesize (MB):', (filesize / (1024 * 1024)).toFixed(2));
    }
    
    res.json({
      title: info.title,
      author: info.uploader || info.channel || '',
      thumbnail: info.thumbnail || '',
      duration: info.duration || 0,
      filesize: filesize, // 예상 파일 크기 (바이트 단위)
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

    // 여러 player_client를 랜덤 순서로 시도 (패턴 감지 방지)
    const shuffledClients = shuffleArray(PLAYER_CLIENTS);
    console.log(`[Server] Trying player_clients in random order: ${shuffledClients.join(' -> ')}`);
    
    let lastError = null;
    let triedClients = [];
    
    for (const playerClient of shuffledClients) {
      triedClients.push(playerClient);
      console.log(`[Server] Trying player_client: ${playerClient} (${triedClients.length}/${shuffledClients.length})`);
      
      try {
        const userAgent = getUserAgent(playerClient);
        const ytdlpProcess = spawn('python3', [
          '-m', 'yt_dlp',
          '-f', 'best/bestvideo+bestaudio',
          '--merge-output-format', 'mp4',
          '--no-warnings',
          '--progress',
          '--extractor-args', `youtube:player_client=${playerClient}`,
          '--retries', '2',
          '--fragment-retries', '2',
          '--user-agent', userAgent,
          '--no-check-certificate',
          '-o', '-',
          url
        ], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let hasStarted = false;
        let isCompleted = false;
        let clientDisconnected = false;
        let isWaitingForDrain = false;
        let hasBotError = false;
        let processKilled = false;
        
        // MaxListeners 경고 방지
        res.setMaxListeners(20);
        
        // 봇 감지 에러를 빠르게 감지하기 위한 Promise
        const botErrorPromise = new Promise((resolve) => {
          const stderrHandler = (data) => {
            const message = data.toString();
            
            // 봇 감지 에러 확인
            if (message.includes('Sign in to confirm you\'re not a bot') || 
                (message.includes('bot') && message.includes('ERROR'))) {
              console.error(`[Server] ❌ ${playerClient} failed: Bot detection error`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'bot_detection', client: playerClient });
              return;
            }
            
            // 포맷 에러 확인
            if (message.includes('Requested format is not available') || 
                message.includes('format is not available')) {
              console.error(`[Server] ❌ ${playerClient} failed: Format not available`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'format_not_available', client: playerClient });
              return;
            }
            
            // 일반 로그
            if (message.includes('[download]') || message.includes('[info]')) {
              console.log(`[Server] yt-dlp (${playerClient}):`, message.trim());
            } else if (message.includes('ERROR') || message.includes('WARNING')) {
              console.error(`[Server] yt-dlp (${playerClient}) error:`, message.trim());
            } else {
              console.log(`[Server] yt-dlp (${playerClient}):`, message.trim());
            }
          };
          
          ytdlpProcess.stderr.on('data', stderrHandler);
        });
        
        // 성공적으로 시작되었는지 확인하기 위한 Promise
        const startPromise = new Promise((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!hasStarted && !hasBotError && !resolved) {
              console.log(`[Server] ⚠️ ${playerClient} did not start within 5 seconds`);
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              resolved = true;
              resolve({ error: 'timeout', client: playerClient });
            }
          }, 5000);
          
          const stdoutHandler = (chunk) => {
            if (!hasBotError && !resolved) {
              if (!res.headersSent) {
                res.writeHead(200);
                hasStarted = true;
                clearTimeout(timeout);
                resolved = true;
                resolve({ success: true, client: playerClient });
              }
              
              if (!res.destroyed && !clientDisconnected && !hasBotError) {
                try {
                  const canContinue = res.write(chunk);
                  if (!canContinue && !isWaitingForDrain) {
                    isWaitingForDrain = true;
                    res.once('drain', () => {
                      isWaitingForDrain = false;
                    });
                  }
                } catch (error) {
                  console.error('[Server] Error writing chunk:', error);
                  clientDisconnected = true;
                }
              }
            }
          };
          
          ytdlpProcess.stdout.on('data', stdoutHandler);
          
          ytdlpProcess.stdout.on('end', () => {
            isCompleted = true;
            if (!res.destroyed && !clientDisconnected) {
              res.end();
            }
            console.log(`[Server] ✅ Video stream completed with ${playerClient}`);
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              resolve({ success: true, completed: true, client: playerClient });
            }
          });
        });
        
        // 프로세스 종료 처리
        ytdlpProcess.on('error', (error) => {
          console.error(`[Server] Process error (${playerClient}):`, error);
          lastError = error;
        });
        
        ytdlpProcess.on('close', (code, signal) => {
          if (code !== 0 && code !== null && !isCompleted && !hasBotError) {
            console.log(`[Server] yt-dlp (${playerClient}) exited with code: ${code}`);
          }
        });
        
        // 봇 에러 또는 시작 중 하나가 먼저 발생
        const result = await Promise.race([botErrorPromise, startPromise]);
        
        if (result.error) {
          // 에러 발생 - 다음 client로 시도 (짧은 지연 후)
          console.log(`[Server] ⚠️ ${playerClient} failed, trying next client...`);
          lastError = new Error(`Failed with ${playerClient}: ${result.error}`);
          
          // 다음 client로 전환하기 전에 짧은 지연 (패턴 감지 방지)
          if (triedClients.length < shuffledClients.length) {
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500)); // 0.5~1초 랜덤 지연
          }
          continue;
        }
        
        if (result.success) {
          // 성공적으로 시작됨 - 이 client로 계속 진행
          console.log(`[Server] ✅ Successfully started with ${playerClient}`);
          
          // 클라이언트 연결 종료 시 처리
          req.on('close', () => {
            if (!clientDisconnected) {
              clientDisconnected = true;
              console.log('[Server] Client disconnected, but keeping yt-dlp process running');
            }
          });
          
          // 응답 종료 시에도 프로세스는 계속 실행
          res.on('close', () => {
            if (!isCompleted && ytdlpProcess && !ytdlpProcess.killed) {
              console.log('[Server] Response closed, but yt-dlp will continue');
            }
          });
          
          return; // 성공 - 함수 종료
        }
        
      } catch (error) {
        console.error(`[Server] Error with ${playerClient}:`, error);
        lastError = error;
        continue; // 다음 client로
      }
    }
    
    // 모든 client가 실패한 경우
    console.error('[Server] ❌ All player_clients failed');
    if (!res.headersSent) {
      res.status(500).json({ 
        error: '모든 player_client 시도가 실패했습니다.',
        triedClients: triedClients,
        lastError: lastError?.message 
      });
    }
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
    // Railway 서버 환경을 고려한 더 유연한 포맷 선택
    // Railway의 클라우드 IP는 YouTube에서 제한을 받을 수 있어 여러 폴백 옵션 제공
    // 더 유연한 포맷 선택: 오디오 전용 포맷부터 비디오+오디오까지 다양한 옵션 시도
    // 포맷 선택자 우선순위:
    // 1. bestaudio (모든 오디오 포맷)
    // 2. bestaudio[ext=m4a] (M4A 오디오)
    // 3. bestaudio[ext=mp3] (MP3 오디오)
    // 4. bestaudio[ext=webm] (WebM 오디오)
    // 5. bestaudio[ext=opus] (Opus 오디오)
    // 6. best[height<=720]/bestvideo[height<=720]+bestaudio (저화질 비디오+오디오)
    // 7. best (최고 품질, 비디오+오디오)
    let formatSelector = 'bestaudio/bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio[ext=webm]/bestaudio[ext=opus]/best[height<=720]/bestvideo[height<=720]+bestaudio/best';
    
    // 여러 player_client를 랜덤 순서로 시도 (패턴 감지 방지)
    const shuffledClients = shuffleArray(PLAYER_CLIENTS);
    console.log(`[Server] Trying player_clients in random order: ${shuffledClients.join(' -> ')}`);
    
    let lastError = null;
    let triedClients = [];
    
    for (const playerClient of shuffledClients) {
      triedClients.push(playerClient);
      console.log(`[Server] Trying player_client: ${playerClient} (${triedClients.length}/${shuffledClients.length})`);
      
      try {
        const userAgent = getUserAgent(playerClient);
        const ytdlpProcess = spawn('python3', [
          '-m', 'yt_dlp',
          '-f', formatSelector,
          '--no-warnings',
          '--progress',
          '--extractor-args', `youtube:player_client=${playerClient}`,
          '--retries', '2',
          '--fragment-retries', '2',
          '--user-agent', userAgent,
          '--no-check-certificate',
          '--no-playlist',
          '-o', '-',
          url
        ], {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let hasStarted = false;
        let isCompleted = false;
        let clientDisconnected = false;
        let isWaitingForDrain = false;
        let hasBotError = false;
        let processKilled = false;
        
        // MaxListeners 경고 방지
        res.setMaxListeners(20);
        
        // 봇 감지 에러를 빠르게 감지하기 위한 Promise
        const botErrorPromise = new Promise((resolve) => {
          const stderrHandler = (data) => {
            const message = data.toString();
            
            // 봇 감지 에러 확인
            if (message.includes('Sign in to confirm you\'re not a bot') || 
                (message.includes('bot') && message.includes('ERROR'))) {
              console.error(`[Server] ❌ ${playerClient} failed: Bot detection error`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'bot_detection', client: playerClient });
              return;
            }
            
            // 포맷 에러 확인
            if (message.includes('Requested format is not available') || 
                message.includes('format is not available')) {
              console.error(`[Server] ❌ ${playerClient} failed: Format not available`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'format_not_available', client: playerClient });
              return;
            }
            
            // 일반 로그
            if (message.includes('[download]') || message.includes('[info]')) {
              console.log(`[Server] yt-dlp (${playerClient}):`, message.trim());
            } else if (message.includes('ERROR') || message.includes('WARNING')) {
              console.error(`[Server] yt-dlp (${playerClient}) error:`, message.trim());
            } else {
              console.log(`[Server] yt-dlp (${playerClient}):`, message.trim());
            }
          };
          
          ytdlpProcess.stderr.on('data', stderrHandler);
        });
        
        // 성공적으로 시작되었는지 확인하기 위한 Promise
        const startPromise = new Promise((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!hasStarted && !hasBotError && !resolved) {
              console.log(`[Server] ⚠️ ${playerClient} did not start within 5 seconds`);
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              resolved = true;
              resolve({ error: 'timeout', client: playerClient });
            }
          }, 5000);
          
          const stdoutHandler = (chunk) => {
            if (!hasBotError && !resolved) {
              if (!res.headersSent) {
                res.writeHead(200);
                hasStarted = true;
                clearTimeout(timeout);
                resolved = true;
                resolve({ success: true, client: playerClient });
              }
              
              if (!res.destroyed && !clientDisconnected && !hasBotError) {
                try {
                  const canContinue = res.write(chunk);
                  if (!canContinue && !isWaitingForDrain) {
                    isWaitingForDrain = true;
                    res.once('drain', () => {
                      isWaitingForDrain = false;
                    });
                  }
                } catch (error) {
                  console.error('[Server] Error writing chunk:', error);
                  clientDisconnected = true;
                }
              }
            }
          };
          
          ytdlpProcess.stdout.on('data', stdoutHandler);
          
          ytdlpProcess.stdout.on('end', () => {
            isCompleted = true;
            if (!res.destroyed && !clientDisconnected) {
              res.end();
            }
            console.log(`[Server] ✅ Audio stream completed with ${playerClient}`);
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              resolve({ success: true, completed: true, client: playerClient });
            }
          });
        });
        
        // 프로세스 종료 처리
        ytdlpProcess.on('error', (error) => {
          console.error(`[Server] Process error (${playerClient}):`, error);
          lastError = error;
        });
        
        ytdlpProcess.on('close', (code, signal) => {
          if (code !== 0 && code !== null && !isCompleted && !hasBotError) {
            console.log(`[Server] yt-dlp (${playerClient}) exited with code: ${code}`);
          }
        });
        
        // 봇 에러 또는 시작 중 하나가 먼저 발생
        const result = await Promise.race([botErrorPromise, startPromise]);
        
        if (result.error) {
          // 에러 발생 - 다음 client로 시도 (짧은 지연 후)
          console.log(`[Server] ⚠️ ${playerClient} failed, trying next client...`);
          lastError = new Error(`Failed with ${playerClient}: ${result.error}`);
          
          // 다음 client로 전환하기 전에 짧은 지연 (패턴 감지 방지)
          if (triedClients.length < shuffledClients.length) {
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500)); // 0.5~1초 랜덤 지연
          }
          continue;
        }
        
        if (result.success) {
          // 성공적으로 시작됨 - 이 client로 계속 진행
          console.log(`[Server] ✅ Successfully started with ${playerClient}`);
          
          // 클라이언트 연결 종료 시 처리
          req.on('close', () => {
            if (!clientDisconnected) {
              clientDisconnected = true;
              console.log('[Server] Client disconnected, but keeping yt-dlp process running');
            }
          });
          
          // 응답 종료 시에도 프로세스는 계속 실행
          res.on('close', () => {
            if (!isCompleted && ytdlpProcess && !ytdlpProcess.killed) {
              console.log('[Server] Response closed, but yt-dlp will continue');
            }
          });
          
          return; // 성공 - 함수 종료
        }
        
      } catch (error) {
        console.error(`[Server] Error with ${playerClient}:`, error);
        lastError = error;
        continue; // 다음 client로
      }
    }
    
    // 모든 client가 실패한 경우
    console.error('[Server] ❌ All player_clients failed');
    if (!res.headersSent) {
      res.status(500).json({ 
        error: '모든 player_client 시도가 실패했습니다.',
        triedClients: triedClients,
        lastError: lastError?.message 
      });
    }
  } catch (error) {
    console.error('[Server] Error downloading audio:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '오디오 다운로드 중 오류가 발생했습니다.' });
    }
  }
});

// YouTube 검색 API (메모리 캐싱 포함)
const searchCache = new Map();
const CACHE_TTL = 1000 * 60 * 60; // 1시간
const MAX_CACHE_SIZE = 1000; // 최대 캐시 항목 수

// YouTube 자동완성 API 캐시
const autocompleteCache = new Map();
const AUTOCOMPLETE_CACHE_TTL = 1000 * 60 * 30; // 30분 (자동완성은 더 짧게)
const MAX_AUTOCOMPLETE_CACHE_SIZE = 500; // 최대 캐시 항목 수

// 일일 제한 (IP별 카운트 관리)
const dailyLimitMap = new Map(); // { ip: { count: number, date: string } }
const DAILY_LIMIT = process.env.DAILY_LIMIT ? parseInt(process.env.DAILY_LIMIT) : 100; // 환경 변수 또는 기본값 100회

// IP 주소 추출
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         'unknown';
};

// 한국 시간(KST, UTC+9) 기준으로 오늘 날짜 가져오기
const getTodayDate = () => {
  const now = new Date();
  // UTC 시간에 9시간 추가 (한국 시간)
  const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return kstTime.toISOString().split('T')[0]; // YYYY-MM-DD
};

app.post('/api/search', async (req, res) => {
  try {
    const { q, maxResults = 20 } = req.body;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ error: '검색어가 필요합니다.' });
    }

    const searchKey = `${q.toLowerCase().trim()}_${maxResults}`;
    
    // 캐시 확인 (메모리) - 캐시 히트면 제한 체크 안 함
    const cached = searchCache.get(searchKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log('[Server] Cache hit for:', q);
      return res.json(cached.data);
    }

    // 캐시 미스 → API 호출 필요 → 일일 제한 체크
    const clientIP = getClientIP(req);
    const today = getTodayDate(); // 한국 시간 기준 오늘 날짜
    const limitData = dailyLimitMap.get(clientIP);

    if (limitData) {
      // 날짜가 바뀌었으면 리셋 (한국 시간 기준 자정에 자동 리셋)
      if (limitData.date !== today) {
        dailyLimitMap.set(clientIP, { count: 1, date: today });
        console.log('[Server] Daily limit reset for IP:', clientIP, 'Date:', today);
      } else {
        // 오늘 제한 초과 체크
        if (limitData.count >= DAILY_LIMIT) {
          console.log('[Server] Daily limit exceeded for IP:', clientIP, 'Count:', limitData.count);
          return res.status(429).json({ 
            error: 'DAILY_LIMIT_EXCEEDED',
            message: '오늘의 검색 요청 횟수가 모두 소진되었습니다. 다운로드 화면을 이용하여 유튜브 영상을 가져오기하세요.'
          });
        }
        // 카운트 증가
        limitData.count++;
      }
    } else {
      // 첫 요청
      dailyLimitMap.set(clientIP, { count: 1, date: today });
    }

    // YouTube Data API 호출
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.error('[Server] YouTube API key not set');
      return res.status(500).json({ error: 'YouTube API 키가 설정되지 않았습니다.' });
    }

    console.log('[Server] Searching YouTube for:', q, 'IP:', clientIP, 'Count:', dailyLimitMap.get(clientIP).count);
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      `part=snippet&type=video&q=${encodeURIComponent(q.trim())}&` +
      `maxResults=${Math.min(maxResults, 50)}&key=${apiKey}`
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('[Server] YouTube API error status:', response.status);
      console.error('[Server] YouTube API error body:', JSON.stringify(error, null, 2));
      const errorMessage = error.error?.message || error.message || '검색에 실패했습니다.';
      console.error('[Server] YouTube API error message:', errorMessage);
      
      // YouTube API 할당량 초과 감지
      if (errorMessage.includes('quota') || errorMessage.includes('Quota exceeded') || errorMessage.includes('Daily Limit') || response.status === 403) {
        console.error('[Server] YouTube API quota exceeded - using code 88');
        return res.status(429).json({ 
          error: 'DAILY_LIMIT_EXCEEDED',
          message: '오늘의 검색 요청 횟수가 모두 소진되었습니다. 다운로드 화면을 이용하여 유튜브 영상을 가져오기하세요. (코드: 88)'
        });
      }
      
      return res.status(response.status).json({ 
        error: errorMessage
      });
    }

    const data = await response.json();
    
    // 캐시 저장
    searchCache.set(searchKey, {
      data: data,
      timestamp: Date.now()
    });

    // 캐시 크기 제한 (메모리 관리)
    if (searchCache.size > MAX_CACHE_SIZE) {
      // 가장 오래된 항목 제거 (FIFO)
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }

    console.log('[Server] Search completed, cache size:', searchCache.size);
    res.json(data);
  } catch (error) {
    console.error('[Server] Search error:', error);
    res.status(500).json({ error: '검색 중 오류가 발생했습니다.' });
  }
});

// YouTube 자동완성 API
app.post('/api/autocomplete', async (req, res) => {
  try {
    const { q } = req.body;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ error: '검색어가 필요합니다.' });
    }

    const query = q.trim().toLowerCase();
    const cacheKey = query;
    
    // 캐시 확인
    const cached = autocompleteCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < AUTOCOMPLETE_CACHE_TTL) {
      console.log('[Server] Autocomplete cache hit for:', q);
      return res.json(cached.data);
    }

    // YouTube Autocomplete API 호출 (무료, API 키 불필요)
    console.log('[Server] Fetching autocomplete for:', q);
    const autocompleteUrl = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q.trim())}`;
    console.log('[Server] Autocomplete URL:', autocompleteUrl);
    
    let response;
    try {
      response = await fetch(autocompleteUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
      console.log('[Server] Autocomplete API response status:', response.status);
    } catch (fetchError) {
      console.error('[Server] Fetch error:', fetchError);
      console.error('[Server] Fetch error message:', fetchError.message);
      console.error('[Server] Fetch error stack:', fetchError?.stack);
      throw new Error(`YouTube Autocomplete API 호출 실패: ${fetchError.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Server] Autocomplete API error status:', response.status);
      console.error('[Server] Autocomplete API error body:', errorText);
      return res.status(response.status).json({ error: '자동완성에 실패했습니다.' });
    }

    // 응답을 텍스트로 먼저 읽기 (JSONP 형식일 수 있음)
    const textResponse = await response.text();
    console.log('[Server] Autocomplete API raw response (first 200 chars):', textResponse.substring(0, 200));
    
    let suggestions = [];
    
    try {
      // JSONP 형식 파싱: window.google.ac.h([query, [suggestions...], ...])
      // 정규식으로 함수 호출 내부의 배열 추출
      const jsonpMatch = textResponse.match(/window\.google\.ac\.h\(\[(.*)\]\)/s);
      
      if (jsonpMatch) {
        // 함수 호출 내부의 배열 부분만 추출
        const arrayStart = textResponse.indexOf('[');
        const arrayEnd = textResponse.lastIndexOf(']');
        
        if (arrayStart !== -1 && arrayEnd !== -1) {
          const arrayString = textResponse.substring(arrayStart, arrayEnd + 1);
          const data = JSON.parse(arrayString);
          
          // 응답 형식: [query, [suggestions...], ...]
          // suggestions는 [["term", 0, [512]], ...] 형식
          if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
            // 각 제안에서 첫 번째 요소(제안어)만 추출
            suggestions = data[1]
              .filter(item => Array.isArray(item) && item.length > 0)
              .map(item => item[0])
              .filter(term => typeof term === 'string');
            
            console.log('[Server] Extracted suggestions count:', suggestions.length);
          }
        }
      } else {
        // 순수 JSON 형식인지 시도
        const data = JSON.parse(textResponse);
        if (Array.isArray(data) && data.length >= 2 && Array.isArray(data[1])) {
          suggestions = data[1]
            .filter(item => Array.isArray(item) && item.length > 0)
            .map(item => item[0])
            .filter(term => typeof term === 'string');
        }
      }
    } catch (parseError) {
      console.error('[Server] Failed to parse autocomplete response:', parseError);
      console.error('[Server] Raw response (first 500 chars):', textResponse.substring(0, 500));
      // 에러가 나도 빈 배열 반환 (치명적이지 않음)
      return res.json([]);
    }
    
    if (suggestions.length === 0) {
      console.warn('[Server] No suggestions extracted from response');
    }
    
    // 캐시 저장
    autocompleteCache.set(cacheKey, {
      data: suggestions,
      timestamp: Date.now()
    });

    // 캐시 크기 제한 (메모리 관리)
    if (autocompleteCache.size > MAX_AUTOCOMPLETE_CACHE_SIZE) {
      // 가장 오래된 항목 제거 (FIFO)
      const firstKey = autocompleteCache.keys().next().value;
      autocompleteCache.delete(firstKey);
    }

    console.log('[Server] Autocomplete completed, cache size:', autocompleteCache.size);
    res.json(suggestions);
  } catch (error) {
    console.error('[Server] Autocomplete error:', error);
    console.error('[Server] Autocomplete error message:', error.message);
    console.error('[Server] Autocomplete error stack:', error.stack);
    console.error('[Server] Autocomplete error name:', error.name);
    
    // 더 자세한 에러 정보 반환 (개발용)
    res.status(500).json({ 
      error: '자동완성 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] YouTube Downloader Server running on port ${PORT}`);
  console.log(`[Server] Accessible at http://localhost:${PORT}`);
});

