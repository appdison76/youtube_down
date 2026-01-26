# Metro 캐시 오류 해결

## 오류 메시지
```
Error: Unable to deserialize cloned data
```

## 원인
Metro Bundler의 캐시 파일이 손상되었거나 호환되지 않는 버전

## 해결 방법

### 방법 1: --clear 옵션 사용 (가장 간단)

```powershell
# Metro 서버 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force

# 캐시 삭제 후 시작
cd c:\projects\youtube_down\app
npm run start:clean
```

### 방법 2: 수동 캐시 삭제 (더 확실)

```powershell
# 1. 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force
Start-Sleep -Seconds 2

# 2. Metro 캐시 삭제
cd c:\projects\youtube_down\app

# .expo 폴더 삭제
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue

# node_modules/.cache 삭제
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue

# 임시 Metro 캐시 삭제
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# 3. ADB 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 4. 환경 변수 설정 후 Metro 서버 시작
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
npx expo start --clear --port 8081 --localhost
```

### 방법 3: 한 번에 실행 (권장)

```powershell
# 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 캐시 삭제
cd c:\projects\youtube_down\app
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# ADB 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 환경 변수 설정 후 Metro 서버 시작
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
npx expo start --clear --port 8081 --localhost
```

## 확인

Metro 서버가 정상적으로 시작되면:
- ✅ "Metro waiting on exp://localhost:8081" 메시지 확인
- ✅ QR 코드가 나타남
- ✅ 오류 없이 실행됨

## 주의사항

1. **모든 Node 프로세스를 먼저 종료**해야 캐시 파일이 삭제됩니다
2. **2초 대기** 후 캐시 삭제 (파일 잠금 해제 대기)
3. **환경 변수 설정** 후 Metro 서버 시작 (localhost 강제)
