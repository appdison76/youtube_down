# 유튜브 다운로더 (Expo)

유튜브 영상을 검색하고 다운로드할 수 있는 모바일 앱입니다.

## 기능

- 🔍 유튜브 영상 검색 (제목, 링크, 내용)
- 📥 다운로드 (음악, 영상, 자막)
- ⭐ 찜하기 기능
- 📁 찜하기 폴더 관리 (재생목록처럼)

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. YouTube Data API 키 설정 (필수)

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성
2. YouTube Data API v3 활성화
3. API 키 생성
4. `.env` 파일 생성:

```env
EXPO_PUBLIC_YOUTUBE_API_KEY=your_api_key_here
```

또는 `app.json`에 직접 설정:

```json
{
  "expo": {
    "extra": {
      "youtubeApiKey": "your_api_key_here"
    }
  }
}
```

### 3. 앱 실행

```bash
# 개발 서버 시작
npm start

# Android 실행
npm run android

# iOS 실행 (macOS 필요)
npm run ios

# 웹 실행
npm run web
```

### 4. Expo Go 앱으로 테스트

1. Expo Go 앱 설치 (Android/iOS)
2. `npm start` 실행 후 QR 코드 스캔

## 프로젝트 구조

```
app/
├── src/
│   ├── screens/          # 화면 컴포넌트
│   │   ├── SearchScreen.js
│   │   └── FavoritesScreen.js
│   ├── components/      # 재사용 컴포넌트
│   ├── services/        # 비즈니스 로직
│   │   ├── database.js  # SQLite 데이터베이스
│   │   ├── youtube.js   # YouTube 검색
│   │   └── download.js  # 다운로드 기능
│   ├── navigation/     # 네비게이션
│   └── utils/          # 유틸리티 함수
├── App.js
└── app.json
```

## 주요 기능 설명

### 검색 기능
- 유튜브 영상 제목으로 검색
- YouTube 링크로 직접 검색
- 검색 결과에서 찜하기 및 다운로드

### 찜하기 기능
- 검색한 영상을 찜하기에 저장
- 폴더별로 영상 관리
- 기본 찜하기 폴더 자동 생성

### 다운로드 기능
- 영상 다운로드 (MP4)
- 음악 다운로드 (MP3)
- 자막 다운로드

**참고**: 다운로드 기능은 백엔드 서버가 필요하거나, React Native용 다운로드 라이브러리를 사용해야 합니다.

## 필요한 패키지

- `expo-sqlite`: 로컬 데이터베이스
- `@react-navigation/native`: 네비게이션
- `expo-file-system`: 파일 시스템 접근
- `axios`: HTTP 요청

## 주의사항

1. **YouTube Data API 키 필수**: 검색 기능을 사용하려면 YouTube Data API v3 키가 필요합니다.

2. **다운로드 기능**: 현재는 기본 구조만 구현되어 있습니다. 실제 다운로드를 위해서는:
   - 백엔드 서버를 통해 yt-dlp 사용
   - 또는 React Native용 다운로드 라이브러리 사용

3. **앱스토어 배포**: 실제 배포 시 YouTube API 사용 정책을 확인하세요.

## 라이선스

MIT






