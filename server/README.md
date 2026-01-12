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





