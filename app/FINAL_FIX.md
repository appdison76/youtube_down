# 최종 해결 방법

## 문제
`npm run start:dev` 실행해도 여전히 네트워크 IP(`10.11.227.4:8081`)로 실행됨

## 해결 방법

### 1단계: 모든 프로세스 종료 및 캐시 삭제

```powershell
cd c:\projects\youtube_down\app

# 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 캐시 삭제
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue
```

### 2단계: ADB 포트 포워딩 설정

```powershell
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
```

### 3단계: Metro 서버 시작 (localhost 강제)

```powershell
# 방법 1: npm 스크립트 사용
npm run start:dev

# 방법 2: 직접 실행 (더 확실)
expo start --dev-client --localhost
```

### 4단계: 확인

Metro 서버 터미널에서 다음 메시지 확인:
- ✅ `Metro waiting on exp://localhost:8081` (정상)
- ❌ `Metro waiting on exp://10.11.227.4:8081` (문제)

## 한 번에 실행

```powershell
cd c:\projects\youtube_down\app

# 모든 프로세스 종료 및 캐시 삭제
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue

# ADB 포트 포워딩 설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# Metro 서버 시작
expo start --dev-client --localhost
```

## 핵심 포인트

1. **캐시 완전 삭제**: 이전 설정이 캐시에 남아있을 수 있음
2. **--localhost 옵션**: 네트워크 IP 대신 localhost 강제 사용
3. **--dev-client 옵션**: 개발 빌드용 최적화
