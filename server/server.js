const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);
const { middleware: requestLoggerMiddleware, getRecent, getRecentFromFile, LOG_PATH, LOG_DIR, MAX_LOG_SIZE } = require('./request-logger');

const app = express();
const PORT = process.env.PORT || 3000;

// 프록시 설정 (환경 변수에서 읽기)
// 예: PROXY_URL=http://proxy.example.com:8080 또는 PROXY_URL=socks5://proxy.example.com:1080
const PROXY_URL = process.env.PROXY_URL || process.env.YTDLP_PROXY || null;

if (PROXY_URL) {
  console.log(`[Server] 프록시 사용: ${PROXY_URL}`);
} else {
  console.log('[Server] 프록시 미사용 (직접 연결)');
}
if (LOG_PATH) {
  const maxSizeMB = Math.round(MAX_LOG_SIZE / 1024 / 1024);
  console.log(`[Server] 요청 로그 파일 저장: ${LOG_PATH} (리스타트 후에도 유지, 최대 ${maxSizeMB}MB)`);
} else {
  console.log('[Server] 요청 로그: 메모리만 사용 (LOG_DIR 또는 Railway Volume 미설정)');
}

// yt-dlp 인자 배열에 프록시 옵션 추가하는 헬퍼 함수
const addProxyArgs = (args) => {
  if (PROXY_URL) {
    args.push('--proxy', PROXY_URL);
  }
  return args;
};

// 여러 player_client를 순차적으로 시도 (봇 감지 우회)
// 매 요청마다 랜덤 순서로 시도하여 패턴 감지 방지
// 더 많은 옵션을 추가하여 차단 확률 감소
const PLAYER_CLIENTS = [
  'android',        // 가장 안정적으로 작동 (테스트 결과 확인)
  'ios', 
  'web'
  // 제거된 클라이언트:
  // - 'mweb': 테스트에서 실패
  // - 'tv_embedded': "This video is unavailable" 오류
  // - 'web_embedded': "This video is unavailable" 오류
  // - 'android_embedded': 403 Forbidden 오류가 자주 발생
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
    default:
      return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }
};

console.log(`[Server] Will try player_clients in order: ${PLAYER_CLIENTS.join(' -> ')}`);

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(requestLoggerMiddleware);

// IP 차단 테스트 엔드포인트
app.get('/api/test-ip', async (req, res) => {
  try {
    console.log('[Server] ===== IP Block Test =====');
    
    // 간단한 YouTube URL로 테스트
    const testUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // 짧은 테스트 영상
    
    const results = [];
    
    for (const playerClient of PLAYER_CLIENTS) {
      try {
        console.log(`[Server] Testing ${playerClient}...`);
        const userAgent = getUserAgent(playerClient);
        
        // yt-dlp로 간단한 정보만 가져오기 (다운로드 없이)
        // spawn을 사용하여 인자를 안전하게 전달
        const { spawn } = require('child_process');
        
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';
        
        try {
          const args = [
            '-m', 'yt_dlp',
            '--dump-json',
            '--no-warnings',
            '--extractor-args', `youtube:player_client=${playerClient}`,
            '--user-agent', userAgent,
            '--no-check-certificate',
            '--retries', '3',
            '--fragment-retries', '3',
            '--socket-timeout', '30',
            testUrl
          ];
          addProxyArgs(args);
          const ytdlpProcess = spawn('python3', args, {
            stdio: ['ignore', 'pipe', 'pipe']
          });
          
          // stdout 수집
          ytdlpProcess.stdout.on('data', (data) => {
            stdout += data.toString();
          });
          
          // stderr 수집
          ytdlpProcess.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          
          // 프로세스 완료 대기
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              ytdlpProcess.kill('SIGTERM');
              reject(new Error('Timeout'));
            }, 10000);
            
            ytdlpProcess.on('close', (code) => {
              clearTimeout(timeout);
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`Process exited with code ${code}: ${stderr}`));
              }
            });
            
            ytdlpProcess.on('error', (error) => {
              clearTimeout(timeout);
              reject(error);
            });
          });
          
          const duration = Date.now() - startTime;
          results.push({
            client: playerClient,
            status: 'success',
            duration: `${duration}ms`,
            hasTitle: stdout.includes('"title"')
          });
          console.log(`[Server] ✅ ${playerClient}: Success (${duration}ms)`);
        } catch (error) {
          const duration = Date.now() - startTime;
          const errorMsg = error.message || stderr || String(error);
          const isBotError = errorMsg.includes('bot') || errorMsg.includes('Sign in');
          
          results.push({
            client: playerClient,
            status: isBotError ? 'bot_detected' : 'error',
            duration: `${duration}ms`,
            error: errorMsg.substring(0, 200) // 처음 200자만
          });
          console.log(`[Server] ❌ ${playerClient}: ${isBotError ? 'Bot detected' : 'Error'} (${duration}ms)`);
        }
      } catch (error) {
        results.push({
          client: playerClient,
          status: 'error',
          error: error.message
        });
      }
    }
    
    // 결과 요약
    const successCount = results.filter(r => r.status === 'success').length;
    const botDetectedCount = results.filter(r => r.status === 'bot_detected').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    const summary = {
      total: PLAYER_CLIENTS.length,
      success: successCount,
      botDetected: botDetectedCount,
      errors: errorCount,
      isBlocked: botDetectedCount === PLAYER_CLIENTS.length, // 모든 client가 봇 감지되면 IP 차단 가능성
      results: results
    };
    
    console.log('[Server] Test Summary:', summary);
    
    res.json({
      message: 'IP 차단 테스트 완료',
      summary: summary,
      recommendation: summary.isBlocked 
        ? '모든 player_client가 봇 감지되었습니다. IP가 차단되었을 가능성이 높습니다. 몇 시간 후 다시 시도하거나 다른 서버를 사용하세요.'
        : successCount > 0 
        ? `${successCount}개의 player_client가 작동합니다.`
        : '일부 player_client는 작동하지만 모두 실패했습니다.'
    });
    
  } catch (error) {
    console.error('[Server] Error in IP test:', error);
    res.status(500).json({ error: '테스트 중 오류가 발생했습니다.', details: error.message });
  }
});

// 다운로드 디렉토리 생성
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// YouTube 영상 정보 가져오기
app.post('/api/video-info', async (req, res) => {
  try {
    console.log('[Server] ===== Video info request received =====');
    console.log('[Server] Request body type:', typeof req.body);
    console.log('[Server] Request body:', req.body);
    console.log('[Server] Headers:', req.headers);
    
    // JSON 파싱 오류 처리
    if (!req.body || typeof req.body !== 'object') {
      console.error('[Server] ❌ Invalid request body:', req.body);
      return res.status(400).json({ error: '잘못된 요청 형식입니다.' });
    }
    
    const { url } = req.body;
    
    if (!url) {
      console.error('[Server] ❌ URL missing in request body');
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    console.log('[Server] Getting video info for:', url);
    
    // yt-dlp를 사용하여 영상 정보 가져오기
    // 여러 player_client를 시도하여 정보 가져오기
    let info = null;
    let lastError = null;
    
    for (const playerClient of PLAYER_CLIENTS) {
      try {
        console.log(`[Server] Trying to get video info with ${playerClient}...`);
        const userAgent = getUserAgent(playerClient);
        
        // spawn을 사용하여 안전하게 실행
        const { spawn } = require('child_process');
        let stdout = '';
        let stderr = '';
        
        const args = [
          '-m', 'yt_dlp',
          '--dump-json',
          '--no-warnings',
          '--extractor-args', `youtube:player_client=${playerClient}`,
          '--user-agent', userAgent,
          '--no-check-certificate',
          '--retries', '3',
          '--fragment-retries', '3',
          '--socket-timeout', '30',
          '--extractor-retries', '3',
          '--sleep-interval', '1',
          '--max-sleep-interval', '3',
          '--sleep-subtitles', '1',
          '--referer', 'https://www.youtube.com/',
          '--add-header', 'Accept-Language:en-US,en;q=0.9',
          '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          url
        ];
        addProxyArgs(args);
        const ytdlpProcess = spawn('python3', args, {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        ytdlpProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        ytdlpProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            ytdlpProcess.kill('SIGTERM');
            reject(new Error('Timeout'));
          }, 15000);
          
          ytdlpProcess.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Process exited with code ${code}: ${stderr}`));
            }
          });
          
          ytdlpProcess.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });
        
        info = JSON.parse(stdout);
        console.log(`[Server] ✅ Successfully got video info with ${playerClient}`);
        break; // 성공하면 중단
      } catch (error) {
        const errorMsg = error.message || stderr || String(error);
        console.log(`[Server] ❌ Failed with ${playerClient}: ${errorMsg.substring(0, 100)}`);
        lastError = error;
        
        // 봇 감지 에러가 아니면 계속 시도
        if (!errorMsg.includes('bot') && !errorMsg.includes('Sign in')) {
          continue;
        }
      }
    }
    
    if (!info) {
      throw lastError || new Error('모든 player_client로 정보를 가져올 수 없습니다.');
    }
    
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

    // 다운로드 시작 전 지연 (패턴 감지 방지) - 더 긴 지연
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // 헤더 설정
    res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');

    // android를 먼저 시도 (가장 안정적), 실패 시 나머지 랜덤 순서로 시도
    const androidFirst = ['android', ...shuffleArray(PLAYER_CLIENTS.filter(c => c !== 'android'))];
    console.log(`[Server] Trying player_clients: ${androidFirst.join(' -> ')}`);
    
    let lastError = null;
    let triedClients = [];
    
    for (const playerClient of androidFirst) {
      triedClients.push(playerClient);
      console.log(`[Server] Trying player_client: ${playerClient} (${triedClients.length}/${androidFirst.length})`);
      
      try {
        const userAgent = getUserAgent(playerClient);
        // 더 유연한 포맷 선택자: 여러 화질 옵션과 폴백 제공
        const formatSelector = 'best/bestvideo+bestaudio/best[height<=1080]/bestvideo[height<=1080]+bestaudio/best[height<=720]/bestvideo[height<=720]+bestaudio/best[height<=480]/bestvideo[height<=480]+bestaudio/worst';
        const args = [
          '-m', 'yt_dlp',
          '-f', formatSelector,
          '--merge-output-format', 'mp4',
          '--no-warnings',
          '--progress',
          '--extractor-args', `youtube:player_client=${playerClient}`,
          '--retries', '3',
          '--fragment-retries', '3',
          '--socket-timeout', '30',
          '--extractor-retries', '3',
          '--sleep-interval', '1',
          '--max-sleep-interval', '3',
          '--http-chunk-size', '10M',
          '--concurrent-fragments', '1',
          '--throttled-rate', '1M',
          '--user-agent', userAgent,
          '--referer', 'https://www.youtube.com/',
          '--add-header', 'Accept-Language:en-US,en;q=0.9',
          '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          '--no-check-certificate',
          '-o', '-',
          url
        ];
        addProxyArgs(args);
        const ytdlpProcess = spawn('python3', args, {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let hasStarted = false;
        let isCompleted = false;
        let clientDisconnected = false;
        let isWaitingForDrain = false;
        let hasBotError = false;
        let processKilled = false;
        let startTimeout = null;
        let startResolve = null;
        let fragmentFailureCount = 0;
        const MAX_FRAGMENT_FAILURES = 3; // 3개 이상 프래그먼트 실패 시 다른 클라이언트로 전환 (403 에러 대응)
        
        // MaxListeners 경고 방지
        res.setMaxListeners(20);
        
        // 봇 감지 에러를 빠르게 감지하기 위한 Promise
        const botErrorPromise = new Promise((resolve) => {
          const stderrHandler = (data) => {
            const message = data.toString();
            
            // 다운로드 시작 감지 - [download] 메시지가 나오면 시작된 것으로 간주
            if (message.includes('[download]') && !hasStarted && !hasBotError && startResolve) {
              hasStarted = true;
              if (startTimeout) {
                clearTimeout(startTimeout);
              }
              if (!res.headersSent) {
                res.writeHead(200);
              }
              startResolve({ success: true, client: playerClient });
            }
            
            // 프래그먼트 실패 감지 (403 Forbidden 등)
            if (message.includes('fragment not found') || 
                (message.includes('Got error') && message.includes('403')) ||
                (message.includes('HTTP Error 403')) ||
                (message.includes('unable to download video data') && message.includes('403'))) {
              fragmentFailureCount++;
              console.warn(`[Server] ⚠️ ${playerClient} fragment failure count: ${fragmentFailureCount}`);
              
              // 403 Forbidden은 즉시 다른 클라이언트로 전환 (IP 차단 가능성)
              if (message.includes('403') || message.includes('Forbidden')) {
                console.error(`[Server] ❌ ${playerClient} failed: 403 Forbidden detected`);
                hasBotError = true;
                if (!processKilled) {
                  processKilled = true;
                  ytdlpProcess.kill('SIGTERM');
                }
                ytdlpProcess.stderr.removeListener('data', stderrHandler);
                resolve({ error: '403_forbidden', client: playerClient });
                return;
              }
              
              // 너무 많은 프래그먼트 실패 시 다른 클라이언트로 전환
              if (fragmentFailureCount >= MAX_FRAGMENT_FAILURES && !hasBotError) {
                console.error(`[Server] ❌ ${playerClient} failed: Too many fragment failures (${fragmentFailureCount})`);
                hasBotError = true;
                if (!processKilled) {
                  processKilled = true;
                  ytdlpProcess.kill('SIGTERM');
                }
                ytdlpProcess.stderr.removeListener('data', stderrHandler);
                resolve({ error: 'too_many_fragment_failures', client: playerClient });
                return;
              }
            }
            
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
            
            // 비디오 사용 불가 오류 확인
            if (message.includes('This video is unavailable') || 
                message.includes('video is unavailable') ||
                message.includes('Video unavailable')) {
              console.error(`[Server] ❌ ${playerClient} failed: Video unavailable`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'video_unavailable', client: playerClient });
              return;
            }
            
            // 포맷을 찾을 수 없음 오류 확인
            if (message.includes('No video formats found') || 
                message.includes('No formats found')) {
              console.error(`[Server] ❌ ${playerClient} failed: No formats found`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'no_formats_found', client: playerClient });
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
          startResolve = resolve;
          let resolved = false;
          startTimeout = setTimeout(() => {
            if (!hasStarted && !hasBotError && !resolved) {
              console.log(`[Server] ⚠️ ${playerClient} did not start within 10 seconds`);
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              resolved = true;
              resolve({ error: 'timeout', client: playerClient });
            }
          }, 10000); // 5초 -> 10초로 증가
          
          const stdoutHandler = (chunk) => {
            if (!hasBotError && !resolved) {
              if (!res.headersSent) {
                res.writeHead(200);
                hasStarted = true;
                if (startTimeout) {
                  clearTimeout(startTimeout);
                }
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
            if (startTimeout) {
              clearTimeout(startTimeout);
            }
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
          
          // 다음 client로 전환하기 전에 지연 (패턴 감지 방지) - 더 긴 지연
          if (triedClients.length < androidFirst.length) {
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000)); // 1~3초 랜덤 지연
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

    // 다운로드 시작 전 지연 (패턴 감지 방지) - 더 긴 지연
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    // 헤더 설정
    res.setHeader('Content-Disposition', 'attachment; filename="audio.m4a"');
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Transfer-Encoding', 'chunked');

    // yt-dlp를 사용하여 오디오 다운로드 및 스트리밍
    // Railway 서버 환경을 고려한 더 유연한 포맷 선택
    // Railway의 클라우드 IP는 YouTube에서 제한을 받을 수 있어 여러 폴백 옵션 제공
    // 오디오 전용 포맷 우선 시도 (용량 절약)
    // 포맷 선택자 우선순위:
    // 1. bestaudio (모든 오디오 포맷) - 최우선
    // 2. bestaudio[ext=m4a] (M4A 오디오, 가장 작은 용량)
    // 3. bestaudio[ext=opus] (Opus 오디오, 작은 용량)
    // 4. bestaudio[ext=webm] (WebM 오디오)
    // 5. bestaudio[ext=mp3] (MP3 오디오)
    // 주의: 오디오만 선택 시 일부 영상에서 "format not available" 오류 발생 가능
    //       하지만 스트리밍 모드에서 --extract-audio가 제대로 작동하지 않으므로
    //       오디오만 포맷을 우선 시도하고, 실패 시에만 비디오+오디오로 폴백
    //       비디오+오디오 폴백 시에는 용량이 크지만 안정성을 위해 필요
    // 다운로드 성공을 최우선으로 하는 포맷 선택자
    // 오디오만 포맷을 빠르게 시도하되, 실패 시 즉시 비디오+오디오로 폴백
    // 포맷 선택자 우선순위:
    // 1. 오디오만 포맷 (최소한으로 시도, 용량 절약)
    // 2. 비디오+오디오 폴백 (240p → 360p → 480p → 720p → 최고품질)
    //    반드시 받을 수 있도록 보장 (다운로드 성공이 최우선)
    let formatSelector = 'bestaudio/best[height<=240]/bestvideo[height<=240]+bestaudio/best[height<=360]/bestvideo[height<=360]+bestaudio/best[height<=480]/bestvideo[height<=480]+bestaudio/best[height<=720]/bestvideo[height<=720]+bestaudio/best';
    
    // android를 먼저 시도 (가장 안정적), 실패 시 나머지 랜덤 순서로 시도
    const androidFirst = ['android', ...shuffleArray(PLAYER_CLIENTS.filter(c => c !== 'android'))];
    console.log(`[Server] Trying player_clients: ${androidFirst.join(' -> ')}`);
    
    let lastError = null;
    let triedClients = [];
    
    for (const playerClient of androidFirst) {
      triedClients.push(playerClient);
      console.log(`[Server] Trying player_client: ${playerClient} (${triedClients.length}/${androidFirst.length})`);
      
      try {
        const userAgent = getUserAgent(playerClient);
        const args = [
          '-m', 'yt_dlp',
          '-f', formatSelector,
          '--no-warnings',
          '--progress',
          '--extractor-args', `youtube:player_client=${playerClient}`,
          '--retries', '3',
          '--fragment-retries', '3',
          '--socket-timeout', '30',
          '--extractor-retries', '3',
          '--sleep-interval', '1',
          '--max-sleep-interval', '3',
          '--http-chunk-size', '10M',
          '--concurrent-fragments', '1',
          '--throttled-rate', '1M',
          '--user-agent', userAgent,
          '--referer', 'https://www.youtube.com/',
          '--add-header', 'Accept-Language:en-US,en;q=0.9',
          '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          '--no-check-certificate',
          '--no-playlist',
          // 스트리밍 모드에서는 --extract-audio가 제대로 작동하지 않을 수 있음
          // 대신 포맷 선택자를 더 엄격하게 하여 오디오만 받도록 시도
          // 비디오+오디오로 폴백 시에도 오디오만 추출하려면
          // 임시 파일로 저장 후 추출하는 방식이 필요하지만, 스트리밍에서는 복잡함
          // 따라서 포맷 선택자를 더 엄격하게 수정
          '-o', '-',
          url
        ];
        addProxyArgs(args);
        const ytdlpProcess = spawn('python3', args, {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let hasStarted = false;
        let isCompleted = false;
        let clientDisconnected = false;
        let isWaitingForDrain = false;
        let hasBotError = false;
        let processKilled = false;
        let startTimeout = null;
        let startResolve = null;
        let fragmentFailureCount = 0;
        const MAX_FRAGMENT_FAILURES = 3; // 3개 이상 프래그먼트 실패 시 다른 클라이언트로 전환 (403 에러 대응)
        
        // MaxListeners 경고 방지
        res.setMaxListeners(20);
        
        // 봇 감지 에러를 빠르게 감지하기 위한 Promise
        const botErrorPromise = new Promise((resolve) => {
          const stderrHandler = (data) => {
            const message = data.toString();
            
            // 다운로드 시작 감지 - [download] 메시지가 나오면 시작된 것으로 간주
            if (message.includes('[download]') && !hasStarted && !hasBotError && startResolve) {
              hasStarted = true;
              if (startTimeout) {
                clearTimeout(startTimeout);
              }
              if (!res.headersSent) {
                res.writeHead(200);
              }
              startResolve({ success: true, client: playerClient });
            }
            
            // 프래그먼트 실패 감지 (403 Forbidden 등)
            if (message.includes('fragment not found') || 
                (message.includes('Got error') && message.includes('403')) ||
                (message.includes('HTTP Error 403')) ||
                (message.includes('unable to download video data') && message.includes('403'))) {
              fragmentFailureCount++;
              console.warn(`[Server] ⚠️ ${playerClient} fragment failure count: ${fragmentFailureCount}`);
              
              // 403 Forbidden은 즉시 다른 클라이언트로 전환 (IP 차단 가능성)
              if (message.includes('403') || message.includes('Forbidden')) {
                console.error(`[Server] ❌ ${playerClient} failed: 403 Forbidden detected`);
                hasBotError = true;
                if (!processKilled) {
                  processKilled = true;
                  ytdlpProcess.kill('SIGTERM');
                }
                ytdlpProcess.stderr.removeListener('data', stderrHandler);
                resolve({ error: '403_forbidden', client: playerClient });
                return;
              }
              
              // 너무 많은 프래그먼트 실패 시 다른 클라이언트로 전환
              if (fragmentFailureCount >= MAX_FRAGMENT_FAILURES && !hasBotError) {
                console.error(`[Server] ❌ ${playerClient} failed: Too many fragment failures (${fragmentFailureCount})`);
                hasBotError = true;
                if (!processKilled) {
                  processKilled = true;
                  ytdlpProcess.kill('SIGTERM');
                }
                ytdlpProcess.stderr.removeListener('data', stderrHandler);
                resolve({ error: 'too_many_fragment_failures', client: playerClient });
                return;
              }
            }
            
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
            
            // 비디오 사용 불가 오류 확인
            if (message.includes('This video is unavailable') || 
                message.includes('video is unavailable') ||
                message.includes('Video unavailable')) {
              console.error(`[Server] ❌ ${playerClient} failed: Video unavailable`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'video_unavailable', client: playerClient });
              return;
            }
            
            // 포맷을 찾을 수 없음 오류 확인
            if (message.includes('No video formats found') || 
                message.includes('No formats found')) {
              console.error(`[Server] ❌ ${playerClient} failed: No formats found`);
              hasBotError = true;
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              ytdlpProcess.stderr.removeListener('data', stderrHandler);
              resolve({ error: 'no_formats_found', client: playerClient });
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
          startResolve = resolve;
          let resolved = false;
          startTimeout = setTimeout(() => {
            if (!hasStarted && !hasBotError && !resolved) {
              console.log(`[Server] ⚠️ ${playerClient} did not start within 10 seconds`);
              if (!processKilled) {
                processKilled = true;
                ytdlpProcess.kill('SIGTERM');
              }
              resolved = true;
              resolve({ error: 'timeout', client: playerClient });
            }
          }, 10000); // 5초 -> 10초로 증가
          
          const stdoutHandler = (chunk) => {
            if (!hasBotError && !resolved) {
              if (!res.headersSent) {
                res.writeHead(200);
                hasStarted = true;
                if (startTimeout) {
                  clearTimeout(startTimeout);
                }
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
            if (startTimeout) {
              clearTimeout(startTimeout);
            }
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
          
          // 다음 client로 전환하기 전에 지연 (패턴 감지 방지) - 더 긴 지연
          if (triedClients.length < androidFirst.length) {
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000)); // 1~3초 랜덤 지연
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
// 관리자용 요청 로그 조회 (리스타트 후 사용자 사용 여부 확인)
// LOG_DIR(또는 Railway Volume) 설정 시 requests.log 파일에도 저장되어 재시작 후에도 확인 가능
const ADMIN_SECRET = process.env.ADMIN_SECRET || null;
app.get('/api/admin/requests', (req, res) => {
  if (!ADMIN_SECRET) {
    return res.status(404).json({ error: 'ADMIN_SECRET 미설정' });
  }
  const key = req.query.key;
  if (key !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const fromFile = req.query.fromFile === '1' || req.query.fromFile === 'true';
  const fromDate = req.query.fromDate || null; // ISO 8601 형식: 2026-01-28T00:00:00Z
  const toDate = req.query.toDate || null;     // ISO 8601 형식: 2026-01-28T23:59:59Z
  const recent = fromFile ? getRecentFromFile(limit, fromDate, toDate) : getRecent(limit);
  res.json({
    count: recent.length,
    source: fromFile ? 'file' : 'memory',
    logFile: LOG_PATH || null,
    fromDate: fromDate || null,
    toDate: toDate || null,
    requests: recent,
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 관리자 로그 조회 웹 UI
app.get('/admin/logs', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-logs.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] YouTube Downloader Server running on port ${PORT}`);
  console.log(`[Server] Accessible at http://localhost:${PORT}`);
  console.log(`[Server] Admin logs UI: http://localhost:${PORT}/admin/logs`);
});
