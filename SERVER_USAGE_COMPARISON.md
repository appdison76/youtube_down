# 앱 vs 웹앱 서버 이용 비교

우리 백엔드 서버(멜로디스냅 / Railway)를 **어디서·언제** 쓰는지 정리한 표입니다.

---

## 비교표

| 기능 | 앱 (모바일) | 웹앱 |
|------|-------------|------|
| **검색** | ✅ 우리 서버 (`/api/search`) | ✅ 우리 서버 (`/api/search`) |
| **검색 자동완성** | ✅ 우리 서버 (`/api/autocomplete`) | ✅ 우리 서버 (`/api/autocomplete`) |
| **다운로드** (영상/음악) | ✅ 우리 서버 (`/api/video-info`, `/api/download`) | ✅ 우리 서버 (`/api/video-info`, `/api/download`) |
| **음악 인식** | ❌ **서버 안 탐** (ACRCloud 네이티브 SDK) | ✅ 우리 서버 (`/api/recognize`) |
| **URL로 가져오기** (영상 정보만) | ❌ **서버 안 탐** (YouTube oEmbed 직접) | ✅ 우리 서버 (`/api/video-info`) |

---

## 요약

- **앱**: 우리 서버는 **검색 + 다운로드** 때만 사용. 음악인식은 ACRCloud, URL 영상 정보는 oEmbed.
- **웹앱**: **검색, 자동완성, 다운로드, 음악인식, URL 영상 정보** 모두 우리 서버 경유.

---

## 참고

- 앱 음악인식 후 “YouTube 검색”은 우리 서버 `/api/search` 사용.
- 앱/웹앱 모두 다운로드 시 **이중화**(primary → Railway) 적용.
- 버전/설정 파일 위치는 `app/VERSION_GUIDE.md`, `install-page/version.json` 참고.
