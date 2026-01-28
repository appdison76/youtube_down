// API 설정 - install-page config 로드, 이중화(primary 실패 시 Railway)
const CONFIG_URL = 'https://appdison76.github.io/youtube_down/install-page/config.json';
const DEFAULT_RAILWAY = 'https://youtubedown-production.up.railway.app';

let cachedConfig = null;
let configLoadPromise = null;

async function loadConfig() {
  if (cachedConfig) return cachedConfig;
  if (configLoadPromise) return configLoadPromise;
  configLoadPromise = (async () => {
    try {
      const res = await fetch(CONFIG_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('config fetch failed');
      const config = await res.json();
      if (config && (config.apiBaseUrl || (config.apiBaseUrls && config.apiBaseUrls.length > 0))) {
        cachedConfig = config;
        return config;
      }
      throw new Error('invalid config');
    } catch (e) {
      console.warn('[web-app API] Config load failed, using Railway:', e?.message);
      cachedConfig = { apiBaseUrl: DEFAULT_RAILWAY, source: 'default' };
      return cachedConfig;
    }
  })();
  return configLoadPromise;
}

async function getApiBaseUrls() {
  const config = await loadConfig();
  if (config.apiBaseUrls && Array.isArray(config.apiBaseUrls) && config.apiBaseUrls.length > 0) {
    return config.apiBaseUrls.filter(Boolean);
  }
  const primary = config.apiBaseUrl || (window.API_BASE_URL || DEFAULT_RAILWAY);
  return primary === DEFAULT_RAILWAY ? [primary] : [primary, DEFAULT_RAILWAY];
}

async function fetchWithFallback(path, init = {}) {
  const baseUrls = await getApiBaseUrls();
  let lastError = null;
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const url = base + (path.startsWith('/') ? path : '/' + path);
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        if (i > 0) console.log('[web-app API] Fallback succeeded with URL #' + (i + 1), base);
        return res;
      }
      throw new Error('HTTP ' + res.status);
    } catch (e) {
      lastError = e;
      console.warn('[web-app API] Request failed for', base, e?.message);
      if (i < baseUrls.length - 1) console.log('[web-app API] Trying next URL...');
    }
  }
  throw lastError || new Error('All API URLs failed');
}

// 음악 인식 API (이중화)
async function recognizeMusic(audioBlob) {
  const response = await fetchWithFallback('/api/recognize', {
    method: 'POST',
    body: (() => {
      const fd = new FormData();
      fd.append('audio', audioBlob, 'recording.webm');
      return fd;
    })(),
  });
  if (!response.ok) throw new Error('음악 인식에 실패했습니다.');
  return await response.json();
}

// YouTube 검색 API (이중화)
async function searchYouTube(query, maxResults = 20) {
  const response = await fetchWithFallback('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, maxResults }),
  });
  if (!response.ok) throw new Error('검색에 실패했습니다.');
  return await response.json();
}

// YouTube 영상 정보 (이중화)
async function getVideoInfo(url) {
  const response = await fetchWithFallback('/api/video-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error('영상 정보를 가져오는데 실패했습니다.');
  return await response.json();
}

// 다운로드 URL 반환 (기존 호환 - 첫 번째 base만 사용)
async function getDownloadBaseUrl() {
  const urls = await getApiBaseUrls();
  return urls[0].replace(/\/$/, '');
}

// 웹: 다운로드는 Railway만 사용 (ngrok 요청 시 브라우저가 그 페이지로 이동하는 문제 완전 회피)
async function getDownloadBaseUrls() {
  return [DEFAULT_RAILWAY.replace(/\/$/, '')];
}

function downloadVideo(url) {
  return getDownloadBaseUrl().then(base => base + '/api/download/video?url=' + encodeURIComponent(url));
}

function downloadAudio(url) {
  return getDownloadBaseUrl().then(base => base + '/api/download/audio?url=' + encodeURIComponent(url));
}

// ngrok 등이 HTML 에러 페이지를 200으로 줄 수 있음 → 실제 미디어인지 검사
async function isLikelyMediaResponse(res, blob) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) return false;
  if (blob && blob.type && blob.type.toLowerCase().includes('text/html')) return false;
  if (blob && blob.size < 5000) return false; // 에러 HTML은 보통 수 KB 이하
  // Content-Type이 없거나 애매할 때: 앞부분이 HTML이면 실패 (Visit Site / ERR_NGROK 등)
  if (blob && blob.size > 0 && blob.size < 500000) {
    const head = await blob.slice(0, 300).text();
    if (/<\s*\!?\s*html|<\s*\!?\s*DOCTYPE|<\s*title|ngrok|Visit Site|ERR_NGROK/i.test(head)) return false;
  }
  return true;
}

// 이중화: 웹은 Railway 먼저 → primary (ngrok 요청 시 페이지 이동 방지)
async function downloadVideoWithFallback(videoUrl, suggestedFileName = 'video.mp4') {
  const baseUrls = await getDownloadBaseUrls();
  let lastError = null;
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const url = base + '/api/download/video?url=' + encodeURIComponent(videoUrl) + '&quality=highestvideo';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (!(await isLikelyMediaResponse(res, blob))) throw new Error('Invalid response (e.g. ngrok error page)');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = suggestedFileName || 'video.mp4';
      a.click();
      URL.revokeObjectURL(a.href);
      if (i > 0) console.log('[web-app API] Download fallback succeeded with URL #' + (i + 1));
      return;
    } catch (e) {
      lastError = e;
      console.warn('[web-app API] Video download failed for URL #' + (i + 1), e?.message);
      if (i < baseUrls.length - 1) console.log('[web-app API] Trying next URL...');
    }
  }
  throw lastError || new Error('다운로드에 실패했습니다.');
}

async function downloadAudioWithFallback(videoUrl, suggestedFileName = 'audio.m4a') {
  const baseUrls = await getDownloadBaseUrls();
  let lastError = null;
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const url = base + '/api/download/audio?url=' + encodeURIComponent(videoUrl) + '&quality=highestaudio';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (!(await isLikelyMediaResponse(res, blob))) throw new Error('Invalid response (e.g. ngrok error page)');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = suggestedFileName || 'audio.m4a';
      a.click();
      URL.revokeObjectURL(a.href);
      if (i > 0) console.log('[web-app API] Download fallback succeeded with URL #' + (i + 1));
      return;
    } catch (e) {
      lastError = e;
      console.warn('[web-app API] Audio download failed for URL #' + (i + 1), e?.message);
      if (i < baseUrls.length - 1) console.log('[web-app API] Trying next URL...');
    }
  }
  throw lastError || new Error('다운로드에 실패했습니다.');
}
