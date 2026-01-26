# USB 연결 시 개발 빌드 가이드

## ⚠️ 중요: USB 연결 시 반드시 localhost 사용!

USB로 연결된 기기에서 개발 빌드를 할 때는 **반드시 Metro 서버를 `localhost`로 실행**해야 합니다.

## 올바른 실행 순서

### 1단계: 기존 Metro 서버 종료

```powershell
# Metro 서버가 실행 중인 터미널에서 Ctrl + C
# 또는 PowerShell에서:
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

**중요 확인:**
- Metro 서버 터미널에서 다음 메시지 확인:
  - ✅ `Metro waiting on exp://localhost:8081` (정상)
  - ❌ `Metro waiting on exp://10.11.227.4:8081` (문제 - 네트워크 IP 사용 중)

### 4단계: 개발 빌드 실행 (터미널 2)

Metro 서버가 `localhost`로 실행 중인 것을 확인한 후:

```powershell
cd c:\projects\youtube_down\app
npx expo run:android
```

## 왜 localhost를 사용해야 하나?

### USB 연결 시:
- ✅ `localhost:8081` → ADB 포트 포워딩을 통해 연결 성공
- ❌ `10.11.227.4:8081` (네트워크 IP) → 타임아웃 발생

### Wi-Fi 연결 시:
- `10.11.227.4:8081` (네트워크 IP) 사용 가능

## 한 번에 실행하는 스크립트

```powershell
# 1. 기존 Metro 서버 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. ADB 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 3. Metro 서버를 localhost로 시작
cd c:\projects\youtube_down\app
npm run start:clean

# ⚠️ Metro 서버가 "exp://localhost:8081"로 시작되는지 확인!
# 확인 후 다른 터미널에서 npx expo run:android 실행
```

## 확인 체크리스트

- [ ] 기존 Metro 서버 종료됨
- [ ] ADB 포트 포워딩 설정됨 (`adb reverse --list`로 확인)
- [ ] Metro 서버가 `exp://localhost:8081`로 시작됨
- [ ] Metro 서버 터미널이 계속 실행 중임 (닫지 않음)
- [ ] 개발 빌드 실행

## 문제 해결

### Metro 서버가 여전히 네트워크 IP로 시작되는 경우:

1. **모든 Node 프로세스 완전히 종료:**
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force
   Start-Sleep -Seconds 2
   ```

2. **다시 시작:**
   ```powershell
   npm run start:clean
   ```

3. **여전히 네트워크 IP가 나타나면:**
   - 환경 변수 확인: `$env:EXPO_PACKAGER_PROXY_URL`
   - `.expo` 폴더 삭제 후 재시작

## 요약

**USB 연결 = localhost 사용 필수!**

1. Metro 서버 종료
2. `npm run start:clean` 실행 (이미 `--localhost` 옵션 포함)
3. `exp://localhost:8081`로 시작되는지 확인
4. 개발 빌드 실행
