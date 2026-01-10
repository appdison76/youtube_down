// API 설정 파일
// 서버 주소는 외부 config.json 파일에서 동적으로 로드합니다
// 앱 재설치 없이 서버 주소 변경 가능

// 외부 설정 파일 URL (version.json과 동일한 위치)
const CONFIG_URL = 'https://youtube-down.netlify.app/config.json';

// 기본값 (fallback - 외부 설정을 불러올 수 없을 때 사용)
const DEFAULT_CONFIG = {
  // 개발 환경: 컴퓨터의 실제 IP 주소
  // 현재 IP: 172.30.1.11
  DEVELOPMENT: 'http://172.30.1.11:3000',
  
  // 프로덕션 환경: 배포된 서버 URL (Railway, Render 등)
  // 현재는 로컬 서버를 사용 (서버 배포 후 실제 URL로 변경 필요)
  PRODUCTION: 'http://172.30.1.11:3000',
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
      
      const response = await fetch(CONFIG_URL, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const config = await response.json();
      
      if (config && config.apiBaseUrl) {
        console.log('[API Config] Config loaded successfully:', config.apiBaseUrl);
        cachedConfig = config;
        return config;
      } else {
        throw new Error('Invalid config format: apiBaseUrl not found');
      }
    } catch (error) {
      console.warn('[API Config] Failed to load external config:', error.message);
      console.warn('[API Config] Using default config');
      
      // 실패 시 기본값 사용
      return {
        apiBaseUrl: __DEV__ ? DEFAULT_CONFIG.DEVELOPMENT : DEFAULT_CONFIG.PRODUCTION,
        source: 'default',
      };
    }
  })();

  const result = await configLoadPromise;
  return result;
};

// API_BASE_URL을 동적으로 가져오는 함수
export const getApiBaseUrl = async () => {
  // 개발 환경에서는 항상 기본값 사용 (로컬 서버)
  if (__DEV__) {
    return DEFAULT_CONFIG.DEVELOPMENT;
  }

  // 프로덕션 환경에서는 외부 설정 로드
  try {
    const config = await loadConfig();
    return config.apiBaseUrl || DEFAULT_CONFIG.PRODUCTION;
  } catch (error) {
    console.error('[API Config] Error getting API base URL:', error);
    return DEFAULT_CONFIG.PRODUCTION;
  }
};

// 동기 버전 (초기값으로 사용, 이후 getApiBaseUrl로 업데이트)
// 초기 로드 시 기본값 사용, 이후 외부 설정 로드 후 업데이트
let apiBaseUrlSync = __DEV__ 
  ? DEFAULT_CONFIG.DEVELOPMENT 
  : DEFAULT_CONFIG.PRODUCTION;

// 앱 시작 시 외부 설정 로드
if (!__DEV__) {
  loadConfig().then(config => {
    if (config && config.apiBaseUrl) {
      apiBaseUrlSync = config.apiBaseUrl;
      console.log('[API Config] API base URL updated to:', apiBaseUrlSync);
    }
  }).catch(error => {
    console.error('[API Config] Failed to load config on startup:', error);
  });
}

// 동기 버전 export (기존 코드 호환성)
export const API_BASE_URL = apiBaseUrlSync;

// 전체 설정 export
export default {
  CONFIG_URL,
  DEFAULT_CONFIG,
  loadConfig,
  getApiBaseUrl,
};

