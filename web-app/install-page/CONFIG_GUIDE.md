# 서버 주소 설정 가이드 (config.json)

## 📋 개요

서버 주소를 외부 설정 파일(`config.json`)로 관리하여 앱 재설치 없이 서버 주소를 변경할 수 있습니다.

## 📁 파일 구조

```
install-page/
├── config.json      (서버 주소 설정)
├── version.json     (버전 관리)
└── index.html       (설치 페이지)
```

## 🔧 config.json 구조

```json
{
  "apiBaseUrl": "http://172.30.1.11:3000",
  "version": "1.0.1",
  "updatedAt": "2026-01-10T00:00:00Z",
  "description": "서버 주소 설정 파일"
}
```

### 필드 설명

- **apiBaseUrl**: 서버 주소 (필수)
- **version**: 설정 파일 버전 (선택)
- **updatedAt**: 업데이트 시간 (선택)
- **description**: 설명 (선택)

## 🚀 서버 주소 변경 방법

### 1단계: config.json 수정

`install-page/config.json` 파일을 열고 `apiBaseUrl` 수정:

```json
{
  "apiBaseUrl": "https://your-new-server.railway.app",
  "version": "1.0.1",
  "updatedAt": "2026-01-10T12:00:00Z"
}
```

### 2단계: Git 커밋 및 푸시

```bash
cd install-page
git add config.json
git commit -m "Update server URL to new server"
git push origin main
```

### 3단계: Netlify 자동 배포

Netlify가 자동으로 재배포합니다 (1-2분 소요)

### 4단계: 완료!

앱을 재시작하면 새로운 서버 주소가 자동으로 적용됩니다.

**⚠️ 주의:** 앱 재설치가 필요 없습니다! 앱 재시작만 하면 됩니다.

---

## 📝 예시 시나리오

### 시나리오 1: 서버 IP 변경

**이전:**
```json
{
  "apiBaseUrl": "http://172.30.1.11:3000"
}
```

**변경 후:**
```json
{
  "apiBaseUrl": "http://192.168.0.100:3000"
}
```

**작업:**
1. config.json 수정
2. Git 커밋/푸시
3. Netlify 배포
4. 사용자는 앱 재시작만 하면 됨 ✅

### 시나리오 2: 서버 배포 (Railway, Render 등)

**이전:**
```json
{
  "apiBaseUrl": "http://172.30.1.11:3000"
}
```

**변경 후:**
```json
{
  "apiBaseUrl": "https://youtube-downloader-production.railway.app"
}
```

**작업:**
1. 서버 배포 (Railway 등)
2. config.json 수정
3. Git 커밋/푸시
4. Netlify 배포
5. 사용자는 앱 재시작만 하면 됨 ✅

---

## 🔍 동작 방식

### 앱 시작 시

1. 앱이 `https://youtube-down.netlify.app/config.json` 요청
2. 설정 파일 로드 성공 시 그 URL 사용
3. 실패 시 기본값 사용 (fallback)

### 개발 환경

- 개발 환경에서는 항상 기본값 사용 (`http://172.30.1.11:3000`)
- 외부 설정 파일을 읽지 않음

### 프로덕션 환경

- 앱 시작 시 자동으로 외부 설정 파일 로드
- 성공하면 그 URL 사용
- 실패하면 기본값 사용

---

## ✅ 장점

1. **앱 재설치 불필요**: 서버 주소 변경 시 앱 재시작만 하면 됨
2. **빠른 업데이트**: Git 커밋만으로 즉시 반영
3. **버전 관리**: Git으로 설정 파일 버전 관리
4. **일관성**: version.json과 동일한 패턴
5. **Fallback**: 네트워크 실패 시 기본값 사용

---

## 🛠️ 문제 해결

### 서버 연결이 안 될 때

1. **config.json이 배포되었는지 확인**
   ```
   https://youtube-down.netlify.app/config.json
   ```
   브라우저에서 접속하여 JSON이 보이는지 확인

2. **서버 주소 확인**
   - IP 주소가 올바른지
   - 포트 번호가 올바른지
   - 서버가 실행 중인지

3. **네트워크 연결 확인**
   - 앱이 인터넷에 연결되어 있는지
   - 설정 파일을 불러올 수 있는지

4. **로그 확인**
   ```
   [API Config] Loading config from: ...
   [API Config] Config loaded successfully: ...
   ```
   앱 로그에서 확인

### 기본값이 사용될 때

- 외부 설정을 불러올 수 없을 때 기본값 사용
- 로그에서 확인: `[API Config] Using default config`

---

## 📌 주의사항

1. **URL 형식**
   - HTTP: `http://192.168.0.100:3000`
   - HTTPS: `https://your-server.com`
   - 끝에 슬래시(`/`) 붙이지 않기

2. **Netlify 배포**
   - config.json 변경 후 Netlify 자동 배포 대기 (1-2분)
   - 배포 완료 전에는 이전 설정이 사용됨

3. **캐싱**
   - 앱이 설정을 캐싱하므로 앱 재시작 필요
   - 앱이 백그라운드에서 실행 중이면 완전 종료 후 재시작

---

## 🔗 관련 파일

- `install-page/config.json` - 서버 주소 설정
- `app/src/config/api.js` - API 설정 로직
- `app/src/services/downloadService.js` - 다운로드 서비스

---

## 📝 변경 이력

- 2026-01-10: 초기 구현 (외부 config.json 지원)










