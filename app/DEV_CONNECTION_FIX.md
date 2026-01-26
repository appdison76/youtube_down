# 개발 빌드 연결 문제 해결 가이드

## 문제 증상
- 개발 빌드 후 앱에서 "There was a problem loading the project" 오류
- `java.net.SocketTimeoutException: timeout` 오류
- Metro 서버와 개발 빌드 앱 간 연결 실패
- **개발 빌드 후 앱이 자동으로 설치되고 실행될 때 타임아웃 발생**

## 원인
1. **포트 불일치**: Metro 서버 포트와 ADB 포트 포워딩이 일치하지 않음
   - Metro 서버가 8081에서 실행 중인데 ADB는 8082로 포워딩
   - 또는 그 반대
2. **Metro 서버 미실행**: 개발 빌드 앱이 실행될 때 Metro 서버가 실행되지 않음
3. **ADB 포트 포워딩 누락**: ADB 포트 포워딩이 설정되지 않음
4. **포트 충돌**: Metro 서버가 8081 대신 8082로 시작됨
5. **Metro 캐시 오류**: 캐시 파일 손상으로 인한 문제
6. **프로세스 충돌**: 이전 Metro/Node 프로세스가 남아있음

## ⚠️ 중요: 개발 빌드 전 필수 체크리스트

개발 빌드를 실행하기 **전에** 반드시 확인:

1. ✅ **Metro 서버가 실행 중인지 확인**
2. ✅ **Metro 서버가 어떤 포트에서 실행 중인지 확인** (8081 또는 8082)
3. ✅ **ADB 포트 포워딩이 Metro 서버 포트와 일치하는지 확인**
4. ✅ **개발 빌드 실행 후에도 Metro 서버가 계속 실행 중인지 확인**

## 해결 방법 (순서대로 시도)

### 1. 모든 프로세스 종료 및 포트 정리
```powershell
# Node/Expo 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like "*node*" -or $_.ProcessName -like "*expo*"} | Stop-Process -Force

# 포트 확인
netstat -ano | findstr ":8081 :8082"

# 필요시 특정 포트 사용 프로세스 종료
# netstat -ano | findstr ":8081"  # PID 확인
# taskkill /PID [PID번호] /F
```

### 2. Metro 캐시 완전 삭제 (중요: 모든 Node 프로세스 종료 후 실행)

**⚠️ 먼저 모든 Node/Expo 프로세스를 종료해야 합니다!**

```powershell
cd c:\projects\youtube_down\app

# 방법 1: Expo의 --clear 옵션 사용 (권장)
# 이 방법이 가장 안전하고 확실합니다
npx expo start --clear --port 8081

# 방법 2: 수동 캐시 삭제 (프로세스 종료 후)
# 1단계: 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force

# 2단계: 잠시 대기 (파일 잠금 해제 대기)
Start-Sleep -Seconds 2

# 3단계: 캐시 삭제
if (Test-Path .\.expo) { 
    Remove-Item -Recurse -Force .\.expo -ErrorAction SilentlyContinue 
}
if (Test-Path .\node_modules\.cache) { 
    Remove-Item -Recurse -Force .\node_modules\.cache -ErrorAction SilentlyContinue 
}

# 4단계: Metro 임시 캐시 삭제 (TEMP 폴더)
Get-ChildItem $env:TEMP -Filter "metro-*" -ErrorAction SilentlyContinue | 
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# 5단계: Metro 파일 맵 캐시 삭제
Get-ChildItem $env:TEMP -Filter "metro-file-map-*" -ErrorAction SilentlyContinue | 
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
```

### 3. ADB 포트 포워딩 재설정

**옵션 A: 8081 포트 사용 (표준)**
```powershell
# 기존 포트 포워딩 제거
adb reverse --remove tcp:8081
adb reverse --remove tcp:8082

# 8081 포트 포워딩 설정
adb reverse tcp:8081 tcp:8081

# 확인
adb reverse --list
```

**옵션 B: 8082 포트 사용 (8081이 사용 중일 때)**
```powershell
# 기존 포트 포워딩 제거
adb reverse --remove tcp:8081
adb reverse --remove tcp:8082

# 8082 포트 포워딩 설정
adb reverse tcp:8082 tcp:8082

# 확인
adb reverse --list
```

**참고**: Expo 서버가 8082로 시작되었다면, ADB 포트 포워딩도 8082로 설정해야 합니다.

### 4. Expo 서버 시작

**옵션 A: 8081 포트 사용 (표준)**
```powershell
cd c:\projects\youtube_down\app

# 캐시 삭제 후 8081 포트로 시작
npx expo start --clear --port 8081

# 또는
npm start -- --clear --port 8081
```

**옵션 B: 8082 포트 사용 (8081이 사용 중일 때)**
```powershell
cd c:\projects\youtube_down\app

# 캐시 삭제 후 8082 포트로 시작
npx expo start --clear --port 8082

# ADB 포트 포워딩도 8082로 설정 필요
adb reverse --remove tcp:8082
adb reverse tcp:8082 tcp:8082
```

**중요**: Expo 서버 포트와 ADB 포트 포워딩이 일치해야 합니다!
- Expo가 8081로 시작 → ADB도 8081로 포워딩
- Expo가 8082로 시작 → ADB도 8082로 포워딩

### 5. 개발 빌드 앱에서 연결 확인
- 앱을 완전히 종료 후 다시 실행
- "Reload" 버튼 클릭
- 또는 앱을 재설치: `npx expo run:android`

## 빠른 해결 방법 (가장 권장) ⭐

**Metro 캐시 오류가 발생한 경우:**

**8081 포트 사용 (표준):**
```powershell
cd c:\projects\youtube_down\app

# 1. 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. ADB 포트 재설정 (8081)
adb reverse --remove tcp:8081
adb reverse tcp:8081 tcp:8081

# 3. Expo 서버 시작 (--clear 옵션으로 캐시 자동 삭제)
npx expo start --clear --port 8081
```

**8082 포트 사용 (8081이 사용 중일 때):**
```powershell
cd c:\projects\youtube_down\app

# 1. 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force -ErrorAction SilentlyContinue

# 2. ADB 포트 재설정 (8082)
adb reverse --remove tcp:8082
adb reverse tcp:8082 tcp:8082

# 3. Expo 서버 시작 (8082 포트)
npx expo start --clear --port 8082
```

**한 줄로 해결 (8081):**
```powershell
cd c:\projects\youtube_down\app; Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force -ErrorAction SilentlyContinue; adb reverse --remove tcp:8081; adb reverse tcp:8081 tcp:8081; npx expo start --clear --port 8081
```

**한 줄로 해결 (8082):**
```powershell
cd c:\projects\youtube_down\app; Get-Process | Where-Object {$_.ProcessName -like "*node*"} | Stop-Process -Force -ErrorAction SilentlyContinue; adb reverse --remove tcp:8082; adb reverse tcp:8082 tcp:8082; npx expo start --clear --port 8082
```

## 자동 해결 스크립트 (상세 버전)

```powershell
cd c:\projects\youtube_down\app

# 1. 프로세스 종료
Write-Host "Node 프로세스 종료 중..."
Get-Process | Where-Object {$_.ProcessName -like "*node*" -or $_.ProcessName -like "*expo*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. 캐시 삭제
Write-Host "캐시 삭제 중..."
if (Test-Path .\.expo) { 
    Remove-Item -Recurse -Force .\.expo -ErrorAction SilentlyContinue 
    Write-Host ".expo 캐시 삭제 완료"
}
if (Test-Path .\node_modules\.cache) { 
    Remove-Item -Recurse -Force .\node_modules\.cache -ErrorAction SilentlyContinue 
    Write-Host "node_modules 캐시 삭제 완료"
}
Get-ChildItem $env:TEMP -Filter "metro-*" -ErrorAction SilentlyContinue | 
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $env:TEMP -Filter "metro-file-map-*" -ErrorAction SilentlyContinue | 
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Metro 임시 캐시 삭제 완료"

# 3. ADB 포트 재설정
Write-Host "ADB 포트 재설정 중..."
adb reverse --remove tcp:8081
adb reverse tcp:8081 tcp:8081
Write-Host "ADB 포트 재설정 완료"

# 4. Expo 서버 시작
Write-Host "Expo 서버 시작 중..."
npx expo start --clear --port 8081
```

## 예방 방법

### package.json에 스크립트 추가
```json
{
  "scripts": {
    "start": "expo start --port 8081",
    "start:clean": "expo start --clear --port 8081",
    "android": "expo run:android",
    "fix:connection": "adb reverse --remove tcp:8081 && adb reverse tcp:8081 tcp:8081 && expo start --clear --port 8081"
  }
}
```

사용:
```powershell
npm run fix:connection
```

## 추가 문제 해결

### 방화벽 문제
Windows 방화벽에서 Node.js와 Expo 허용:
1. Windows 보안 → 방화벽 및 네트워크 보호
2. 고급 설정 → 인바운드 규칙
3. Node.js 허용 확인

### USB 디버깅 재설정
```powershell
# ADB 서버 재시작
adb kill-server
adb start-server

# 연결 확인
adb devices

# 포트 포워딩 재설정
adb reverse tcp:8081 tcp:8081
```

### 개발 빌드 앱 재설치
```powershell
cd c:\projects\youtube_down\app
npx expo run:android
```

## 개발 빌드 실행 순서 (중요!) ⭐

### 방법 1: 자동 포트 설정 (권장) ⭐

**가장 간단한 방법 - 포트를 자동으로 맞춰줍니다:**

```powershell
cd c:\projects\youtube_down\app

# 1단계: Metro 서버 시작 (8081 또는 8082 중 아무거나)
npx expo start --clear --port 8081
# 또는
npx expo start --clear --port 8082

# 2단계: 다른 터미널에서 개발 빌드 실행 (포트 자동 설정됨!)
npm run android
```

**`npm run android`는 자동으로:**
1. Metro 서버가 어떤 포트에서 실행 중인지 감지
2. 그 포트로 ADB 포트 포워딩 자동 설정
3. 개발 빌드 실행

**수동으로 실행하려면:**
```powershell
npm run android:manual
```

### 방법 2: 수동 포트 설정

**올바른 순서:**

```powershell
cd c:\projects\youtube_down\app

# 1단계: Metro 서버 먼저 시작 (8081 또는 8082)
# 옵션 A: 8081 포트 사용
npx expo start --clear --port 8081

# 옵션 B: 8082 포트 사용 (8081이 사용 중일 때)
npx expo start --clear --port 8082

# 2단계: ADB 포트 포워딩 설정 (Metro 서버 포트와 일치해야 함!)
# Metro가 8081이면:
adb reverse --remove tcp:8081
adb reverse tcp:8081 tcp:8081

# Metro가 8082이면:
adb reverse --remove tcp:8082
adb reverse tcp:8082 tcp:8082

# 3단계: 다른 터미널에서 개발 빌드 실행 (Metro 서버는 계속 실행 중이어야 함!)
npx expo run:android
```

**❌ 잘못된 순서:**
- 개발 빌드를 먼저 실행하고 나중에 Metro 서버 시작 → 타임아웃 오류 발생
- Metro 서버 포트와 ADB 포트 포워딩이 다름 → 타임아웃 오류 발생
- Metro 서버가 8082에서 실행 중인데 ADB는 8081로 포워딩 → 타임아웃 오류 발생
- Metro 서버가 8081에서 실행 중인데 ADB는 8082로 포워딩 → 타임아웃 오류 발생

**✅ 포트 확인 체크리스트:**
1. Metro 서버가 어떤 포트에서 실행 중인지 확인
2. ADB 포트 포워딩이 Metro 서버 포트와 일치하는지 확인
3. 개발 빌드 실행 전에 반드시 확인!

## 개발 빌드 후 타임아웃 오류 해결

**개발 빌드 후 앱이 자동으로 실행될 때 타임아웃이 발생하는 경우:**

### 상황 1: USB 연결인데 네트워크 IP로 연결 시도

**증상**: 앱이 `http://10.x.x.x:8081` 같은 네트워크 IP로 연결을 시도하는 경우

**해결 방법:**
```powershell
# 1. ADB 포트 포워딩 확인 및 재설정
adb reverse --remove tcp:8081
adb reverse tcp:8081 tcp:8081
adb reverse --list  # 확인: tcp:8081 tcp:8081

# 2. Metro 서버가 localhost에서 접근 가능한지 확인
# 브라우저에서 http://localhost:8081 접속 시도

# 3. 앱에서 "Reload" 버튼 클릭
# 또는 앱 완전 종료 후 다시 실행
```

### 상황 2: 포트 불일치

```powershell
# 1. 현재 ADB 포트 포워딩 확인
adb reverse --list

# 2. Metro 서버가 실행 중인지 확인
# 브라우저에서 http://localhost:8081 또는 http://localhost:8082 접속 시도

# 3. 포트 불일치 확인 및 수정
# 예: Metro가 8082에서 실행 중인데 ADB는 8081로 포워딩된 경우
adb reverse --remove tcp:8081
adb reverse tcp:8082 tcp:8082

# 4. 앱에서 "Reload" 버튼 클릭 또는 앱 재시작
```

### 상황 3: Metro 서버가 실행되지 않음

```powershell
# Metro 서버 시작
cd c:\projects\youtube_down\app
npx expo start --clear --port 8081

# 다른 터미널에서 ADB 포트 포워딩 확인
adb reverse --list
```

## 참고
- Metro 서버는 기본적으로 8081 포트 사용
- 개발 빌드 앱은 **빌드 시점에 실행 중인 Metro 서버의 포트**를 감지하거나 기본적으로 8081 포트로 연결 시도
- 포트가 충돌하면 자동으로 다른 포트(8082 등)로 변경되지만, 이 경우 **ADB 포트 포워딩도 함께 변경해야 함**
- `--port 8081` 또는 `--port 8082` 옵션으로 포트를 강제 지정하는 것이 안전함
- **개발 빌드 실행 중에는 Metro 서버가 계속 실행 중이어야 함**

## 네트워크 IP vs localhost

**USB 연결인 경우:**
- 앱은 `localhost` 또는 `127.0.0.1`을 사용해야 함
- ADB reverse 포트 포워딩이 자동으로 처리
- 네트워크 IP(`10.x.x.x`)로 연결 시도하면 타임아웃 발생 가능

**무선 디버깅인 경우:**
- 네트워크 IP 사용 가능
- ADB reverse 대신 직접 네트워크 연결 사용

**현재 상태 확인:**
```powershell
# ADB 연결 방식 확인
adb devices
# USB 연결: "device"로 표시
# 무선 연결: "IP:PORT"로 표시

# 포트 포워딩 확인
adb reverse --list
# USB 연결: "tcp:8081 tcp:8081" 표시되어야 함
```
