# localhost 연결 문제 해결

## 문제
`expo run:android` 실행 시 앱이 네트워크 IP(`10.11.227.4:8082`)로 연결을 시도하여 타임아웃 발생

## 원인
- `expo run:android`가 실행 중인 Metro 서버를 자동으로 감지
- Metro 서버가 `--localhost` 옵션 없이 시작되었거나
- Expo가 자동으로 네트워크 IP를 감지하여 사용

## 해결 방법

### 방법 1: Metro 서버를 먼저 localhost로 시작 (가장 확실)

**중요: Metro 서버를 `--localhost` 옵션으로 먼저 시작하고 유지한 상태에서 개발 빌드를 실행하세요!**

```powershell
# 터미널 1: Metro 서버를 localhost로 시작 (이 터미널은 계속 실행 상태로 유지!)
cd c:\projects\youtube_down\app
npm run start:clean

# Metro 서버가 완전히 시작될 때까지 대기
# "Metro waiting on exp://localhost:8081" 같은 메시지가 나타나야 함
# ⚠️ 이 터미널은 닫지 마세요!

# 터미널 2: 개발 빌드 실행
cd c:\projects\youtube_down\app
npx expo run:android
```

### 방법 2: 기존 Metro 서버 종료 후 localhost로 재시작

```powershell
# 1. 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force

# 2. Metro 서버를 localhost로 시작
cd c:\projects\youtube_down\app
npm run start:clean

# 3. 다른 터미널에서 개발 빌드 실행
npx expo run:android
```

### 방법 3: 환경 변수로 강제 설정

```powershell
# PowerShell에서 환경 변수 설정
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"

# Metro 서버 시작
cd c:\projects\youtube_down\app
npm run start:clean

# 다른 터미널에서 개발 빌드 실행
npx expo run:android
```

## 확인 방법

Metro 서버가 localhost로 실행 중인지 확인:

1. Metro 서버 터미널에서 다음 메시지 확인:
   - ✅ `Metro waiting on exp://localhost:8081` (정상)
   - ❌ `Metro waiting on exp://10.11.227.4:8081` (문제)

2. 브라우저에서 확인:
   - `http://localhost:8081` 접속 시 Metro 서버 화면이 나타나야 함

## 주의사항

1. **Metro 서버를 먼저 시작**: 개발 빌드 전에 Metro 서버가 `--localhost`로 실행 중이어야 함
2. **Metro 서버 유지**: 개발 빌드 실행 후에도 Metro 서버 터미널을 닫지 마세요
3. **포트 확인**: ADB 포트 포워딩이 Metro 서버 포트와 일치해야 함

## 빠른 해결 스크립트

```powershell
# 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force

# ADB 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# Metro 서버를 localhost로 시작 (터미널 1)
cd c:\projects\youtube_down\app
npm run start:clean

# 다른 터미널에서 개발 빌드 실행 (터미널 2)
cd c:\projects\youtube_down\app
npx expo run:android
```
