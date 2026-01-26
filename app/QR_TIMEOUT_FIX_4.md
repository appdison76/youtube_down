# 🚨 QR 코드 타임아웃 문제 - 추가 해결 방법

## 방법 4: 터널 모드 사용 (네트워크 문제 완전 우회)

네트워크 연결이 안 될 때 사용하는 방법입니다.

```powershell
cd c:\projects\youtube_down\app

# 모든 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# 캐시 삭제
Remove-Item -Path .expo,node_modules\.cache,$env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# 터널 모드로 시작 (네트워크 문제 완전 우회)
npx expo start --dev-client --tunnel --clear
```

**장점:**
- ✅ 네트워크 설정 불필요
- ✅ 방화벽 문제 우회
- ✅ 다른 네트워크에서도 작동

**단점:**
- ⚠️ 초기 연결이 느릴 수 있음
- ⚠️ Expo 서버를 통해 연결됨

## 방법 5: 포트 변경 (포트 충돌 해결)

8081 포트가 사용 중이거나 차단된 경우:

```powershell
cd c:\projects\youtube_down\app

# 모든 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# 캐시 삭제
Remove-Item -Path .expo,node_modules\.cache,$env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# 다른 포트로 시작 (예: 8082)
adb reverse tcp:8082 tcp:8082
npx expo start --dev-client --port 8082 --clear
```

## 방법 6: 방화벽 규칙 추가

Windows 방화벽이 포트를 차단하는 경우:

```powershell
# 관리자 권한으로 PowerShell 실행 후:

# Node.js 허용
New-NetFirewallRule -DisplayName "Node.js Metro Bundler" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow

# 또는 모든 Node.js 프로세스 허용
New-NetFirewallRule -DisplayName "Node.js" -Program "C:\Program Files\nodejs\node.exe" -Action Allow
```

## 방법 7: 네트워크 어댑터 확인

여러 네트워크 어댑터가 있는 경우 올바른 IP 사용:

```powershell
# 모든 네트워크 IP 확인
ipconfig

# 특정 IP로 강제 설정
$env:EXPO_PACKAGER_PROXY_URL = "http://192.168.0.100:8081"  # 실제 IP로 변경
npx expo start --dev-client --port 8081 --clear
```

## 방법 8: 완전 초기화 후 재시작

모든 설정을 초기화하고 처음부터 시작:

```powershell
cd c:\projects\youtube_down\app

# 1. 모든 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# 2. 모든 캐시 삭제
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path .expo-shared -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\haste-map-* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\react-* -Recurse -Force -ErrorAction SilentlyContinue

# 3. ADB 재시작
adb kill-server
adb start-server
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 4. 환경 변수 초기화
$env:EXPO_PACKAGER_PROXY_URL = $null
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $null

# 5. Metro 서버 시작
npx expo start --dev-client --clear
```

## 🎯 가장 확실한 방법

**USB 연결을 사용하세요!**

```powershell
npm run start:dev:usb
```

이 방법이 가장 빠르고 안정적이며 타임아웃이 없습니다.

QR 코드가 꼭 필요하다면:
1. 같은 WiFi 네트워크 확인
2. 방화벽 규칙 추가
3. 터널 모드 사용 (`--tunnel`)
