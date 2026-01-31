# Melody Snap / YouTube Down 프로젝트 메뉴얼

전체 구조, API 이중화, 음악 인식(현재·향후 3중 폴백) 정리.

---

## 1. 전체 아키텍처

**Git = 정적 / Railway = API** 로 구분한다.

| 구분 | 배포 위치 | 역할 |
|------|-----------|------|
| **정적** | **Git** (GitHub Pages) | 웹앱 화면, install-page |
| **API** | **Railway** (또는 로컬 Node) | 다운로드, 검색, 음악 인식 |

- **Git**: 웹앱(HTML/JS/CSS), install-page — 정적 파일만. API 서빙 없음.
- **Railway**: Node 서버 — **API만** 제공. 정적 파일은 서빙하지 않음.

---

## 2. 로컬 vs Railway

### 로컬

| 프로세스 | 역할 |
|----------|------|
| **웹 서버** (예: `web-app/serve-8000.js`, 포트 8000) | 웹앱 정적 파일 |
| **Node 서버** (`server/server.js`, 포트 3000) | 다운로드 / 검색 / 음악 인식 API |

### Railway

- **Node 서버만** 배포 (Dockerfile, Root Directory = `server`).
- 웹앱·install-page는 GitHub Pages 등에서 별도 서빙.

---

## 3. API 이중화 (웹앱)

웹앱은 **모든 API**를 `config.json`의 `apiBaseUrls` 순서대로 시도(이중화).

- **설정**: `web-app/install-page/config.json`  
  - `apiBaseUrls`: `["https://melodysnap.mediacommercelab.com", "https://youtubedown-production.up.railway.app"]`  
- **동작**: `web-app/js/api.js` 의 `fetchWithFallback(path, init)`  
  - 첫 번째 URL 실패 시 다음 URL로 재시도.

적용 대상:

- YouTube 검색 (`/api/search`)
- 다운로드 (`/api/download/video`, `/api/download/audio`, `/api/video-info`)
- 자동완성 (`/api/autocomplete`)
- **음악 인식** (`/api/recognize`) — 서버 내부에서 ACRCloud 등 1차 사용, 향후 3중 폴백 예정.

---

## 4. Node 서버 API 목록

| 메서드 | 경로 | 용도 |
|--------|------|------|
| GET | `/health` | 서버 상태 |
| POST | `/api/search` | YouTube 검색 |
| POST | `/api/video-info` | 영상 정보 |
| GET | `/api/download/video` | 영상 다운로드 |
| GET | `/api/download/audio` | 음원 다운로드 |
| POST | `/api/autocomplete` | 검색 자동완성 |
| POST | `/api/recognize` | **음악 인식** (오디오 파일 업로드) |

---

## 5. 음악 인식

### 5.1 현재 (단일 엔진)

- **엔진**: ACRCloud
- **엔드포인트**: `POST /api/recognize`
- **요청**: `multipart/form-data`, 필드명 `audio` (오디오 파일, 예: recording.webm)
- **응답**: `{ title, artist, album }`
- **서버**: `server/server.js` — ACRCloud 키는 서버 환경 변수 또는 기본값 사용.  
  웹앱은 `apiBaseUrls` 로 이중화만 적용(동일).

### 5.2 향후: 3중 폴백

음악 인식은 **서버 내부**에서 아래 순서로 시도할 예정(웹앱 호출 방식은 동일).

1. **Shazam Kit** (메인)
2. **ACRCloud** (1차 폴백)
3. **AudD** (2차 폴백)

- 웹앱은 계속 `POST /api/recognize` 한 번만 호출.
- 서버가 1 → 2 → 3 순으로 시도 후, 첫 성공 결과를 `{ title, artist, album }` 형태로 반환.
- 구현 시 수정할 파일: `server/server.js` (recognize 라우트 내부).

---

## 6. 설정 파일

| 파일 | 용도 |
|------|------|
| `web-app/install-page/config.json` | 웹앱 API 베이스 URL (apiBaseUrl, apiBaseUrls) — 검색/다운로드/음악인식 이중화 |
| `server/.env` (선택) | ACRCLOUD_ACCESS_KEY, ACRCLOUD_ACCESS_SECRET, ACRCLOUD_HOST 등 |
| `install-page/version.json` | 앱 버전/최소버전 (PRO 설치 페이지 등에서 참조) |

---

## 7. Railway 배포 (API 전용)

- **Git = 정적, Railway = API** 이므로 Railway에는 API 서버만 올린다.
- **Root Directory**: `server`
- **Dockerfile**: `server/Dockerfile` (컨텍스트 = server 폴더)
- **포함**: Node 서버, yt-dlp, ffmpeg, ACRCloud 호출용 코드.  
  **미포함**: 웹앱·install-page (정적은 Git에서 서빙).

자세한 빌드/트러블슈팅: `server/RAILWAY_DOCKER_BUILD.md`, `server/TROUBLESHOOTING.md`

---

## 8. 관련 디렉터리/파일

```
프로젝트 루트
├── app/                    # 네이티브 앱 (Expo/React Native)
├── web-app/                # 웹앱 (정적, Git 배포)
│   ├── js/api.js           # API 호출, fetchWithFallback, recognizeMusic 등
│   ├── js/recognition.js   # 음악 찾기 UI, 녹음 → recognizeMusic()
│   └── install-page/       # install-page 정적 (config.json 등)
├── install-page/           # 루트 install-page (version.json 등)
├── server/                 # Node API 서버
│   ├── server.js          # Express, /api/recognize(ACRCloud), 검색, 다운로드
│   ├── Dockerfile         # Railway용 (server 컨텍스트)
│   └── package.json       # acrcloud, multer 등
├── railway.toml            # Railway 설정 (선택)
└── MANUAL.md               # 본 메뉴얼
```

---

## 9. 요약

- **Git = 정적**: 웹앱·install-page는 Git(GitHub Pages)에 올려서 서빙.
- **Railway = API**: Node 서버는 Railway에 올리고, 다운로드·검색·음악 인식 API만 제공.
- **이중화**: 웹앱 모든 API가 `apiBaseUrls` 순서대로 재시도.
- **음악 인식**: 현재 ACRCloud 단일 → 향후 서버 내부 3중 폴백(Shazam Kit → ACRCloud → AudD).
