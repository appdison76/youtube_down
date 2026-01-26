# 🚨 QR 코드 타임아웃 문제 해결

## 문제
- QR 코드로 연결해도 타임아웃 발생
- 네트워크 IP로 연결이 안 됨

## ✅ 해결 방법

### 방법 1: USB 연결 사용 (가장 빠르고 안정적) ⭐ 추천

```powershell
cd c:\projects\youtube_down\app
npm run start:dev:usb
```

또는

```powershell
npm run start:dev
```

**장점:**
- ✅ 빠른 속도 (USB 직접 연결)
- ✅ 타임아웃 없음
- ✅ 안정적

**사용법:**
1. USB로 폰 연결
2. `npm run start:dev:usb` 실행
3. 앱이 자동으로 연결됨 (QR 코드 불필요)

### 방법 2: QR 코드/네트워크 연결

```powershell
cd c:\projects\youtube_down\app
npm run start:dev:qr
```

**주의사항:**
- 같은 WiFi 네트워크에 연결되어 있어야 함
- 방화벽이 포트 8081을 차단하지 않아야 함
- 네트워크가 불안정하면 타임아웃 발생 가능

### 방법 3: 네트워크 문제 해결

QR 코드 타임아웃이 계속 발생하면:

#### 1. Windows 방화벽 확인

```powershell
# 방화벽 규칙 확인
Get-NetFirewallRule | Where-Object {$_.DisplayName -like '*node*' -or $_.DisplayName -like '*expo*'}
```

포트 8081이 허용되어 있는지 확인하세요.

#### 2. 같은 WiFi 네트워크 확인

- PC와 폰이 **같은 WiFi 네트워크**에 연결되어 있어야 합니다
- 모바일 데이터를 사용하면 연결이 안 될 수 있습니다

#### 3. 네트워크 IP 확인

```powershell
# PC의 네트워크 IP 확인
ipconfig | findstr IPv4
```

Metro 서버가 시작되면 표시되는 IP와 일치하는지 확인하세요.

#### 4. 수동으로 네트워크 IP 설정

```powershell
cd c:\projects\youtube_down\app

# 모든 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# 캐시 삭제
Remove-Item -Path .expo,node_modules\.cache,$env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# 특정 IP로 시작 (예: 192.168.0.100)
$env:EXPO_PACKAGER_PROXY_URL = "http://192.168.0.100:8081"
npx expo start --dev-client --port 8081 --clear
```

## 🔍 문제 진단

### QR 코드 타임아웃 원인

1. **네트워크 문제**
   - PC와 폰이 다른 네트워크에 연결됨
   - 방화벽이 포트를 차단함
   - 네트워크가 불안정함

2. **Metro 서버 문제**
   - 캐시 오류로 서버가 제대로 시작되지 않음
   - 포트가 이미 사용 중임

3. **앱 문제**
   - 개발 빌드가 오래된 버전임
   - 앱이 네트워크 권한을 요청하지 않음

## 💡 추천 방법

**USB 연결을 사용하세요!** 

```powershell
npm run start:dev:usb
```

이 방법이:
- ✅ 가장 빠름
- ✅ 가장 안정적
- ✅ 타임아웃 없음
- ✅ QR 코드 불필요

## 🎯 빠른 해결

```powershell
cd c:\projects\youtube_down\app

# USB 연결 사용 (추천)
npm run start:dev:usb

# 또는 QR 코드 사용
npm run start:dev:qr
```

**USB 연결이 가장 확실합니다!** 🚀
