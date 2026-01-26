# 음악 인식 화면 메시지 정리

## 개요
음악 인식 화면에서 사용자에게 표시되는 모든 메시지를 정리한 문서입니다.

---

## 1. 화면 UI 메시지 (항상 표시)

### 1.1 헤더
- **앱 제목**: `t.appTitle` (예: "Melody Snap")

### 1.2 인식 버튼 영역

#### 인식 전 상태
- **버튼 텍스트**: `t.musicRecognitionTapToStart`
  - 한국어: "버튼을 눌러 음악을 인식하세요"
- **안내 문구**: `t.musicRecognitionInstructions`
  - 한국어: "💡 사용법: 버튼을 누르면 자동으로 음악을 인식합니다.\n음악이 재생 중일 때 버튼을 눌러주세요."
- **권한 확인 버튼**: `t.musicRecognitionCheckPermission`
  - 한국어: "🔍 마이크 권한 확인"

#### 인식 중 상태
- **버튼 텍스트**: `t.musicRecognitionListening`
  - 한국어: "음악을 듣고 있습니다..."
- **안내 문구 1**: `t.musicRecognitionListeningHint`
  - 한국어: "주변 음악이나 기기에서 나는 소리를 들려주세요"
- **안내 문구 2**: `t.musicRecognitionHowToUse`
  - 한국어: "💡 버튼을 누르면 자동으로 인식합니다. 중지 버튼을 누를 필요 없습니다."
- **안내 문구 3**: `t.musicRecognitionVolumeCheck`
  - 한국어: "🔊 마이크가 소리를 받고 있는지 확인하세요. 볼륨을 크게 올려주세요."

### 1.3 인식 결과 영역

#### 결과 제목
- **제목**: `t.musicRecognitionRecognizedSong`
  - 한국어: "🎵 인식된 곡"

#### 결과 정보
- **제목 없음**: `t.musicRecognitionNoTitle`
  - 한국어: "제목 없음"
- **아티스트 없음**: `t.musicRecognitionNoArtist`
  - 한국어: "아티스트 없음"

### 1.4 YouTube 검색 결과 영역

#### 로딩 중
- **로딩 메시지**: `t.musicRecognitionSearchingYouTube`
  - 한국어: "YouTube 검색 중..."

#### 결과 제목
- **제목**: `t.musicRecognitionSelectVideo`
  - 한국어: "📥 다운로드할 영상 선택"

#### 결과 없음
- **메시지**: `t.musicRecognitionNoYouTubeResults`
  - 한국어: "YouTube 검색 결과가 없습니다."

#### 버튼 텍스트
- **찜하기**: `t.addToFavorites` (기본값: "찜하기")
- **재생**: `t.play`
- **다운로드**: `t.saveButton` (기본값: "다운로드")

---

## 2. Alert 팝업 메시지

### 2.1 권한 관련

#### 권한 요청 다이얼로그
- **제목**: `t.musicRecognitionPermissionTitle`
  - 한국어: "마이크 권한 필요"
- **메시지**: `t.musicRecognitionPermissionMessage`
  - 한국어: "음악 인식을 위해 마이크 권한이 필요합니다.\n\n"허용"을 선택해주세요."
- **버튼**:
  - `t.later` (나중에)
  - `t.cancel` (취소)
  - `t.allow` (허용)

#### 권한 거부 (NEVER_ASK_AGAIN)
- **제목**: `t.musicRecognitionPermissionTitle`
  - 한국어: "마이크 권한 필요"
- **메시지**: `t.musicRecognitionPermissionDeniedSettings`
  - 한국어: "마이크 권한이 거부되었습니다.\n\n설정에서 마이크 권한을 허용해주세요."
- **버튼**:
  - `t.cancel` (취소)
  - `t.openSettings` (설정 열기)

#### 권한 확인 결과 (수동 확인)
- **권한 있음**: 
  - 제목: `t.notice` (알림)
  - 메시지: `t.musicRecognitionPermissionGranted`
    - 한국어: "마이크 권한이 허용되어 있습니다."
- **권한 없음**:
  - 제목: `t.notice` (알림)
  - 메시지: `t.musicRecognitionPermissionRequired`
    - 한국어: "마이크 권한이 필요합니다.\n\n설정에서 마이크 권한을 허용해주세요."
  - 버튼:
    - `t.cancel` (취소)
    - `t.openSettings` (설정 열기)

#### 권한 거부 (인식 시작 시도 시)
- **제목**: `t.notice` (알림)
- **메시지**: `t.musicRecognitionPermissionDenied + '\n\n' + t.musicRecognitionPermissionSettingsPath`
  - 한국어: "마이크 권한이 필요합니다. 설정에서 권한을 허용해주세요.\n\n설정 > 앱 > 권한에서 마이크 권한을 허용해주세요."
- **버튼**:
  - `t.cancel` (취소)
  - `t.openSettings` (설정 열기)

### 2.2 인식 시작/중지 에러

#### 인식 시작 실패
- **제목**: `t.notice` (알림)
- **메시지**: `t.musicRecognitionStartError`
  - 한국어: "음악 인식을 시작할 수 없습니다."

#### 인식 중지 실패
- **제목**: `t.notice` (알림)
- **메시지**: `t.musicRecognitionStopError`
  - 한국어: "음악 인식을 중지할 수 없습니다."

### 2.3 인식 실패

#### 타임아웃 (25초 후 결과 없음)
- **제목**: `t.notice` (알림)
- **메시지**: `t.musicRecognitionFailed`
  - 한국어: "음악을 인식하지 못했습니다.\n\n- 음악이 재생 중인지 확인하세요\n- 마이크가 음악 소리를 들을 수 있는지 확인하세요\n- 주변이 너무 시끄럽지 않은지 확인하세요"
- **버튼**: `t.ok` (확인)

#### ACRCloud DB에 없음 (code 1001)
- **제목**: `t.notice` (알림)
- **메시지**: `t.musicRecognitionNoResult`
  - 한국어: "음악을 찾을 수 없습니다.\n\n- 음악의 다른 구간을 시도해보세요\n- 다른 곡으로 다시 시도해보세요"

#### 기타 인식 에러
- **제목**: `t.notice` (알림)
- **메시지**: `t.musicRecognitionFailed`
  - 한국어: "음악을 인식하지 못했습니다.\n\n- 음악이 재생 중인지 확인하세요\n- 마이크가 음악 소리를 들을 수 있는지 확인하세요\n- 주변이 너무 시끄럽지 않은지 확인하세요"

### 2.4 ACRCloud 초기화 에러

#### 초기화 실패
- **제목**: `t.error` (오류)
- **메시지**: "ACRCloud 초기화에 실패했습니다. 앱을 재시작해주세요."

#### 초기화 에러 (예외)
- **제목**: `t.error` (오류)
- **메시지**: `ACRCloud 초기화 실패: ${error.message}`

### 2.5 YouTube 검색 에러

#### 검색 실패
- **제목**: `t.error` (오류)
- **메시지**: `t.youtubeSearchError` 또는 `t.musicRecognitionSearchingYouTube`
  - 한국어: "YouTube 검색 중 오류가 발생했습니다." 또는 "YouTube 검색 중..."

### 2.6 기타 에러

#### 영상 열기 실패
- **제목**: `t.error` (오류)
- **메시지**: `t.cannotOpenVideo`
  - 한국어: "영상을 열 수 없습니다."

#### 즐겨찾기 저장 실패
- **제목**: `t.error` (오류)
- **메시지**: `t.favoriteSaveError`
  - 한국어: "즐겨찾기 저장 중 오류가 발생했습니다."

---

## 3. 알림 메시지 (백그라운드)

### 3.1 인식 결과 알림
- **제목**: 인식된 곡 제목
- **내용**: 아티스트 이름
- **데이터**: 
  - `type: 'recognition'`
  - `title`: 곡 제목
  - `artist`: 아티스트
  - `album`: 앨범

---

## 4. 메시지 분류

### 4.1 정보성 메시지 (Info)
- 인식 버튼 텍스트
- 안내 문구
- 로딩 메시지
- 인식 결과 제목

### 4.2 성공 메시지 (Success)
- 인식 결과 표시
- 권한 허용 확인

### 4.3 경고 메시지 (Warning)
- 권한 필요 안내
- 인식 실패 안내

### 4.4 에러 메시지 (Error)
- 인식 시작/중지 실패
- ACRCloud 초기화 실패
- YouTube 검색 실패
- 기타 시스템 에러

---

## 5. 메시지 표시 조건

### 5.1 포그라운드에서만 표시
- Alert 팝업 (대부분)
- UI 텍스트

### 5.2 백그라운드에서도 표시
- 알림 (Notification)
- 포그라운드 서비스 알림 ("음악 인식 중...")

### 5.3 조건부 표시
- 인식 전/중 상태에 따라 다른 메시지
- 인식 결과 유무에 따라 다른 메시지
- 권한 상태에 따라 다른 메시지

---

## 6. 번역 지원

모든 메시지는 다음 언어를 지원합니다:
- 한국어 (ko)
- 영어 (en)
- 일본어 (ja)
- 중국어 (zh)

번역 키는 `app/src/locales/translations.js`에 정의되어 있습니다.

---

## 7. 메시지 개선 사항

### 최근 개선
1. ✅ 에러 메시지를 사용자 친화적으로 변경 (`t.error` → `t.notice`)
2. ✅ ACRCloud DB에 없는 경우 전용 메시지 추가 (`musicRecognitionNoResult`)
3. ✅ 메시지에 불필요한 기술 용어 제거
4. ✅ 안내 문구 간결화

### 향후 개선 가능 사항
- 메시지 톤앤매너 통일
- 에러 코드별 상세 안내 추가
- 접근성 개선 (스크린 리더 지원)
