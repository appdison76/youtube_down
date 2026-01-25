# ACRCloud Module

ACRCloud 음악 인식 기능을 위한 Expo 모듈입니다.

## SDK 파일 추가 방법

1. **ACRCloud SDK 다운로드**
   - https://github.com/acrcloud/ACRCloudUniversalSDK 에서 다운로드
   - 또는 ACRCloud 공식 사이트에서 다운로드

2. **JAR 파일 추가**
   - `acrcloud-universal-sdk-(version).jar` 파일을 `android/libs/` 폴더에 복사
   - `build.gradle`에서 주석 해제: `implementation files('libs/acrcloud-universal-sdk.jar')`

3. **네이티브 라이브러리 (.so 파일) 추가**
   - `libACRCloudUniversalEngine.so` 파일을 다음 폴더에 복사:
     - `android/src/main/jniLibs/armeabi-v7a/`
     - `android/src/main/jniLibs/arm64-v8a/`
     - `android/src/main/jniLibs/x86/` (에뮬레이터용)
     - `android/src/main/jniLibs/x86_64/` (에뮬레이터용)

4. **코드 활성화**
   - `ACRCloudModule.kt` 파일에서 주석 처리된 import 문과 코드를 활성화
   - `// import com.acrcloud.utils.*` 주석 해제
   - `// TODO:` 부분의 코드 주석 해제

5. **빌드**
   - 모듈을 다시 빌드하면 ACRCloud SDK가 통합됩니다

## 사용법

```javascript
import ACRCloudModule from '../modules/ACRCloudModule';

// 초기화
await ACRCloudModule.initialize(accessKey, accessSecret, host);

// 음악 인식 시작
await ACRCloudModule.startRecognizing();

// 음악 인식 중지
await ACRCloudModule.stopRecognizing();
```

## 이벤트

- `onRecognitionResult`: 음악 인식 성공 시 호출
- `onRecognitionError`: 음악 인식 실패 시 호출
- `onVolumeChanged`: 볼륨 변화 시 호출
