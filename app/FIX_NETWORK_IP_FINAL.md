# 네트워크 IP 문제 최종 해결 방법

## 문제
`expo run:android` 실행 시 Metro 서버가 네트워크 IP(`192.168.x.x:8081`)로 시작됨

## ✅ 해결 방법: Metro 서버를 먼저 localhost로 시작

`expo run:android`는 내부적으로 Metro 서버를 시작하는데, 이때 네트워크 IP를 우선 사용합니다.
**해결책: Metro 서버를 먼저 localhost로 시작한 후 빌드**

### 방법 1: 두 개의 터미널 사용 (가장 확실)

**터미널 1: Metro 서버를 localhost로 먼저 시작**
```powershell
cd c:\projects\youtube_down\app
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client --localhost
```

**터미널 2: 빌드 실행 (Metro 서버가 실행 중인 상태에서)**
```powershell
cd c:\projects\youtube_down\app
npx expo run:android
```

이렇게 하면 `expo run:android`가 이미 실행 중인 localhost Metro 서버를 사용합니다.

### 방법 2: 한 번에 실행 (스크립트)

```powershell
cd c:\projects\youtube_down\app

# 1. ADB 포트 포워딩
adb reverse tcp:8081 tcp:8081

# 2. Metro 서버를 백그라운드로 localhost로 시작
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd c:\projects\youtube_down\app; npx expo start --dev-client --localhost"

# 3. 잠시 대기 (Metro 서버가 시작될 시간)
Start-Sleep -Seconds 5

# 4. 빌드 실행
npx expo run:android
```

## ✅ 확인

Metro 서버가 시작되면:

**정상 (localhost):**
```
› Metro waiting on
exp+app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081
```

**문제 (네트워크 IP):**
```
› Metro waiting on
exp+app://expo-development-client/?url=http%3A%2F%2F192.168.x.x%3A8081
```

## 💡 핵심

**`expo run:android`는 내부적으로 Metro 서버를 시작하는데, 이때 네트워크 IP를 우선 사용합니다.**

**해결책: Metro 서버를 먼저 localhost로 시작한 후 빌드하면, 이미 실행 중인 localhost 서버를 사용합니다.**

## 🎯 추천 방법

**두 개의 터미널을 사용하세요:**

1. **터미널 1**: `npx expo start --dev-client --localhost` (계속 실행 상태로 유지)
2. **터미널 2**: `npx expo run:android` (빌드 실행)

이 방법이 가장 확실합니다!
