// API 설정 파일
// 서버 주소는 외부 config.json 파일에서 동적으로 로드합니다
// 앱 재설치 없이 서버 주소 변경 가능

import { AppState } from 'react-native';

// 외부 설정 파일 URL (version.json과 동일한 위치)
const CONFIG_URL = 'https://appdison76.github.io/youtube_down/web-app/install-page/config.json';

// 기본값 (fallback - 외부 설정을 불러올 수 없을 때 사용)
const DEFAULT_CONFIG = {
  // 개발 환경: 컴퓨터의 실제 IP 주소
  DEVELOPMENT: 'http://172.30.1.11:3000',
  // 프로덕션: 로컬 터널 우선, 실패 시 Railway
  PRODUCTION: 'https://youtubedown-production.up.railway.app',
  // config 로드 실패 시에도 로컬 먼저 시도 (Railway 폴백)
  LOCAL_FIRST: 'https://melodysnap.mediacommercelab.com',
};

// 외부 설정을 로드하는 함수 (캐싱 포함)
let cachedConfig = null;
let configLoadPromise = null;

const loadConfig = async () => {
  // 이미 로드된 설정이 있으면 반환
  if (cachedConfig) {
    return cachedConfig;
  }

  // 이미 로딩 중이면 기다림
  if (configLoadPromise) {
    return configLoadPromise;
  }

  // 설정 로드 시작
  configLoadPromise = (async () => {
    try {
      console.log('[API Config] Loading config from:', CONFIG_URL);
      
      const url = `${CONFIG_URL}?t=${Date.now()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const config = await response.json();
      
      if (config && (config.apiBaseUrl || (config.apiBaseUrls && config.apiBaseUrls.length > 0))) {
        console.log('[API Config] ✅ Config loaded successfully from', CONFIG_URL);
        if (config.apiBaseUrls?.length) {
          console.log('[API Config] ✅ API Base URLs (ordered):', config.apiBaseUrls.length, config.apiBaseUrls);
        } else {
          console.log('[API Config] ✅ API Base URL:', config.apiBaseUrl);
        }
        cachedConfig = config;
        return config;
      } else {
        console.error('[API Config] ❌ Invalid config format: apiBaseUrl/apiBaseUrls not found in', config);
        throw new Error('Invalid config format: apiBaseUrl or apiBaseUrls not found');
      }
    } catch (error) {
      console.warn('[API Config] ❌ Failed to load external config from', CONFIG_URL);
      console.warn('[API Config] Error details:', error.message);
      console.warn('[API Config] Using default config');
      console.warn('[API Config] __DEV__ mode:', __DEV__);
      
      // config 로드 실패 시: 로컬(melodysnap) 먼저, Railway 폴백
      const localFirst = DEFAULT_CONFIG.LOCAL_FIRST;
      const railwayUrl = DEFAULT_CONFIG.PRODUCTION;
      console.warn('[API Config] Fallback: local first, then Railway');
      return {
        apiBaseUrl: localFirst,
        apiBaseUrls: [localFirst, railwayUrl],
        source: 'default',
      };
    }
  })();

  const result = await configLoadPromise;
  return result;
};

/** 캐시 무시하고 config 다시 불러오기 (앱 끄지 않고 서버 주소 갱신) */
export const refreshConfig = async () => {
  cachedConfig = null;
  configLoadPromise = null;
  try {
    const config = await loadConfig();
    if (config) {
      const firstUrl = config.apiBaseUrls?.[0] ?? config.apiBaseUrl;
      if (firstUrl) {
        apiBaseUrlSync = firstUrl;
        console.log('[API Config] 🔄 Config refreshed. API Base URL:', firstUrl);
      }
    }
    return config;
  } catch (e) {
    console.warn('[API Config] Refresh failed:', e?.message);
    return null;
  }
};

// API_BASE_URL을 동적으로 가져오는 함수 (단일 URL, 기존 호환)
export const getApiBaseUrl = async () => {
  const urls = await getApiBaseUrls();
  return urls[0] || (__DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.PRODUCTION);
};

/** URL 목록 반환 (이중화: primary 실패 시 다음 URL 시도). config.apiBaseUrls 배열 또는 apiBaseUrl + Railway */
export const getApiBaseUrls = async () => {
  try {
    const config = await loadConfig();
    if (config.apiBaseUrls && Array.isArray(config.apiBaseUrls) && config.apiBaseUrls.length > 0) {
      return config.apiBaseUrls.filter(Boolean);
    }
    const primary = config.apiBaseUrl || (__DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.PRODUCTION);
    const railway = DEFAULT_CONFIG.PRODUCTION;
    return primary === railway ? [primary] : [primary, railway];
  } catch (error) {
    console.error('[API Config] ❌ Error getting API base URLs:', error);
    if (__DEV__) {
      return [DEFAULT_CONFIG.DEVELOPMENT, DEFAULT_CONFIG.PRODUCTION];
    }
    return [DEFAULT_CONFIG.LOCAL_FIRST, DEFAULT_CONFIG.PRODUCTION];
  }
};

/** fetch 실패 시 다음 URL로 재시도. path는 '/api/search' 형태, init는 fetch init */
export const fetchWithFallback = async (path, init = {}) => {
  const baseUrls = await getApiBaseUrls();
  let lastError = null;
  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/$/, '');
    const url = base + (path.startsWith('/') ? path : '/' + path);
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        if (i > 0) {
          console.log('[API Config] ✅ Fallback succeeded with URL #' + (i + 1), base);
        }
        return res;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
      console.warn('[API Config] ⚠️ Request failed for', base, e?.message || e);
      if (i < baseUrls.length - 1) {
        console.log('[API Config] Trying next URL...');
      }
    }
  }
  throw lastError || new Error('All API URLs failed');
};

// 동기 버전 (초기값: 로컬 우선, config 로드 후 업데이트)
let apiBaseUrlSync = DEFAULT_CONFIG.LOCAL_FIRST;

// 앱 시작 시 외부 설정 로드 (개발/프로덕션 모두)
loadConfig().then(config => {
  if (config && config.apiBaseUrl) {
    apiBaseUrlSync = config.apiBaseUrl;
    console.log('[API Config] API base URL updated to:', apiBaseUrlSync);
  }
}).catch(error => {
  console.error('[API Config] Failed to load config on startup:', error);
  apiBaseUrlSync = __DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.LOCAL_FIRST;
});

// 앱이 포그라운드로 돌아올 때 config 새로 불러오기 (껐다 켜지 않아도 서버 주소 갱신)
let appStatePrev = AppState.currentState;
AppState.addEventListener('change', (nextState) => {
  if (appStatePrev.match(/inactive|background/) && nextState === 'active') {
    refreshConfig();
  }
  appStatePrev = nextState;
});

// 동기 버전 export (기존 코드 호환성)
export const API_BASE_URL = apiBaseUrlSync;

// 전체 설정 export
export default {
  CONFIG_URL,
  DEFAULT_CONFIG,
  loadConfig,
  getApiBaseUrl,
  getApiBaseUrls,
  fetchWithFallback,
  refreshConfig,
};

