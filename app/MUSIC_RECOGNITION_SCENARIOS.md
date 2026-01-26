# 음악 인식 시나리오 정리

## 개요
음악 인식 기능의 동작 시나리오를 정리한 문서입니다. 백그라운드 인식, UI 상태 관리 등의 동작 방식을 설명합니다.

## 주요 기능
- 즉시 인식 시작: 버튼 클릭 시 즉시 인식 시작 (카운트다운 없음)
- 백그라운드 인식: 다른 앱으로 이동해도 인식 계속 진행
- UI 상태 관리: 백그라운드에서는 UI 상태 변경 안 함 (에러 방지)
- 포그라운드 서비스: Android 14+ 제한으로 인해 포그라운드에서만 서비스 시작 가능

## 시나리오

### 시나리오 1: 앱 내에서 인식 시작

**동작 순서:**
1. 사용자가 버튼 클릭
2. `startRecognition()` 즉시 호출
3. 마이크 권한 확인 및 요청
4. `FOREGROUND_SERVICE_MICROPHONE` 권한 확인 및 요청 (Android 14+)
5. 포그라운드이므로 `setIsRecognizing(true)` 호출 (UI 업데이트)
6. `MusicRecognitionService.startService()` 호출 (포그라운드에서 시작)
7. `ACRCloudModule.startRecognizing()` 호출
8. 백그라운드에서 인식 진행

**핵심 포인트:**
- 버튼 클릭 시 즉시 인식 시작 (카운트다운 없음)
- 포그라운드에서 서비스 시작 (Android 14+ 제한 회피)
- 포그라운드에서 UI 상태 업데이트 가능
- 서비스 시작 후 백그라운드로 이동해도 인식 계속

---

### 시나리오 2: 인식 중 다른 앱으로 이동

**동작 순서:**
1. 앱 내에서 인식 진행 중
2. 사용자가 다른 앱으로 이동
3. AppState가 'active' → 'background'로 변경
4. `shouldContinueRecognitionRef.current = true` 설정
5. 이미 시작된 서비스는 계속 작동
6. 백그라운드에서 인식 계속 진행

**핵심 포인트:**
- 이미 시작된 서비스는 백그라운드에서도 계속 작동
- 백그라운드로 전환해도 인식 중지 안 됨
- 인식 결과가 나오면 알림 발송

---

### 시나리오 3: 인식 중 포그라운드로 돌아옴

#### 3-1: 알림을 클릭해서 돌아온 경우

**동작 순서:**
1. 백그라운드에서 인식 진행 중
2. 인식 결과 발생 → 알림 발송
3. 사용자가 알림 클릭
4. **알림 리스너에서 `stopRecognition()` 호출** → 인식 중지
5. 결과 표시 및 YouTube 검색
6. 음악 인식 화면으로 이동

**핵심 포인트:**
- 알림 클릭 시 무조건 인식 중지
- 결과가 이미 있으므로 인식 중지가 맞음

#### 3-2: 일반 앱 전환으로 돌아온 경우

**동작 순서:**
1. 백그라운드에서 인식 진행 중
2. 사용자가 앱 전환으로 돌아옴 (알림 클릭 아님)
3. AppState가 'background' → 'active'로 변경
4. **인식 결과 확인:**
   - **인식 결과가 있으면** → 인식 중지 (이미 결과가 나왔으니)
   - **인식 결과가 없으면** → 인식 계속 (아직 결과가 없으니)
5. 포그라운드이므로 `setIsRecognizing(true)` 호출하여 UI 업데이트

**핵심 포인트:**
- 알림 클릭이 아닌 경우: 결과 유무에 따라 결정
- 결과가 없으면 계속 인식 (사용자가 확인할 수 있도록)
- 결과가 있으면 중지 (이미 완료되었으니)

---

## 기술적 세부사항

### UI 상태 관리
- **포그라운드**: `setIsRecognizing(true)` 호출 가능 (UI 업데이트 안전)
- **백그라운드**: `setIsRecognizing(true)` 호출 안 함 (에러 방지)
- 조건: `if (appStateRef.current === 'active')` 체크

### 서비스 시작
- `MusicRecognitionService.startService()`: 포그라운드 서비스 시작
- **중요**: Android 14+ (targetSDK 36)에서는 **포그라운드에서만 서비스 시작 가능**
- 백그라운드에서 서비스 시작 시도 시 `SecurityException` 발생
- 서비스가 시작된 후에는 백그라운드에서도 계속 작동
- `ACRCloudModule.startRecognizing()`: 실제 음악 인식 시작

### 권한 요청
- `RECORD_AUDIO`: 마이크 권한 (필수)
- `FOREGROUND_SERVICE_MICROPHONE`: Android 14+ (API 34+)에서 필요
- 두 권한 모두 런타임에 요청

### 에러 방지
- **백그라운드에서 UI 상태 변경 시도 시 에러 발생 가능**
  - `appStateRef.current === 'active'` 체크로 방지
- **백그라운드에서 포그라운드 서비스 시작 시도 시 에러 발생**
  - 포그라운드에서만 서비스 시작하도록 구현
  - 버튼 클릭 시 즉시 시작 (포그라운드 상태)

---

## 코드 위치

### 주요 함수
- `startRecognition()`: 인식 시작 (권한 확인, 서비스 시작, 인식 시작)
- `stopRecognition()`: 인식 중지
- `requestMicrophonePermission()`: 마이크 권한 요청

### 주요 파일
- `app/src/screens/MusicRecognitionScreen.js`: 메인 화면 컴포넌트
- `app/src/services/notifications.js`: 알림 관련 서비스
- `app/android/app/src/main/java/com/appdison76/app/MusicRecognitionService.kt`: 포그라운드 서비스

---

## 변경 이력

### 최근 변경사항
1. **카운트다운 제거**: 버튼 클릭 시 즉시 인식 시작
2. 백그라운드에서 UI 상태 변경 방지 (에러 해결)
3. 포그라운드 복귀 시 인식 결과에 따른 동작 분기
4. `FOREGROUND_SERVICE_MICROPHONE` 권한 요청 추가
5. **포그라운드에서만 서비스 시작**: Android 14+ 제한 회피

---

## 참고사항

### Android 14+ (targetSDK 36) 제한사항
- **백그라운드에서 포그라운드 서비스 시작 불가**
  - 에러: `SecurityException: Starting FGS with type microphone ... and the app must be in the eligible state`
  - 해결: 포그라운드에서만 서비스 시작
- 서비스가 시작된 후에는 백그라운드에서도 계속 작동 가능

### 카운트다운 제거 이유
- 가비지 음성(잡음) 제거를 위해 카운트다운 추가 시도
- 하지만 백그라운드로 전환 시 서비스를 시작할 수 없어 카운트다운이 무의미
- 포그라운드에서 서비스를 시작해야 하므로 카운트다운 제거

### UI 상태 변경
- UI 상태 변경은 항상 포그라운드에서만 수행
- 백그라운드에서 UI 상태 변경 시도 시 에러 발생 가능

### 알림 처리
- 알림 클릭과 일반 앱 전환을 구분하여 처리
- 알림 클릭: 무조건 인식 중지
- 일반 전환: 인식 결과 유무에 따라 결정
