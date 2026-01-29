# 빌드 가이드

## 📋 빌드 타입 및 방법 전체 정리

### 빌드 타입 × 빌드 방법 매트릭스

| 빌드 타입 | 빌드 방법 | 명령어 | 결과물 | 결과물 위치 | 용도 |
|----------|----------|--------|--------|------------|------|
| **Development** | 순수 로컬 Gradle | `cd app/android && ./gradlew assembleDebug` | `app-debug.apk` | `app/android/app/build/outputs/apk/debug/` | 개발/테스트 |
| **Development** | 일반 로컬 Expo | `cd app && npx expo start` | 개발 서버 | - | 개발 중 핫 리로드 |
| **Development** | 일반 로컬 Expo | `cd app && npx expo run:android` | `app-debug.apk` | `app/android/app/build/outputs/apk/debug/` | 개발 빌드 |
| **Development** | EAS 로컬 | `cd app && eas build --local --profile development` | `app-debug.apk` | `./builds/` | 개발 빌드 (EAS 로컬) |
| **Development** | EAS 클라우드 | `cd app && eas build --profile development` | `app-debug.apk` | EAS 서버 | 개발 빌드 (클라우드) |
| **Debug** | 순수 로컬 Gradle | `cd app/android && ./gradlew assembleDebug` | `app-debug.apk` | `app/android/app/build/outputs/apk/debug/` | 디버깅/테스트 |
| **Debug** | 일반 로컬 Expo | `cd app && npx expo run:android` | `app-debug.apk` | `app/android/app/build/outputs/apk/debug/` | 디버깅/테스트 |
| **Debug** | EAS 로컬 | `cd app && eas build --local --profile preview` | `app-debug.apk` | `./builds/` | 테스트 빌드 (EAS 로컬) |
| **Debug** | EAS 클라우드 | `cd app && eas build --profile preview` | `app-debug.apk` | EAS 서버 | 테스트 빌드 (클라우드) |
| **Release (APK)** | 순수 로컬 Gradle | `cd app/android && ./gradlew assembleRelease` | `app-release-1.1.9.apk` | `app/android/app/build/outputs/apk/release/` | 직접 배포용 (GitHub Release) |
| **Release (APK)** | 일반 로컬 Expo | `cd app && npx expo run:android --variant release` | `app-release.apk` | `app/android/app/build/outputs/apk/release/` | 직접 배포용 |
| **Release (APK)** | EAS 로컬 | `cd app && eas build --local --profile preview --platform android` | `app-release.apk` | `./builds/` | 직접 배포용 (EAS 로컬) |
| **Release (APK)** | EAS 클라우드 | `cd app && eas build --profile preview --platform android` | `app-release.apk` | EAS 서버 | 직접 배포용 (클라우드) |
| **Release (AAB)** | 순수 로컬 Gradle | `cd app/android && ./gradlew bundleRelease` | `app-release.aab` | `app/android/app/build/outputs/bundle/release/` | Play Store 배포용 |
| **Release (AAB)** | 일반 로컬 Expo | `cd app/android && ./gradlew bundleRelease` | `app-release.aab` | `app/android/app/build/outputs/bundle/release/` | Play Store 배포용 |
| **Release (AAB)** | EAS 로컬 | `cd app && eas build --local --profile production --platform android` | `app-release.aab` | `./builds/` | Play Store 배포용 (EAS 로컬) |
| **Release (AAB)** | EAS 클라우드 | `cd app && eas build --profile production --platform android` | `app-release.aab` | EAS 서버 | Play Store 배포용 (클라우드) |

### 빌드 방법별 상세 설명

| 빌드 방법 | 설명 | 장점 | 단점 | 필요 조건 |
|----------|------|------|------|----------|
| **순수 로컬 Gradle** | Gradle을 직접 사용하여 빌드 | 가장 빠름, 세밀한 제어, 의존성 최소 | Android SDK 필요 | Android SDK, JDK |
| **일반 로컬 Expo** | Expo CLI를 통해 로컬에서 빌드 | Expo 프로젝트 최적화, 간단한 명령어 | Expo CLI 필요, Android SDK 필요 | Expo CLI, Android SDK, JDK |
| **EAS 로컬** | EAS Build를 로컬에서 실행 | EAS 설정 활용, 로컬 환경에서 빌드 | EAS CLI 필요, Android SDK 필요 | EAS CLI, Android SDK, JDK |
| **EAS 클라우드** | EAS 서버에서 클라우드 빌드 | 로컬 환경 불필요, 여러 플랫폼 동시 빌드 | 빌드 시간 소요, 인터넷 필요, EAS 계정 필요 | EAS CLI, EAS 계정 |

### 빌드 타입 상세 비교

| 구분 | Development | Debug | Release |
|------|------------|-------|---------|
| **용도** | 개발 중 핫 리로드 | 디버깅/테스트 | 실제 배포 |
| **최적화** | 없음 | 없음 | 코드 난독화, 최적화 |
| **크기** | - | 큼 | 작음 (압축됨) |
| **디버깅** | 가능 | 가능 | 불가능 |
| **서명** | Debug 키스토어 | Debug 키스토어 | Release 키스토어 (또는 Debug) |
| **성능** | 느림 | 느림 | 빠름 |
| **빌드 속도** | 빠름 | 빠름 | 느림 |

### 빌드 결과물 타입

| 타입 | 확장자 | 용도 | 생성 명령어 |
|------|--------|------|------------|
| **APK** | `.apk` | 직접 설치용 | `assembleDebug`, `assembleRelease` |
| **AAB** | `.aab` | Google Play Store용 | `bundleRelease` |

## 🚀 빌드 방법 (3가지)

### 방법 1: Gradle 직접 사용 (권장) ⭐

**장점:**
- 가장 빠름
- 로컬에서 직접 빌드
- 세밀한 제어 가능

**Debug 빌드:**
```bash
cd app/android
./gradlew assembleDebug
# Windows: gradlew.bat assembleDebug

# 결과물 위치:
# app/android/app/build/outputs/apk/debug/app-debug.apk
```

**Release 빌드 (APK):**
```bash
cd app/android
./gradlew assembleRelease
# Windows: gradlew.bat assembleRelease

# 결과물 위치:
# app/android/app/build/outputs/apk/release/app-release-1.1.4.apk
# (파일명에 versionName 포함)
```

**Release 빌드 (AAB - Google Play Store용):**
```bash
cd app/android
./gradlew bundleRelease
# Windows: gradlew.bat bundleRelease

# 결과물 위치:
# app/android/app/build/outputs/bundle/release/app-release.aab
```

---

### 방법 2: Expo CLI 사용

**장점:**
- Expo 프로젝트에 최적화
- 간단한 명령어

**Debug 빌드:**
```bash
cd app
npx expo run:android
```

**Release 빌드 (APK):**
```bash
cd app
npx expo run:android --variant release
```

**Release 빌드 (AAB):**
```bash
cd app/android
./gradlew bundleRelease
# Windows: gradlew.bat bundleRelease
```

---

### 방법 3: EAS Build (클라우드 빌드)

**장점:**
- 로컬 환경 설정 불필요
- 클라우드에서 빌드
- 여러 플랫폼 동시 빌드

**설정:**
```bash
# 1. EAS CLI 설치
npm install -g eas-cli

# 2. EAS 로그인
eas login

# 3. EAS 설정
eas build:configure

# 4. Android 빌드
eas build --platform android

# 5. 빌드 타입 선택
# - Development build
# - Preview build (APK)
# - Production build (AAB)
```

---

## 📦 빌드 결과물 위치

### APK 파일
```
Debug:   app/android/app/build/outputs/apk/debug/app-debug.apk
Release: app/android/app/build/outputs/apk/release/app-release.apk
```

### AAB 파일 (Google Play Store용)
```
Release: app/android/app/build/outputs/bundle/release/app-release.aab
```

---

## 🔧 빌드 전 체크리스트

### 1. 버전 정보 업데이트

**app.json:**
```json
{
  "expo": {
    "version": "1.0.0",  // 버전명 (예: 1.0.1)
    "android": {
      "versionCode": 1  // 버전 코드 (예: 2, 3, 4...)
    }
  }
}
```

**app/android/app/build.gradle:**
```gradle
versionCode 1      // app.json의 versionCode와 동일하게
versionName "1.0.0" // app.json의 version과 동일하게
```

**버전 업데이트 시:**
- `app.json`의 `version`과 `versionCode` 업데이트
- `app/android/app/build.gradle`의 `versionCode`와 `versionName` 업데이트
- **중요**: `versionCode`는 항상 증가해야 함 (1 → 2 → 3...)

### 2. 서명 키스토어 (선택사항)

**Google Play Store에 배포하지 않는 경우:**
- ✅ 현재 설정 그대로 사용 가능 (Debug 키스토어 사용)
- ✅ 별도 설정 불필요
- ✅ 바로 빌드 진행 가능

**Google Play Store에 배포하는 경우:**
- 릴리즈 키스토어 필요
- 키스토어 생성:
```bash
cd app/android/app
keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias release -keyalg RSA -keysize 2048 -validity 10000
```

---

## 🎯 빠른 빌드 명령어 (요약)

### 가장 간단한 방법 (Release APK)

```bash
# 1. 의존성 설치 (처음이거나 package.json 변경 시)
cd app
npm install

# 2. 릴리즈 APK 빌드
cd android
./gradlew assembleRelease
# Windows: gradlew.bat assembleRelease

# 3. APK 위치 확인
# app/android/app/build/outputs/apk/release/app-release.apk
```

**Windows:**
```bash
cd app
npm install
cd android
gradlew.bat assembleRelease
```

---

## ✅ 빌드 후 확인 사항

1. **APK/AAB 파일 생성 확인**
   - 파일이 생성되었는지 확인
   - 파일 크기 확인 (일반적으로 20-50MB)

2. **앱 설치 테스트**
   - 빌드된 APK를 실제 기기에 설치
   - 모든 기능이 정상 작동하는지 확인

3. **버전 정보 확인**
   - 앱 내에서 버전 정보가 올바르게 표시되는지 확인

---

## 🔧 문제 해결

### 빌드 실패 시

**1. 클린 빌드:**
```bash
cd app/android
./gradlew clean
./gradlew assembleRelease
```

**2. 캐시 삭제:**
```bash
cd app
rm -rf node_modules
npm install
cd android
./gradlew clean
```

**3. Gradle 캐시 삭제:**
```bash
cd app/android
rm -rf .gradle
./gradlew clean
```

**4. 완전 초기화:**
```bash
cd app
rm -rf node_modules
rm -rf android/.gradle
rm -rf android/app/build
npm install
cd android
./gradlew clean
./gradlew assembleRelease
```

### 메모리 부족 오류 시

**gradle.properties 파일 수정:**
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m
```

---

## 📝 빌드 타입별 비교표

| 빌드 타입 | 명령어 | 결과물 | 용도 |
|----------|--------|--------|------|
| **Debug APK** | `./gradlew assembleDebug` | `app-debug.apk` | 개발/테스트 |
| **Release APK** | `./gradlew assembleRelease` | `app-release.apk` | 직접 배포 |
| **Release AAB** | `./gradlew bundleRelease` | `app-release.aab` | Play Store |

---

## 💡 추천 빌드 방법

**일반적인 경우 (직접 배포):**
```bash
cd app/android
./gradlew assembleRelease
```
→ `app-release.apk` 파일 사용

**Google Play Store 배포:**
```bash
cd app/android
./gradlew bundleRelease
```
→ `app-release.aab` 파일을 Play Console에 업로드

---

## ⚠️ 주의사항

1. **버전 코드는 항상 증가**: 같은 버전 코드로는 업데이트 불가
2. **키스토어 보관**: 릴리즈 키스토어는 안전하게 보관 (잃어버리면 업데이트 불가)
3. **Git 커밋 금지**: 키스토어 파일과 비밀번호는 Git에 커밋하지 않기
4. **테스트 필수**: 빌드 후 반드시 실제 기기에서 테스트
