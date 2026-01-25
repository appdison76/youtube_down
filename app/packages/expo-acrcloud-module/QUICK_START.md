# ACRCloud SDK 빠른 시작 가이드

## SDK 파일 추가 후 활성화 단계

### 1단계: SDK 파일 추가
1. https://github.com/acrcloud/ACRCloudUniversalSDK 에서 다운로드
2. 파일 복사:
   - `libs/acrcloud-universal-sdk-*.jar` → `android/libs/acrcloud-universal-sdk.jar`
   - `libs/libACRCloudUniversalEngine.so` → 각 `jniLibs/` 폴더

### 2단계: build.gradle 활성화
`android/build.gradle` 파일에서:
```gradle
dependencies {
  implementation "androidx.annotation:annotation:1.2.0"
  implementation files('libs/acrcloud-universal-sdk.jar')  // 이 줄 주석 해제
}
```

### 3단계: ACRCloudModule.kt 활성화
`ACRCloudModule.kt` 파일에서:

1. **Import 문 활성화** (12-15줄):
```kotlin
import com.acrcloud.utils.ACRCloudConfig
import com.acrcloud.utils.ACRCloudClient
import com.acrcloud.utils.IACRCloudListener
import com.acrcloud.utils.ACRCloudResult
```

2. **변수 선언 활성화** (20-21줄):
```kotlin
private var mClient: ACRCloudClient? = null
private var mConfig: ACRCloudConfig? = null
```

3. **각 함수의 주석 블록 활성화**:
   - `initialize()` 함수: 37-72줄 주석 해제, 74-77줄 제거
   - `startRecognizing()` 함수: 100-115줄 주석 해제, 117-121줄 제거
   - `stopRecognizing()` 함수: 138-143줄 주석 해제
   - `handleRecognitionResult()` 함수: 165-226줄 주석 해제
   - `onDestroy()` 함수: 231-240줄 주석 해제

### 4단계: 빌드
```bash
cd app/android
./gradlew clean
cd ..
npm run android
```

## 확인 사항

빌드 성공 후:
- ✅ "음악 찾기" 탭이 표시됨
- ✅ 버튼 클릭 시 마이크 권한 요청
- ✅ 음악 인식 시작/중지 작동
- ✅ 인식 결과가 YouTube 검색으로 연결

## 문제 해결

**빌드 에러: "Cannot resolve symbol"**
→ SDK 파일이 `libs/` 폴더에 있는지 확인

**런타임 에러: "UnsatisfiedLinkError"**
→ SO 파일이 모든 `jniLibs/` 폴더에 있는지 확인

**인식이 작동하지 않음**
→ 로그 확인: `adb logcat | grep ACRCloudModule`
