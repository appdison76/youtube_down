# ShazamKit Android SDK 설정 가이드

Shazam → ACRCloud 2중 폴백에서 Shazam을 1순위로 사용하려면 아래 설정이 필요합니다.

## 1. ShazamKit AAR 다운로드

1. [Apple Developer](https://developer.apple.com/account) 로그인
2. [ShazamKit Android](https://developer.apple.com/shazamkit/android/) 페이지에서 AAR 다운로드
3. `shazamkit-android-release.aar` 파일을 이 폴더에 추가:
   ```
   packages/expo-shazam-module/android/libs/shazamkit-android-release.aar
   ```

## 2. Apple Developer 토큰 (Shazam Catalog용)

Shazam 음악 DB 사용을 위해 JWT(Developer Token)가 필요합니다.

1. Apple Developer → App ID에 **ShazamKit** 활성화, Media Key 생성 후 **.p8** 다운로드
2. **JWT 생성**: 프로젝트 루트의 `server` 폴더에서:
   ```bash
   cd server
   npm install
   P8_PATH=../app/secrets/AuthKey_XXXXX.p8 KEY_ID=FYPT92RXJR TEAM_ID=YQ84HYWRR7 node scripts/generate-shazam-token.js
   ```
   출력된 토큰을 복사합니다.
3. **서버에 토큰 설정**: 서버 환경 변수 `SHAZAM_DEVELOPER_TOKEN`에 위 JWT 설정. (앱이 `/api/shazam-token`으로 토큰을 받아 초기화합니다.)

## 3. build.gradle (이미 설정됨)

AAR 파일이 `libs/`에 있으면 자동으로 의존성이 추가됩니다.

## 4. 현재 상태

- **AAR 미설치**: `isAvailable()` = false → MusicRecognitionScreen이 ACRCloud만 사용
- **AAR 설치 후**: `isAvailable()` = true → Shazam 1순위, 실패 시 ACRCloud 폴백 (구현 완료 시)

## 5. 참고

- [ShazamKit Android 문서](https://developer.apple.com/shazamkit/android/)
- minSdkVersion 21+, Kotlin Coroutines, OkHttp, Retrofit 필요
