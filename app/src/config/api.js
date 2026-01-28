// API 설정 파일
// 서버 주소는 외부 config.json 파일에서 동적으로 로드합니다
// 앱 재설치 없이 서버 주소 변경 가능

import { AppState } from 'react-native';

// 외부 설정 파일 URL (version.json과 동일한 위치)
const CONFIG_URL = 'https://appdison76.github.io/youtube_down/install-page/config.json';

// 기본값 (fallback - 외부 설정을 불러올 수 없을 때 사용)
const DEFAULT_CONFIG = {
  // 개발 환경: 컴퓨터의 실제 IP 주소
  // 현재 IP: 172.30.1.11
  DEVELOPMENT: 'http://172.30.1.11:3000',
  
  // 프로덕션 환경: 배포된 서버 URL (Railway)
  PRODUCTION: 'https://youtubedown-production.up.railway.app',
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
      
      if (config && config.apiBaseUrl) {
        console.log('[API Config] ✅ Config loaded successfully from', CONFIG_URL);
        console.log('[API Config] ✅ API Base URL:', config.apiBaseUrl);
        cachedConfig = config;
        return config;
      } else {
        console.error('[API Config] ❌ Invalid config format: apiBaseUrl not found in', config);
        throw new Error('Invalid config format: apiBaseUrl not found');
      }
    } catch (error) {
      console.warn('[API Config] ❌ Failed to load external config from', CONFIG_URL);
      console.warn('[API Config] Error details:', error.message);
      console.warn('[API Config] Using default config');
      console.warn('[API Config] __DEV__ mode:', __DEV__);
      
      // 실패 시 기본값 사용
      const fallbackUrl = __DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.PRODUCTION;
      console.warn('[API Config] Fallback URL:', fallbackUrl);
      return {
        apiBaseUrl: fallbackUrl,
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
    if (config && config.apiBaseUrl) {
      apiBaseUrlSync = config.apiBaseUrl;
      console.log('[API Config] 🔄 Config refreshed. API Base URL:', config.apiBaseUrl);
    }
    return config;
  } catch (e) {
    console.warn('[API Config] Refresh failed:', e?.message);
    return null;
  }
};

// API_BASE_URL을 동적으로 가져오는 함수
export const getApiBaseUrl = async () => {
  // 모든 환경에서 외부 설정 로드 시도 (개발 빌드에서도 Railway 서버 사용 가능)
  try {
    console.log('[API Config] Loading external config (mode:', __DEV__ ? 'DEV' : 'PROD', ')...');
    const config = await loadConfig();
    const apiUrl = config.apiBaseUrl || (__DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.PRODUCTION);
    console.log('[API Config] ✅ Using API URL:', apiUrl, 'Source:', config.source || 'external');
    return apiUrl;
  } catch (error) {
    console.error('[API Config] ❌ Error getting API base URL:', error);
    // 실패 시 환경에 따라 기본값 사용
    const fallbackUrl = __DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.PRODUCTION;
    console.log('[API Config] Falling back to default URL:', fallbackUrl);
    return fallbackUrl;
  }
};

// 동기 버전 (초기값으로 사용, 이후 getApiBaseUrl로 업데이트)
// 초기값은 프로덕션 서버로 설정 (외부 config 로드 시 업데이트됨)
let apiBaseUrlSync = DEFAULT_CONFIG.PRODUCTION;

// 앱 시작 시 외부 설정 로드 (개발/프로덕션 모두)
loadConfig().then(config => {
  if (config && config.apiBaseUrl) {
    apiBaseUrlSync = config.apiBaseUrl;
    console.log('[API Config] API base URL updated to:', apiBaseUrlSync);
  }
}).catch(error => {
  console.error('[API Config] Failed to load config on startup:', error);
  // 실패 시 환경에 따라 기본값 사용
  apiBaseUrlSync = __DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.PRODUCTION;
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
  refreshConfig,
};

