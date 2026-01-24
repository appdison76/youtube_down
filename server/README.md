# YouTube Downloader Backend Server

YouTube 영상/오디오 다운로드를 위한 백엔드 서버입니다.

## 설치

```bash
npm install
```

## 로컬 실행

```bash
npm start
# 또는 개발 모드
npm run dev
```

서버는 `http://localhost:3000`에서 실행됩니다.

## API 엔드포인트

### 1. 영상 정보 가져오기
```
POST /api/video-info
Body: { "url": "https://www.youtube.com/watch?v=..." }
```

### 2. 영상 다운로드
```
GET /api/download/video?url=YOUTUBE_URL&quality=highestvideo
```

### 3. 오디오 다운로드
```
GET /api/download/audio?url=YOUTUBE_URL&quality=highestaudio
```

## 배포

### Railway 배포 (추천)

1. [Railway](https://railway.app)에 가입
2. "New Project" → "Deploy from GitHub repo" 선택
3. 이 서버 디렉토리를 GitHub에 푸시
4. Railway가 자동으로 배포

### Render 배포

1. [Render](https://render.com)에 가입
2. "New Web Service" 선택
3. GitHub 저장소 연결
4. 빌드 명령: `npm install`
5. 시작 명령: `npm start`

### Fly.io 배포

```bash
fly launch
fly deploy
```

## 환경 변수

- `PORT`: 서버 포트 (기본값: 3000)
- `PROXY_URL` 또는 `YTDLP_PROXY`: 프록시/VPN URL (선택사항)
  - HTTP 프록시: `http://proxy.example.com:8080`
  - HTTPS 프록시: `https://proxy.example.com:8080`
  - SOCKS5 프록시: `socks5://proxy.example.com:1080`
  - 예: `PROXY_URL=socks5://127.0.0.1:1080`

### 프록시 설정 방법 (IP 차단 우회)

YouTube IP 차단을 우회하기 위해 프록시/VPN을 사용할 수 있습니다:

#### 옵션 1: 기존 VPN 서비스 사용
이미 VPN 서비스를 사용 중이라면:
- VPN 제공업체의 프록시 정보 확인 (일부 VPN은 SOCKS5/HTTP 프록시 제공)
- 예: NordVPN, ExpressVPN, Surfshark 등
- VPN 앱에서 프록시 설정 정보 확인

#### 옵션 2: 프록시 서비스 가입 (필요시)
- **유료 프록시 서비스**: Bright Data, Smartproxy, Oxylabs 등
- **무료 프록시**: 신뢰성과 보안 문제로 권장하지 않음

#### 옵션 3: 자체 프록시 서버 구축
- VPS에 Shadowsocks, V2Ray 등 설치
- 자체 프록시 서버 운영

#### Railway에서 설정:
1. 프로젝트 → Variables 탭
2. `PROXY_URL` 또는 `YTDLP_PROXY` 추가
3. 값: 프록시 URL (예: `socks5://your-proxy.com:1080`)

#### 로컬에서 테스트:
```bash
PROXY_URL=socks5://127.0.0.1:1080 npm start
```

#### Docker에서 실행:
```bash
docker run -e PROXY_URL=socks5://your-proxy.com:1080 your-image
```

**참고**: 프록시 없이도 작동하지만, IP 차단 시 프록시가 필요합니다.











