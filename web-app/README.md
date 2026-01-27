# 멜로디 스냅 웹페이지

웹 브라우저에서 사용할 수 있는 PWA 버전입니다.

## 기능

- 🎵 음악 찾기 (샤잠 기능) - 서버 API 호출
- 🔍 YouTube 검색
- 💾 YouTube URL 저장 및 다운로드
- 📚 내 저장소 (찜하기 + 다운로드 목록) - IndexedDB

## 설정

### API 서버 URL 설정

`js/api.js` 파일에서 API 서버 URL을 설정하세요:

```javascript
const API_BASE_URL = 'https://your-railway-server.railway.app';
```

## 배포

### GitHub Pages

1. `web-app` 폴더를 GitHub 저장소에 푸시
2. Settings → Pages에서 활성화
3. Source를 `main` 브랜치, `/web-app` 폴더 선택

### Netlify

1. `web-app` 폴더를 Netlify에 드래그 앤 드롭
2. 자동으로 URL 생성

## 구조

```
web-app/
├─ index.html          # 메인 페이지
├─ manifest.json       # PWA 매니페스트
├─ css/
│   └─ styles.css     # 스타일
└─ js/
    ├─ app.js          # 메인 로직
    ├─ api.js          # API 호출
    ├─ indexeddb.js    # IndexedDB 관리
    ├─ recognition.js  # 음악 인식
    ├─ search.js       # YouTube 검색
    ├─ save.js         # URL 저장
    └─ library.js      # 내 저장소
```
