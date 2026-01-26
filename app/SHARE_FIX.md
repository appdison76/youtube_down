# YouTube 공유 기능 수정 가이드

## 문제
아이콘 변경 후 YouTube에서 공유할 때 공유창에 앱이 나타나지 않음

## 수정 사항

### 1. AndroidManifest.xml에 Intent Filter 추가
- `ACTION_SEND` intent-filter 추가 (텍스트 공유)
- YouTube URL 직접 열기 intent-filter 추가
- `www.youtube.com`, `youtu.be`, `m.youtube.com` 지원

### 2. MainActivity에 Intent 처리 추가
- `onNewIntent()` 메서드 추가 (앱이 실행 중일 때 공유 받기)
- `handleIntent()` 메서드로 공유 intent 처리
- YouTube URL 감지 및 React Native로 전달

## 해결 방법

### 1. 앱 재설치 (필수)
아이콘 변경 후에는 **반드시 앱을 재설치**해야 공유창에 나타납니다:

```powershell
# 기존 앱 제거
adb uninstall com.appdison76.app

# 새로 빌드 및 설치
cd c:\projects\youtube_down\app
npm run android
```

또는 수동으로:
1. 폰에서 앱 제거
2. 새로 빌드한 APK 설치

### 2. Android 시스템 캐시 초기화 (선택사항)
공유창이 여전히 나타나지 않으면:

```powershell
# Android 시스템 캐시 초기화
adb shell pm clear com.android.providers.settings
```

또는 폰에서:
1. 설정 → 앱 → 모든 앱 보기
2. "설정" 앱 찾기
3. 저장공간 → 데이터 삭제
4. 재부팅

### 3. 공유창에서 앱 찾기
공유창에서:
1. "더보기" 또는 "추가 옵션" 클릭
2. 앱 목록에서 "MelodySnap" 찾기
3. 찾으면 고정하거나 자주 사용하는 앱으로 설정

## 확인 방법

### 테스트
1. YouTube 앱에서 동영상 열기
2. 공유 버튼 클릭
3. 공유창에 "MelodySnap" 앱이 나타나는지 확인
4. 앱 선택 시 YouTube URL이 전달되는지 확인

### 로그 확인
```powershell
adb logcat | findstr "MainActivity"
```

공유할 때 다음과 같은 로그가 나타나야 함:
```
MainActivity: Handling intent: android.intent.action.SEND
MainActivity: Received shared text: https://www.youtube.com/...
MainActivity: YouTube URL detected, sending to React Native
```

## 참고
- 아이콘 변경 후에는 항상 앱을 재설치해야 공유창에 반영됨
- Android 시스템이 intent-filter를 캐시하므로 재설치가 필요함
- 공유창에 나타나지 않으면 Android 시스템 캐시 초기화 시도
