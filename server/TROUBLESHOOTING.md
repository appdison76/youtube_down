# Railway 배포 문제 해결 가이드

## 404 에러 발생 시

### 가능한 원인
1. Root Directory 미설정
2. 서버 배포 실패
3. 서버 시작 실패
4. Python/yt-dlp 설치 실패

---

## 해결 방법

### 1단계: Railway 설정 확인

#### Root Directory 확인
1. Railway 대시보드 → Settings → Source
2. "루트 디렉터리" (Root Directory) 확인
3. **반드시 `server`로 설정되어 있어야 함**
   - 없으면 추가: "루트 디렉터리 추가" 클릭 → `server` 입력

#### 배포 상태 확인
1. "배치" (Deployments) 탭 클릭
2. 최신 배포 클릭
3. 로그 확인:
   - ✅ 성공: `[Server] YouTube Downloader Server running on port...`
   - ❌ 실패: 에러 메시지 확인

---

### 2단계: 서버 로그 확인

Railway → Deployments → 로그에서 확인:

#### 정상 시작 시 로그:
```
[Server] YouTube Downloader Server running on port 8080
```

#### 에러 발생 시 확인:
- `npm install` 실패?
- `pip install yt-dlp` 실패?
- `node server.js` 실행 실패?
- Python이 설치되지 않음?

---

### 3단계: 수동 설정 확인

#### Settings → Build
- **Build Command**: 비워두기 (또는 `npm install`)
- **Start Command**: `npm start`

#### Settings → Variables
- `PORT` 자동 설정됨 (수동 설정 불필요)
- `NODE_ENV=production` (선택사항)

---

### 4단계: 파일 구조 확인

Railway가 인식해야 할 파일:
```
server/
├── server.js          (메인 파일)
├── package.json       (필수)
├── nixpacks.toml      (Python 설치용)
└── railway.json       (선택사항)
```

---

## 빠른 수정 방법

### 방법 1: Root Directory 재설정

1. Settings → Source
2. "루트 디렉터리" 확인/수정
3. `server` 입력
4. 저장 후 재배포

### 방법 2: 로그 확인 및 에러 수정

1. Deployments → 최신 배포 → 로그
2. 에러 메시지 확인
3. 에러에 따라 수정

### 방법 3: 서비스 재시작

1. Deployments 탭
2. "Redeploy" 클릭
3. 재배포 대기

---

## 자주 발생하는 에러

### 에러 1: "Cannot find module"
**원인**: package.json이 인식되지 않음
**해결**: Root Directory가 `server`로 설정되었는지 확인

### 에러 2: "python: command not found"
**원인**: Python이 설치되지 않음
**해결**: `nixpacks.toml` 파일이 올바른지 확인

### 에러 3: "yt-dlp: command not found"
**원인**: yt-dlp 설치 실패
**해결**: 로그에서 pip 에러 확인

### 에러 4: "Port already in use"
**원인**: 포트 충돌
**해결**: Railway가 자동으로 PORT 설정, 문제 없음

---

## 테스트 명령어

Railway 로그에서 확인할 수 있는 메시지:
```
✓ npm install 완료
✓ pip install yt-dlp 완료
✓ [Server] YouTube Downloader Server running on port 8080
```

---

## 확인 체크리스트

- [ ] Root Directory: `server` 설정됨
- [ ] 배포 상태: "활성" (Deployed)
- [ ] 로그: 서버 시작 메시지 확인
- [ ] Health check: `/health` 엔드포인트 응답










