# 네트워크 IP 문제 해결 (즉시 적용)

## 문제
Metro 서버가 네트워크 IP(`10.11.227.4:8081`)로 실행되어 USB 연결 시 타임아웃 발생

## 즉시 해결 방법

### 1단계: 모든 Node 프로세스 종료

```powershell
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force
```

### 2단계: ADB 포트 포워딩 설정

```powershell
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
```

### 3단계: Metro 서버를 localhost로 시작 (터미널 1)

```powershell
cd c:\projects\youtube_down\app
npm run start:clean
```

**중요 확인사항:**
- Metro 서버 터미널에서 다음 메시지 확인:
  - ✅ `Metro waiting on exp://localhost:8081` (정상)
  - ❌ `Metro waiting on exp://10.11.227.4:8081` (문제 - 다시 시작 필요)

### 4단계: 개발 빌드 실행 (터미널 2)

Metro 서버가 `localhost`로 실행 중인 것을 확인한 후:

```powershell
cd c:\projects\youtube_down\app
npx expo run:android
```

## 확인 방법

### Metro 서버가 localhost로 실행 중인지 확인:

1. **터미널 메시지 확인:**
   - 정상: `Metro waiting on exp://localhost:8081`
   - 문제: `Metro waiting on exp://10.11.227.4:8081`

2. **브라우저에서 확인:**
   - `http://localhost:8081` 접속 시 Metro 서버 화면이 나타나야 함

## 왜 네트워크 IP가 나타나는가?

Expo는 기본적으로 네트워크 IP를 자동 감지하여 사용합니다. `--localhost` 옵션을 사용해도:
- 이미 실행 중인 Metro 서버가 네트워크 IP로 시작되었을 수 있음
- Expo가 네트워크 IP를 우선적으로 사용할 수 있음

**해결책:** Metro 서버를 완전히 종료한 후 `--localhost` 옵션으로 다시 시작하세요.

## 한 번에 실행하는 스크립트

```powershell
# 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force

# ADB 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# Metro 서버를 localhost로 시작
cd c:\projects\youtube_down\app
npm run start:clean

# ⚠️ Metro 서버가 "exp://localhost:8081"로 시작되는지 확인!
# 확인 후 다른 터미널에서 npx expo run:android 실행
```
