# ACRCloud SDK 파일 추가 가이드

## 1. SDK 다운로드

1. **GitHub에서 다운로드**
   - https://github.com/acrcloud/ACRCloudUniversalSDK
   - "Code" → "Download ZIP" 클릭
   - 또는 Git으로 클론: `git clone https://github.com/acrcloud/ACRCloudUniversalSDK.git`

2. **필요한 파일 찾기**
   - 다운로드한 폴더에서 다음 파일들을 찾으세요:
     - `libs/acrcloud-universal-sdk-(version).jar` (예: `acrcloud-universal-sdk-1.2.1.jar`)
     - `libs/libACRCloudUniversalEngine.so` (또는 `libs-so-tinyalsa/libACRCloudUniversalEngine.so`)

## 2. 파일 추가

### JAR 파일 추가
1. `acrcloud-universal-sdk-(version).jar` 파일을 복사
2. `app/packages/expo-acrcloud-module/android/libs/` 폴더에 붙여넣기
3. 파일명을 `acrcloud-universal-sdk.jar`로 변경 (선택사항, build.gradle에서 파일명 지정 가능)

### SO 파일 추가
1. `libACRCloudUniversalEngine.so` 파일을 복사
2. 다음 폴더에 각각 붙여넣기:
   - `app/packages/expo-acrcloud-module/android/src/main/jniLibs/armeabi-v7a/libACRCloudUniversalEngine.so`
   - `app/packages/expo-acrcloud-module/android/src/main/jniLibs/arm64-v8a/libACRCloudUniversalEngine.so`
   - `app/packages/expo-acrcloud-module/android/src/main/jniLibs/x86/libACRCloudUniversalEngine.so` (에뮬레이터용)
   - `app/packages/expo-acrcloud-module/android/src/main/jniLibs/x86_64/libACRCloudUniversalEngine.so` (에뮬레이터용)

## 3. build.gradle 활성화

`app/packages/expo-acrcloud-module/android/build.gradle` 파일을 열고:

```gradle
dependencies {
  implementation "androidx.annotation:annotation:1.2.0"
  // 아래 주석 해제:
  implementation files('libs/acrcloud-universal-sdk.jar')
  // 또는 정확한 파일명 사용:
  // implementation files('libs/acrcloud-universal-sdk-1.2.1.jar')
}
```

## 4. ACRCloudModule.kt 활성화

`app/packages/expo-acrcloud-module/android/src/main/java/com/appdison76/acrcloud/ACRCloudModule.kt` 파일을 열고:

1. **Import 문 주석 해제** (12-15줄):
```kotlin
import com.acrcloud.utils.ACRCloudConfig
import com.acrcloud.utils.ACRCloudClient
import com.acrcloud.utils.IACRCloudListener
import com.acrcloud.utils.ACRCloudResult
```

2. **변수 선언 주석 해제** (20-21줄):
```kotlin
private var mClient: ACRCloudClient? = null
private var mConfig: ACRCloudConfig? = null
```

3. **각 함수의 TODO 부분 주석 해제**:
   - `initialize()` 함수 내부
   - `startRecognizing()` 함수 내부
   - `stopRecognizing()` 함수 내부
   - `handleRecognitionResult()` 함수 전체
   - `onDestroy()` 함수 내부

## 5. 빌드 및 테스트

1. 프로젝트 클린:
```bash
cd app/android
./gradlew clean
```

2. 빌드:
```bash
cd app
npm run android
```

## 문제 해결

### 빌드 에러: "Cannot resolve symbol 'ACRCloudClient'"
- SDK JAR 파일이 `libs/` 폴더에 있는지 확인
- `build.gradle`에서 `implementation files('libs/...')` 주석이 해제되었는지 확인
- 프로젝트를 다시 빌드 (Clean → Rebuild)

### 런타임 에러: "UnsatisfiedLinkError"
- SO 파일이 올바른 `jniLibs/` 폴더에 있는지 확인
- 모든 아키텍처 폴더에 SO 파일이 있는지 확인
- 앱을 완전히 제거하고 다시 설치

### 인식이 작동하지 않음
- ACRCloud 계정 정보가 올바른지 확인 (`MusicRecognitionScreen.js`)
- 마이크 권한이 허용되었는지 확인
- 로그 확인: `adb logcat | grep ACRCloudModule`
