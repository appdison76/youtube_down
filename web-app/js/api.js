// API 설정 - install-page config 로드, 이중화(primary 실패 시 Railway)
// 상대 경로 사용 → 같은 오리진(github.io / 커스텀 도메인)에서 CORS 없이 로드
const CONFIG_URL = (function () {
  try {
    return new URL('install-page/config.json', window.location.href).href;
  } catch (_) {
    return 'https://melodysnap-app.mediacommercelab.com/web-app/install-page/config.json';
  }
})();
const DEFAULT_PRIMARY = 'https://melodysnap.mediacommercelab.com';
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
      console.warn('[web-app API] Config load failed, using default order (primary → Railway):', e?.message);
      cachedConfig = { apiBaseUrls: [DEFAULT_PRIMARY, DEFAULT_RAILWAY], source: 'default' };
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
  const primary = config.apiBaseUrl || (window.API_BASE_URL || DEFAULT_PRIMARY);
  return primary === DEFAULT_RAILWAY ? [DEFAULT_PRIMARY, DEFAULT_RAILWAY] : [primary, DEFAULT_RAILWAY];
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

// 음악 인식 API (검색/다운로드와 동일 이중화: config.apiBaseUrls 순서대로 노트북·Railway 등 시도)
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

// 검색 자동완성 (서버 /api/autocomplete 사용)
async function getSearchSuggestions(query) {
  if (!query || !query.trim()) return [];
  try {
    const response = await fetchWithFallback('/api/autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query.trim() }),
    });
    if (!response.ok) return [];
    const list = await response.json();
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('[autocomplete]', e?.message || e);
    return [];
  }
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

// 다운로드 버튼 누를 때 primary → Railway 순으로 살아있는 서버 확인 (결과 30초 캐시)
const PROBE_TIMEOUT_MS = 5000;
const PROBE_CACHE_MS = 30000;
let probeCache = { base: null, at: 0 };

async function probeWorkingBaseUrl() {
  const baseUrls = await getApiBaseUrls();
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const controller = new AbortController();
    const t = setTimeout(function () { controller.abort(); }, PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(base + '/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
      clearTimeout(t);
      return base;
    } catch (_) {
      clearTimeout(t);
    }
  }
  return null;
}

// 다운로드 URL 반환: probe로 확인(30초 캐시), 실패 시 config 첫 번째
async function getDownloadBaseUrl() {
  if (probeCache.base && (Date.now() - probeCache.at < PROBE_CACHE_MS)) return probeCache.base.replace(/\/$/, '');
  const probed = await probeWorkingBaseUrl();
  if (probed) {
    probeCache = { base: probed, at: Date.now() };
    return probed.replace(/\/$/, '');
  }
  const urls = await getApiBaseUrls();
  return urls[0].replace(/\/$/, '');
}

// 다운로드도 config 순서(노트북 → Railway 등) 사용 (getDownloadBaseUrls는 사용처 없음, getDownloadBaseUrl만 사용)
async function getDownloadBaseUrls() {
  return getApiBaseUrls();
}

function downloadVideo(url) {
  return getDownloadBaseUrl().then(base => base + '/api/download/video?url=' + encodeURIComponent(url));
}

function downloadAudio(url) {
  return getDownloadBaseUrl().then(base => base + '/api/download/audio?url=' + encodeURIComponent(url));
}

// 파일명으로 쓸 수 있게 제목 정리 (불가 문자 제거, 길이 제한)
function sanitizeFileName(title) {
  if (!title || typeof title !== 'string') return '';
  const s = title.replace(/[/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  return s.length > 180 ? s.slice(0, 180) : s;
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

// 웹 다운로드: config 순서대로 시도 (노트북 → Railway 등)
async function downloadVideoWithFallback(videoUrl, suggestedFileName = 'video.mp4') {
  const baseUrls = await getApiBaseUrls();
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
      if (i > 0) console.log('[web-app API] Download fallback succeeded with URL #' + (i + 1), base);
      return;
    } catch (e) {
      lastError = e;
      console.warn('[web-app API] Video download failed for', base, e?.message);
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
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (!(await isLikelyMediaResponse(res, blob))) throw new Error('Invalid response (e.g. ngrok error page)');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = suggestedFileName || 'audio.m4a';
      a.click();
      URL.revokeObjectURL(a.href);
      if (i > 0) console.log('[web-app API] Download fallback succeeded with URL #' + (i + 1), base);
      return;
    } catch (e) {
      lastError = e;
      console.warn('[web-app API] Audio download failed for', base, e?.message);
      if (i < baseUrls.length - 1) console.log('[web-app API] Trying next URL...');
    }
  }
  throw lastError || new Error('다운로드에 실패했습니다.');
}
