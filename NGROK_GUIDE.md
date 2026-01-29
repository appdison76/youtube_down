# Ngrok 사용 가이드

로컬 서버를 외부에서 접근할 수 있도록 ngrok을 사용하는 방법입니다.

> **기본 추천**: 로컬 서버 터널은 **Cloudflare Tunnel** 사용 → [CLOUDFLARE_TUNNEL_GUIDE.md](./CLOUDFLARE_TUNNEL_GUIDE.md) (무료·대역폭 제한 거의 없음). ngrok 대안 비교 → [TUNNEL_OPTIONS.md](./TUNNEL_OPTIONS.md)

## 📋 목차
1. [서버 시작하기](#서버-시작하기)
2. [Ngrok URL 확인하기](#ngrok-url-확인하기)
3. [네트워크 변경 시 대응](#네트워크-변경-시-대응)
4. [Config.json 업데이트](#configjson-업데이트)

---

## 🚀 서버 시작하기

### 방법 1: 배치 파일 사용 (추천)
1. `server/start-server-ngrok.bat` 파일을 더블클릭
2. 서버 창과 ngrok 창이 자동으로 열립니다
3. 서버 콘솔에서 안내 문구 확인

### 방법 2: 수동 실행
1. 터미널에서 `server` 폴더로 이동
2. `node server_local.js` 실행 (로컬 전용 서버)
3. 별도 터미널에서 `C:\ngrok\ngrok.exe http 3000` 실행

---

## 🌐 Ngrok URL 확인하기

### 방법 1: 서버 콘솔 확인 (자동)
- 서버 시작 시 자동으로 ngrok URL을 감지하고 표시합니다
- URL이 변경되면 자동으로 알림이 표시됩니다

### 방법 2: API로 확인
브라우저에서 접속:
```
http://localhost:3000/api/ngrok-url
```

### 방법 3: Ngrok Web UI
브라우저에서 접속:
```
http://localhost:4040
```

---

## 🔄 네트워크 변경 시 대응

### 시나리오 1: 다른 장소로 이동 (ngrok 실행 중)
1. 노트북을 다른 WiFi로 이동 (카페, 집 등)
2. ngrok이 자동으로 재연결 시도
3. **30초 이내** 서버 콘솔에서 URL 변경 감지
4. 변경된 URL 확인 후 config.json 업데이트

### 시나리오 2: 배치 파일 재실행
1. 다른 장소에서 `start-server-ngrok.bat` 실행
2. 서버 + ngrok 재시작
3. 새 ngrok URL 감지 및 표시
4. config.json 업데이트

---

## ⚙️ Config.json 업데이트

### 자동 감지 기능
서버는 30초마다 ngrok URL을 체크하고, config.json과 비교합니다:

- **일치하는 경우**: `✅ config.json matches: [URL]`
- **다른 경우**: 
  ```
  ⚠️  config.json mismatch:
     현재 config.json: [기존 URL]
     감지된 ngrok URL: [새 URL]
  💡 Update config.json with: "apiBaseUrl": "[새 URL]"
  ```

### 수동 업데이트 방법
1. 서버 콘솔에서 표시된 새 ngrok URL 복사
2. `install-page/config.json` 파일 열기
3. `apiBaseUrl` 값을 새 URL로 변경
4. Git commit & push
5. GitHub Pages에 배포되면 앱이 자동으로 새 URL 사용

### 예시
```json
{
  "apiBaseUrl": "https://new-url.ngrok-free.dev",
  "version": "1.0.4",
  "updatedAt": "2026-01-28T00:00:00Z",
  "description": "서버 주소 설정 파일. 노트북+ngrok 테스트용."
}
```

---

## 📝 주의사항

### Ngrok 무료 버전
- 같은 네트워크 범위에서는 URL이 유지될 수 있습니다
- 다른 네트워크로 이동하면 URL이 변경될 수 있습니다
- URL이 변경되면 config.json을 업데이트해야 합니다
- 서버가 30초마다 자동으로 URL 변경을 감지합니다

### 서버 콘솔 확인
- 서버 창을 항상 열어두면 URL 변경을 즉시 확인할 수 있습니다
- URL 변경 알림이 표시되면 config.json을 업데이트하세요

---

## 🔍 문제 해결

### Ngrok이 감지되지 않는 경우
1. ngrok이 실행 중인지 확인 (ngrok 창 확인)
2. `http://localhost:4040` 접속 가능한지 확인
3. 서버를 재시작해보기

### URL이 자동으로 감지되지 않는 경우
1. 서버 콘솔에서 `http://localhost:3000/api/ngrok-url` 접속해서 확인
2. ngrok Web UI (`http://localhost:4040`)에서 직접 확인
3. 배치 파일을 재실행

### Config.json이 업데이트되지 않는 경우
1. GitHub에 push 했는지 확인
2. GitHub Pages가 배포되었는지 확인
3. 앱을 포그라운드로 가져와서 자동 새로고침 대기 (또는 앱 재시작)

---

## 💡 팁

- **바로가기 만들기**: `start-server-ngrok.bat`를 바탕화면에 바로가기로 만들어두면 편리합니다
- **자동 시작**: Windows 시작 폴더에 배치 파일을 넣으면 부팅 시 자동 실행됩니다
- **서버 창 유지**: 서버 콘솔 창을 닫지 않으면 URL 변경을 실시간으로 확인할 수 있습니다

---

## 📞 관련 파일

- `server/start-server-ngrok.bat`: 서버 + ngrok 자동 시작 스크립트
- `server/run-ngrok.bat`: ngrok 실행 스크립트
- `server/server.js`: Railway/공통 서버 (검색, 다운로드 등). Railway는 `npm start` → `server.js` 실행
- `server/server_local.js`: 로컬 전용 진입점 (.env, ngrok URL 감지, config.json 비교). 배치 파일에서 실행
- `install-page/config.json`: 앱이 사용하는 서버 주소 설정 파일
