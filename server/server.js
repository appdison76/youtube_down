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
    // Railway 서버 환경을 고려한 더 유연한 포맷 선택
    // Railway의 클라우드 IP는 YouTube에서 제한을 받을 수 있어 여러 폴백 옵션 제공
    // 1순위: bestaudio (오디오 전용), 2순위: best[height<=480] (저화질 비디오+오디오), 3순위: best (최고 품질)
    // 이렇게 하면 Railway 서버에서도 안정적으로 작동함
    const ytdlpProcess = spawn('python3', [
      '-m', 'yt_dlp',
      '-f', 'bestaudio/best[height<=480]/best',
      '--no-warnings',
      '--progress',
      '--extractor-args', 'youtube:player_client=android',
      '--retries', '3',
      '--fragment-retries', '3',
      '--user-agent', 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
      '--no-playlist',
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

    // 응답을 텍스트로 먼저 읽기 (JSON이 아닐 수 있음)
    const textResponse = await response.text();
    console.log('[Server] Autocomplete API raw response (first 200 chars):', textResponse.substring(0, 200));
    
    let data;
    try {
      // JSONP 형식일 수 있으므로 먼저 JSON 파싱 시도
      data = JSON.parse(textResponse);
      console.log('[Server] Autocomplete API response type:', Array.isArray(data) ? 'array' : typeof data);
      console.log('[Server] Autocomplete API response length:', Array.isArray(data) ? data.length : 'N/A');
    } catch (parseError) {
      console.error('[Server] Failed to parse autocomplete response as JSON:', parseError);
      console.error('[Server] Raw response:', textResponse.substring(0, 500));
      
      // JSONP 형식인지 확인 (예: window.google.ac.h(...))
      // 또는 다른 형식일 수 있으므로 빈 배열 반환
      console.warn('[Server] Autocomplete response is not valid JSON, returning empty suggestions');
      return res.json([]);
    }
    
    // 응답 형식: [query, [suggestions...], ...]
    if (!Array.isArray(data) || data.length < 2) {
      console.error('[Server] Unexpected autocomplete response format:', data);
      return res.status(500).json({ error: '자동완성 응답 형식이 올바르지 않습니다.' });
    }
    
    const suggestions = Array.isArray(data[1]) ? data[1] : [];
    console.log('[Server] Extracted suggestions count:', suggestions.length);
    
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

