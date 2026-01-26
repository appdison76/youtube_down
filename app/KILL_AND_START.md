# 🚨 네트워크 타임아웃 문제 완전 해결

## 문제
- 네트워크 IP(`10.11.227.4:8081`)로 접속 시 타임아웃 발생
- USB 연결 시 localhost를 사용해야 빠르고 안정적

## ✅ 해결 방법 (한 번에 실행)

### 방법 1: PowerShell 스크립트 사용 (추천)

```powershell
cd c:\projects\youtube_down\app
npm run start:dev
```

이 명령어는 자동으로:
1. 모든 Node 프로세스 종료
2. 캐시 완전 삭제
3. ADB 포트 포워딩 설정
4. localhost로 Metro 서버 시작

### 방법 2: 직접 PowerShell 스크립트 실행

```powershell
cd c:\projects\youtube_down\app
powershell -ExecutionPolicy Bypass -File ./start-dev.ps1
```

### 방법 3: 수동 실행 (문제가 계속될 때)

```powershell
cd c:\projects\youtube_down\app

# 1. 모든 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# 2. 캐시 완전 삭제
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# 3. ADB 포트 포워딩
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 4. 환경 변수 설정 및 Metro 서버 시작
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "localhost"
npx expo start --dev-client --localhost --port 8081
```

## ✅ 확인 사항

Metro 서버가 시작되면 다음 메시지를 확인하세요:

### 정상 (localhost 사용)
```
Metro waiting on exp://localhost:8081
```

### 문제 (네트워크 IP 사용)
```
Metro waiting on exp://10.11.227.4:8081  ❌ 타임아웃 발생!
```

## 🔧 추가 문제 해결

### 여전히 네트워크 IP로 실행되는 경우

1. **방화벽 확인**: Windows 방화벽이 localhost 연결을 차단하지 않는지 확인
2. **다른 Metro 서버 확인**: 다른 터미널에서 Metro 서버가 실행 중인지 확인
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -like '*node*'}
   ```
3. **포트 확인**: 8081 포트가 사용 중인지 확인
   ```powershell
   netstat -ano | findstr :8081
   ```

## 💡 핵심 포인트

1. **USB 연결 = localhost 필수**: 네트워크 IP는 타임아웃 발생
2. **캐시 완전 삭제**: 이전 설정이 남아있으면 문제 발생
3. **환경 변수 설정**: `EXPO_PACKAGER_PROXY_URL`로 localhost 강제
4. **ADB 포트 포워딩**: USB 연결 시 필수

## 🎯 빠른 실행

```powershell
cd c:\projects\youtube_down\app
npm run start:dev
```

**그게 전부입니다!** 🚀
