# localhost 강제 실행 방법

## 문제
`--localhost` 옵션을 사용해도 Metro 서버가 네트워크 IP(`10.11.227.4:8081`)로 실행됨

## 해결 방법

### 방법 1: 환경 변수와 함께 실행 (권장)

```powershell
# PowerShell에서 환경 변수 설정 후 실행
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
npm run start:clean
```

### 방법 2: 직접 명령어 실행

```powershell
# Metro 서버 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force

# 환경 변수 설정 후 실행
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
npx expo start --clear --port 8081 --localhost
```

### 방법 3: package.json 스크립트 사용 (업데이트됨)

이제 `package.json`의 스크립트가 환경 변수를 자동으로 설정합니다:

```powershell
npm run start:clean
```

## 확인 방법

Metro 서버가 localhost로 실행 중인지 확인:

1. **터미널 메시지:**
   - ✅ `Metro waiting on exp://localhost:8081` (정상)
   - ❌ `Metro waiting on exp://10.11.227.4:8081` (문제)

2. **브라우저:**
   - `http://localhost:8081` 접속 시 Metro 서버 화면이 나타나야 함

## 완전한 실행 순서

```powershell
# 1. 기존 Metro 서버 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force

# 2. ADB 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 3. 환경 변수 설정 후 Metro 서버 시작
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
cd c:\projects\youtube_down\app
npm run start:clean

# 또는 직접 실행:
# npx expo start --clear --port 8081 --localhost

# 4. Metro 서버가 "exp://localhost:8081"로 시작되는지 확인
# 5. 다른 터미널에서 개발 빌드 실행
npx expo run:android
```
