# 간단한 실행 방법

## ✅ 실행 방법 (한 줄만!)

```powershell
cd c:\projects\youtube_down\app
npx expo run:android
```

**끝!** 이제 자동으로:
- USB 연결 감지
- ADB 포트 포워딩 자동 설정
- 빌드
- 설치
- Metro 서버 시작
- 연결

## ⚠️ 여전히 네트워크 IP로 나오면

**캐시를 삭제하고 다시 실행:**

```powershell
cd c:\projects\youtube_down\app

# 캐시 삭제
Remove-Item -Path .expo,node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue

# 다시 실행
npx expo run:android
```

## 🔍 확인

Metro 서버가 시작되면:

**정상 (localhost):**
```
exp+app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081
```

**문제 (네트워크 IP):**
```
exp+app://expo-development-client/?url=http%3A%2F%2F192.168.x.x%3A8081
```

## 💡 핵심

**`npx expo run:android` 하나만 실행하면 됩니다!**

`expo run:android`는 USB 연결을 자동으로 감지하고 `adb reverse`를 설정합니다.
