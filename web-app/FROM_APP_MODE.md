# from_app / 재생만 모드

## 개요
앱에서 웹을 열 때(`?from_app=1`) 다운로드 버튼 대신 재생 버튼만 보이게 하는 기능의 on/off 스위치.

## 파일
- **`js/app.js`** 맨 위 `FROM_APP_PLAY_ONLY_MODE` 상수

## 설정
- **기본값:** `true` → `?from_app=1` 이면 재생 버튼만 표시 (다운로드 숨김)
- **끌 때:** `false`로 바꾼 뒤 웹만 재배포

## 영향 범위
- `save.js`, `search.js`, `recognition.js`, `library.js`는 `window.__FROM_APP__` 전역 변수만 읽으므로 **수정 불필요**
- `app.js`의 `initApp()` 제목 변경 로직도 자동으로 동작

## 사용법
1. `js/app.js` 열기
2. `FROM_APP_PLAY_ONLY_MODE = true` → `false`로 변경 (또는 반대)
3. 웹 배포
4. `index.html`의 `CACHE_V`도 함께 올리면 캐시 무효화됨
