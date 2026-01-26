# 개발 빌드 연결 오류 빠른 해결

## 문제
`npx expo run:android` 실행 후 앱 로딩 시 `SocketTimeoutException: timeout` 오류

## 원인
개발 빌드 실행 시 Metro 서버 연결이 끊어지거나, 앱이 실행될 때 Metro 서버가 준비되지 않음

## 해결 방법 (순서대로)

### 방법 1: 올바른 실행 순서 (권장)

**중요: Metro 서버를 먼저 실행하고 유지한 상태에서 개발 빌드를 실행하세요!**

```powershell
# 터미널 1: Metro 서버를 localhost로 먼저 실행
cd c:\projects\youtube_down\app
npm run start:clean

# Metro 서버가 완전히 시작될 때까지 대기
# "Metro waiting on exp://localhost:8081" 같은 메시지가 나타나야 함
# ⚠️ 이 터미널은 계속 실행 상태로 유지!
# ⚠️ 네트워크 IP가 아닌 localhost로 시작되었는지 확인!

# 터미널 2: 개발 빌드 실행
cd c:\projects\youtube_down\app
npx expo run:android
```

### 방법 2: 자동 포트 설정 스크립트 사용

```powershell
cd c:\projects\youtube_down\app
npm run android
```

이 스크립트는 자동으로:
1. Metro 서버 포트 확인
2. ADB 포트 포워딩 설정
3. 개발 빌드 실행

### 방법 3: 수동 포트 확인 및 설정

```powershell
# 1. 포트 상태 확인
npm run check:ports

# 2. Metro 서버가 8081에서 실행 중인지 확인
# 3. ADB 포트 포워딩이 8081로 설정되어 있는지 확인

# 4. 일치하지 않으면 수동 설정
adb reverse --remove tcp:8081
adb reverse tcp:8081 tcp:8081

# 5. Metro 서버 시작 (다른 터미널)
npm run start:clean

# 6. 개발 빌드 실행
npx expo run:android
```

## 주의사항

1. **Metro 서버를 먼저 실행**: 개발 빌드 전에 Metro 서버가 실행 중이어야 함
2. **Metro 서버 유지**: 개발 빌드 실행 후에도 Metro 서버 터미널을 닫지 마세요
3. **포트 일치**: Metro 서버 포트와 ADB 포트 포워딩이 일치해야 함
4. **앱 재시작**: 개발 빌드 후 앱이 자동 실행되면, Metro 서버 연결을 위해 앱을 완전히 종료 후 다시 실행

## 추가 문제 해결

여전히 오류가 발생하면:

```powershell
# 1. 모든 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force

# 2. ADB 재시작
adb kill-server
adb start-server

# 3. 포트 포워딩 재설정
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 4. Metro 서버 캐시 삭제 후 시작
npm run start:clean

# 5. 개발 빌드 실행
npx expo run:android
```
