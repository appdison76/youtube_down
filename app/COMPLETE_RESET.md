# 완전 초기화 및 재설정 가이드

## 문제
- 타임아웃 발생
- 네트워크 IP로 나옴 (localhost가 아님)
- QR 코드로 해도 타임아웃
- 설정이 안 바뀜

## 해결 방법: 완전 초기화

### 1단계: 모든 프로세스 종료 및 캐시 완전 삭제

```powershell
cd c:\projects\youtube_down\app

# 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# 모든 캐시 완전 삭제
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path .expo-shared -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\haste-map-* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\react-* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:LOCALAPPDATA\Temp\metro-* -Recurse -Force -ErrorAction SilentlyContinue
```

### 2단계: ADB 재시작 및 포트 포워딩

```powershell
# ADB 서버 재시작
adb kill-server
adb start-server

# 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
```

### 3단계: 환경 변수 확인 및 설정

```powershell
# 환경 변수 확인
$env:EXPO_PACKAGER_PROXY_URL
$env:REACT_NATIVE_PACKAGER_HOSTNAME

# 환경 변수 초기화 (잘못된 값이 있을 수 있음)
$env:EXPO_PACKAGER_PROXY_URL = $null
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $null

# PowerShell 세션 재시작 (환경 변수 완전 초기화)
```

### 4단계: Metro 서버 시작 (주식계산기와 동일)

```powershell
# 주식계산기와 정확히 동일한 명령어
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client
```

## 한 번에 실행

```powershell
cd c:\projects\youtube_down\app

# 1. 모든 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5

# 2. 모든 캐시 삭제
Remove-Item -Path .expo,.expo-shared,node_modules\.cache,$env:TEMP\metro-*,$env:TEMP\haste-map-*,$env:TEMP\react-*,$env:LOCALAPPDATA\Temp\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# 3. ADB 재시작
adb kill-server
adb start-server
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 4. 환경 변수 초기화
$env:EXPO_PACKAGER_PROXY_URL = $null
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $null

# 5. Metro 서버 시작
npx expo start --dev-client
```

## 확인 사항

Metro 서버가 시작되면 다음을 확인:

1. **localhost 사용 확인**:
   - ✅ `exp+app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`
   - ❌ `exp+app://expo-development-client/?url=http%3A%2F%2F192.168.x.x%3A8081`

2. **타임아웃 없이 연결 확인**:
   - 개발 빌드가 자동으로 설치되고 실행되어야 함
   - "Android Bundled" 메시지가 나타나야 함

## 여전히 문제가 있으면

1. **PowerShell 세션 완전 재시작** (새 터미널 열기)
2. **Android Studio 재시작**
3. **폰 재부팅**
4. **USB 디버깅 재연결**
