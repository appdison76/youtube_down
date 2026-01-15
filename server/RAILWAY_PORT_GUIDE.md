# Railway 포트 설정 가이드

## 🔍 포트 동작 방식

### 서버 코드
```javascript
const PORT = process.env.PORT || 3000;
```

이 코드는:
1. **환경 변수 `PORT`를 먼저 확인**
2. 없으면 기본값 3000 사용

### Railway의 포트 처리

Railway는 자동으로 `PORT` 환경 변수를 설정합니다:
- Railway가 서비스 시작 시 랜덤한 포트 할당 (보통 8080, 3000, 5000 등)
- `process.env.PORT`에 자동 설정됨
- 서버 코드가 자동으로 그 포트를 사용

### Public Networking의 포트 설정

Railway UI에서 설정하는 포트 (8080):
- 이건 **외부 HTTP 요청이 라우팅될 내부 포트**를 의미
- 서버가 리스닝하는 포트와 일치해야 함
- Railway가 자동으로 PORT 환경 변수로 설정함

---

## ✅ 올바른 설정

### 1. Railway Public Networking
- 포트: 8080 (또는 Railway가 할당한 포트)

### 2. 서버 코드
- `process.env.PORT` 사용 (자동)

### 3. 동작 방식
```
외부 요청: https://youtubedown-production.up.railway.app
         ↓
Railway 프록시
         ↓
내부 포트: 8080 (process.env.PORT = 8080)
         ↓
Node.js 서버 (8080 포트에서 리스닝)
```

---

## ❌ 문제 발생 시

### 404 에러의 원인 (포트가 아님)

포트 문제가 아니라:
1. **서버가 시작되지 않음** (가능성 높음)
2. Root Directory 미설정
3. Python/yt-dlp 설치 실패
4. npm install 실패

---

## 🔧 확인 방법

### Railway 로그에서 확인

배치 탭 → 최신 배포 → 로그에서 확인:

**정상 시작 시:**
```
[Server] YouTube Downloader Server running on port 8080
```

**포트 문제 시 (보통 아님):**
- 포트가 다르게 표시될 수 있음
- 하지만 Railway가 자동으로 프록시하므로 문제 없음

---

## 💡 결론

**포트는 문제가 아닙니다!**

Railway가 자동으로 PORT 환경 변수를 설정하고, 서버 코드가 이를 사용합니다.

404 에러의 원인:
- 서버가 시작되지 않음
- 배포 실패
- Root Directory 미설정

Railway 로그를 확인해야 합니다!










