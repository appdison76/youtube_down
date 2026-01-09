// API 설정 파일
// 개발 환경에서는 컴퓨터의 실제 IP 주소를 사용해야 합니다

// 컴퓨터의 IP 주소 확인 방법:
// Windows: ipconfig (IPv4 주소 확인)
// Mac/Linux: ifconfig 또는 ip addr

// 예시:
// - 개발 환경: http://192.168.0.100:3000
// - 프로덕션: https://your-app.railway.app

const API_CONFIG = {
  // 개발 환경: 컴퓨터의 실제 IP 주소
  // 현재 IP: 172.30.1.25
  DEVELOPMENT: 'http://172.30.1.25:3000',
  
  // 프로덕션 환경: 배포된 서버 URL (Railway, Render 등)
  PRODUCTION: 'https://your-server.railway.app',
};

export const API_BASE_URL = __DEV__ 
  ? API_CONFIG.DEVELOPMENT 
  : API_CONFIG.PRODUCTION;

export default API_CONFIG;

