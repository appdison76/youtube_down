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

// ngrok 인터스티셜 회피용 헤더 (무료 구간) - fetchWithFallback에서도 사용
const NGROK_HEADERS = { 'ngrok-skip-browser-warning': 'true' };

async function fetchWithFallback(path, init = {}) {
  const baseUrls = await getApiBaseUrls();
  let lastError = null;
  const headers = { ...NGROK_HEADERS, ...init.headers };
  const initWithNgrok = { ...init, headers };
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const url = base + (path.startsWith('/') ? path : '/' + path);
    try {
      const res = await fetch(url, initWithNgrok);
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

function downloadVideo(url) {
  return getDownloadBaseUrl().then(base => base + '/api/download/video?url=' + encodeURIComponent(url));
}

function downloadAudio(url) {
  return getDownloadBaseUrl().then(base => base + '/api/download/audio?url=' + encodeURIComponent(url));
}

// 이중화: primary 실패 시 Railway로 blob 다운로드 (버튼에서 사용 권장)
async function downloadVideoWithFallback(videoUrl, suggestedFileName = 'video.mp4') {
  const baseUrls = await getApiBaseUrls();
  let lastError = null;
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const url = base + '/api/download/video?url=' + encodeURIComponent(videoUrl) + '&quality=highestvideo';
    try {
      const res = await fetch(url, { headers: NGROK_HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) throw new Error('ngrok interstitial (HTML)');
      const blob = await res.blob();
      if (blob.size < 500 * 1024) throw new Error('incomplete (connection dropped?, size=' + blob.size + ')');
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
  const baseUrls = await getApiBaseUrls();
  let lastError = null;
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const url = base + '/api/download/audio?url=' + encodeURIComponent(videoUrl) + '&quality=highestaudio';
    try {
      const res = await fetch(url, { headers: NGROK_HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) throw new Error('ngrok interstitial (HTML)');
      const blob = await res.blob();
      if (blob.size < 200 * 1024) throw new Error('incomplete (connection dropped?, size=' + blob.size + ')');
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
