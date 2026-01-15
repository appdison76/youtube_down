# 영상 다운로더

영상을 검색하고 다운로드할 수 있는 React Native (Expo) 모바일 앱입니다.

## 기능

- 🔍 영상 검색 (제목, 링크, 내용)
- 📥 다운로드 (음악 MP3, 영상 MP4, 자막)
- ⭐ 찜하기 기능
- 📁 찜하기 폴더 관리 (재생목록처럼)
- 📊 실시간 다운로드 진행률 표시
- 🎵 서버 없이 앱에서 직접 다운로드 및 MP3 변환

## 프로젝트 구조

```
youtube_down/
├── app/                    # React Native Expo 앱
│   ├── src/
│   │   ├── screens/        # 화면 컴포넌트
│   │   ├── services/       # 비즈니스 로직
│   │   └── navigation/    # 네비게이션
│   └── package.json
└── install-page/           # 앱 설치 페이지 (Netlify 배포)
    └── index.html
```

## 설치 및 실행

### 앱 개발

```bash
cd app
npm install
npx expo start
```

### APK 빌드 (MP3 변환 기능 포함)

```bash
cd app
npx eas build --platform android
```

**참고**: MP3 변환 기능은 네이티브 모듈(`react-native-ffmpeg`)이 필요하므로 EAS Build로 네이티브 빌드를 생성해야 합니다.

## 사용법

1. 앱 실행 후 검색창에 영상 제목, 링크, 또는 내용을 입력
2. 검색 결과에서 원하는 영상 선택
3. 다운로드 형식 선택 (음악 MP3/영상 MP4/자막)
4. 다운로드 진행률 확인
5. 찜하기 버튼으로 나중에 볼 영상 저장
6. 찜하기 폴더를 만들어서 영상 관리

## 기술 스택

- **React Native** (Expo)
- **Expo SQLite** (로컬 데이터베이스)
- **react-native-ytdl-ts** (YouTube 다운로드)
- **react-native-ffmpeg** (MP3 변환)
- **Netlify** (설치 페이지 호스팅)






