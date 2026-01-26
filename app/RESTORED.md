# 원래 설정으로 복원 완료

## ✅ 복원된 설정

주식계산기와 **정확히 동일한** 설정으로 복원했습니다:

### package.json
```json
{
  "scripts": {
    "start": "expo start --tunnel",
    "start:dev": "adb reverse tcp:8081 tcp:8081 && expo start --dev-client",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web"
  }
}
```

### .expo/settings.json
```json
{
  "hostType": "localhost",
  "dev": true,
  "minify": false,
  "urlRandomness": null,
  "https": false
}
```

## 🎯 사용 방법

### 개발 빌드 실행
```powershell
cd c:\projects\youtube_down\app
npx expo run:android
```

이제 주식계산기와 **정확히 동일하게** 작동합니다:
- `> Installing C:\projects\youtube_down\app\android\app\build\outputs\apk\debug\app-debug.apk`
- `> Opening exp+app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081`

## ✅ 확인

빌드 후 다음 메시지가 나타나야 합니다:

```
> Installing C:\projects\youtube_down\app\android\app\build\outputs\apk\debug\app-debug.apk
> Opening exp+app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081 on [기기명]
```

**주식계산기와 동일한 형식입니다!**
