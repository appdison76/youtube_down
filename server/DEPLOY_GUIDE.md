# 서버 배포 가이드

## 📋 현재 상황
- 로컬 서버: `http://172.30.1.11:3000`
- Python yt-dlp 사용
- Node.js Express 서버
- 다운로드 파일 저장

---

## 🚀 배포 옵션 비교

### 옵션 1: Railway (가장 추천) ⭐⭐⭐⭐⭐

**장점:**
- ✅ Python + Node.js 동시 지원
- ✅ 무료 크레딧 $5/월
- ✅ 자동 배포 (GitHub 연동)
- ✅ 간단한 설정
- ✅ PostgreSQL, Redis 등 추가 서비스 제공
- ✅ 로그 확인 쉬움

**단점:**
- ❌ 무료 크레딧 소진 시 유료
- ❌ 저장 공간 제한 (10GB)

**가격:** 무료 크레딧 후 사용량 기반

---

### 옵션 2: Render ⭐⭐⭐⭐

**장점:**
- ✅ 무료 플랜 제공 (제한적)
- ✅ GitHub 자동 배포
- ✅ Python + Node.js 지원
- ✅ 간단한 설정

**단점:**
- ❌ 무료 플랜은 15분 후 슬리프 모드 (첫 요청 느림)
- ❌ 저장 공간 제한 (2GB)
- ❌ 대역폭 제한

**가격:** 무료 플랜 + 유료 플랜 ($7/월부터)

---

### 옵션 3: Fly.io ⭐⭐⭐

**장점:**
- ✅ 무료 플랜 제공
- ✅ 전 세계 CDN
- ✅ 빠른 배포

**단점:**
- ❌ 설정이 복잡할 수 있음
- ❌ 저장 공간 제한

**가격:** 무료 플랜 + 사용량 기반

---

### 옵션 4: VPS (DigitalOcean, AWS EC2 등) ⭐⭐⭐⭐

**장점:**
- ✅ 완전한 제어
- ✅ 저장 공간 넉넉
- ✅ 유연한 설정

**단점:**
- ❌ 초기 설정 복잡
- ❌ 서버 관리 필요
- ❌ 비용 ($5-10/월)

**가격:** $5-10/월 (VPS 크기에 따라)

---

## 🎯 추천: Railway 사용 (단계별 가이드)

### 1단계: Railway 가입 및 프로젝트 생성

1. **Railway 가입**
   - https://railway.app 접속
   - "Start a New Project" 클릭
   - GitHub 계정으로 로그인 (권장)

2. **새 프로젝트 생성**
   - "New Project" 클릭
   - "Deploy from GitHub repo" 선택
   - 저장소 선택 (또는 새로 만들기)

---

### 2단계: 서버 파일 준비

#### 2-1. GitHub 저장소 확인

현재 저장소에 `server` 폴더가 있으므로:
- 방법 A: `server` 폴더를 별도 저장소로 분리
- 방법 B: 현재 저장소의 `server` 폴더를 그대로 사용

**방법 A 추천** (깔끔함)

```bash
# 새 저장소 생성 후 server 폴더만 푸시
cd server
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/youtube-downloader-server.git
git push -u origin main
```

#### 2-2. 필요한 파일 준비

Railway에 배포할 파일들:
- `server.js`
- `package.json`
- `.gitignore`
- `README.md`

---

### 3단계: Railway 배포 설정

#### 3-1. Railway에서 프로젝트 생성

1. Railway 대시보드 → "New Project"
2. "Deploy from GitHub repo" 선택
3. 저장소 선택 (`youtube-downloader-server`)
4. "Deploy" 클릭

#### 3-2. 환경 설정

**Variables 탭에서:**
```
PORT=3000  (자동 설정됨)
NODE_ENV=production
```

**필요 시 추가:**
```
PYTHON_VERSION=3.11
```

#### 3-3. Build 설정

**Settings → Build:**
- Build Command: `npm install && pip install yt-dlp` (필요시)
- Start Command: `npm start`
- Root Directory: `/` (또는 `/server`)

---

### 4단계: Python 및 yt-dlp 설치

Railway에서 Python 패키지 설치 방법:

#### 방법 1: package.json에 추가 (권장)

`server/package.json`에 추가:
```json
{
  "scripts": {
    "postinstall": "pip install yt-dlp || echo 'yt-dlp installation skipped'"
  }
}
```

#### 방법 2: Railway Nixpacks 사용

프로젝트 루트에 `nixpacks.toml` 생성:
```toml
[phases.setup]
nixPkgs = ["python311", "pip"]

[phases.install]
cmds = ["pip install yt-dlp"]

[start]
cmd = "npm start"
```

#### 방법 3: Dockerfile 사용 (가장 확실)

`server/Dockerfile` 생성:
```dockerfile
FROM node:18

# Python 및 yt-dlp 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && pip3 install yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

---

### 5단계: 배포 및 URL 확인

1. **배포 시작**
   - Railway가 자동으로 빌드 시작
   - 로그 확인

2. **URL 확인**
   - Settings → Domains
   - 자동 생성된 URL 확인
   - 예: `https://youtube-downloader-production.up.railway.app`

3. **테스트**
   ```
   curl https://your-railway-url.railway.app/health
   ```

---

### 6단계: config.json 업데이트

`install-page/config.json` 수정:

```json
{
  "apiBaseUrl": "https://your-railway-url.railway.app",
  "version": "1.0.1",
  "updatedAt": "2026-01-10T00:00:00Z"
}
```

Git 커밋 후 Netlify 배포하면 앱이 새 서버 사용!

---

## 🔧 추가 설정 (선택사항)

### 커스텀 도메인 설정

1. Railway → Settings → Domains
2. "Custom Domain" 추가
3. DNS 설정:
   ```
   Type: CNAME
   Name: api (또는 원하는 서브도메인)
   Value: your-railway-url.railway.app
   ```

### 환경 변수 추가

```
CORS_ORIGIN=https://youtube-down.netlify.app
MAX_FILE_SIZE=1073741824
DOWNLOAD_DIR=/tmp/downloads
```

### 로그 확인

Railway → Deployments → 로그 확인

---

## 🐛 문제 해결

### yt-dlp 설치 실패

**해결:**
1. Dockerfile 사용 (가장 확실)
2. 또는 Nixpacks 사용
3. 또는 Railway에서 Python 서비스 추가

### 서버가 시작되지 않음

**확인:**
1. 로그 확인
2. PORT 환경 변수 확인
3. package.json의 start 스크립트 확인

### 다운로드 실패

**확인:**
1. yt-dlp가 설치되었는지
2. Python 경로 확인
3. 디스크 공간 확인

---

## 📝 배포 체크리스트

- [ ] GitHub 저장소 준비 (server 폴더)
- [ ] Railway 계정 생성
- [ ] 프로젝트 생성 및 배포
- [ ] Python + yt-dlp 설치 확인
- [ ] 서버 URL 확인
- [ ] Health check 테스트
- [ ] config.json 업데이트
- [ ] 앱에서 테스트

---

## 💰 비용 추정

### Railway
- 무료 크레딧: $5/월
- 소규모 서비스: 약 $5-10/월
- 중규모: $10-20/월

### Render
- 무료 플랜: 제한적 (슬리프 모드)
- 유료 플랜: $7/월부터

### VPS
- DigitalOcean: $5-10/월
- AWS EC2: $10-20/월 (프리티어 제외)

---

## 🎯 빠른 시작 (Railway)

```bash
# 1. Railway 가입: https://railway.app

# 2. server 폴더를 별도 저장소로 (선택사항)
cd server
git init
git remote add origin https://github.com/YOUR_USERNAME/youtube-downloader-server.git

# 3. Railway에서 "Deploy from GitHub repo" 선택

# 4. 서버 URL 확인 후 config.json 업데이트

# 5. 완료! 🎉
```

---

**추천 순서: Railway → Render → VPS**










