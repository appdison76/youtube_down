# 커스텀 도메인으로 Git URL 숨기기

사람들이 `appdison76.github.io/youtube_down/...` 대신 **melodysnap** 도메인으로 접속하게 하는 방법 정리.

---

## 1. 왜 쓰는지

- **Git URL 안 보임** — `github.io` 대신 본인 도메인만 보임
- **URL 짧고 깔끔** — 공유·북마크에 유리
- **브랜딩** — Melody Snap 서비스처럼 보임

---

## 2. 선택지

### A. 새 도메인 사기 (예: melodysnap.com)

- **장점**: 서비스 전용 주소, 기억하기 쉬움
- **단점**: 비용 (연 ~1만 원대), 구매·DNS 설정 필요
- **흐름**: 도메인 구매 → DNS에서 GitHub Pages / API 서버로 연결

### B. 기존 도메인 쓰기 (melodysnap.mediacommercelab.com)

- **장점**: 이미 있음, 비용 추가 없음
- **단점**: 주소가 조금 김 (서브도메인 쓰면 정리됨)
- **흐름**: 서브도메인 하나 더 쓰기 (예: `app.melodysnap.mediacommercelab.com` = 웹앱)

**추천**: 비용 없이 쓰려면 **B. 기존 도메인 + 서브도메인**이 좋음.

---

## 3. 기존 도메인으로 할 때 구조 예시

지금 API는 이미 `melodysnap.mediacommercelab.com` 쓰고 있음 (config.json).

| 용도     | 주소 예시                          | 연결 대상        |
|----------|------------------------------------|------------------|
| **API**  | `melodysnap.mediacommercelab.com`  | 지금처럼 유지 (Railway 또는 현재 서버) |
| **웹앱** | `app.melodysnap.mediacommercelab.com` | GitHub Pages     |

- 사용자 접속: `https://app.melodysnap.mediacommercelab.com` → 웹앱
- config/설치 페이지도 이 주소 기준으로 두면 됨 (아래 5번)

---

## 4. GitHub Pages에 커스텀 도메인 연결

1. **GitHub** → 해당 저장소 → **Settings** → **Pages**
2. **Custom domain**에 입력: `app.melodysnap.mediacommercelab.com` (또는 쓸 주소)
3. **Save** 후 GitHub가 안내하는 대로 **DNS 설정**

**DNS (도메인 관리하는 곳에서):**

- **CNAME** 하나 추가  
  - 이름: `app` (또는 서브도메인에 맞게)  
  - 값: `appdison76.github.io`
- 또는 GitHub 안내에 “A 레코드”로 하라고 나오면 그대로 따라하기

4. **Enforce HTTPS** 켜기 (Settings → Pages에서)

**주의**: GitHub Pages가 **어느 경로**를 루트로 주는지에 따라,  
실제 웹앱이 `username.github.io/youtube_down/web-app/` 이라면  
커스텀 도메인 접속 시에도 `/youtube_down/web-app/` 이 붙을 수 있음.  
그럴 경우:

- **옵션 1**: Pages 소스에서 **폴더를 `/ (root)** 로 배포되게 설정 (가능하면)
- **옵션 2**: 그대로 두고 접속 주소를 `https://app.melodysnap.mediacommercelab.com/youtube_down/web-app/` 로 공유

---

## 5. 코드에서 바꿀 곳 (도메인 쓰기로 정했을 때)

웹앱/설치 페이지를 **도메인 주소**로 쓰기로 했다면:

1. **config 로드 주소**  
   - `web-app/js/api.js`  
   - `CONFIG_URL`을 GitHub URL 대신 **그 도메인**으로 변경  
   - 예: `https://app.melodysnap.mediacommercelab.com/.../install-page/config.json`  
     (실제 Pages 경로에 맞게 수정)

2. **설치 페이지 링크**  
   - `web-app/js/app.js` 등에서  
   - `https://appdison76.github.io/youtube_down/web-app/install-page/`  
   - → `https://app.melodysnap.mediacommercelab.com/.../install-page/` (같은 도메인으로)

3. **config.json**  
   - `apiBaseUrl` / `apiBaseUrls` 는 이미 `melodysnap.mediacommercelab.com` 쓰면 됨 (API용).

---

## 6. 새 도메인 (melodysnap.com) 살 때

1. 도메인 구매 (가비아, Cloudflare, Namecheap 등)
2. **웹앱**: `app.melodysnap.com` 또는 `melodysnap.com` → GitHub Pages (CNAME/A 레코드)
3. **API**: `api.melodysnap.com` 등 → Railway 또는 현재 API 서버 (CNAME 또는 A)
4. 위 5번처럼 `CONFIG_URL`, 설치 페이지 링크, config.json을 새 도메인에 맞게 수정

---

## 요약

- **Git URL 안 보이게** = 웹앱 접속 주소를 **커스텀 도메인**으로 바꾸면 됨.
- **비용 없이** = 기존 **melodysnap.mediacommercelab.com** 에 서브도메인 `app` 추가해서 웹앱만 그쪽으로 연결.
- **서비스만 따로** = **melodysnap.com** 등 새 도메인 구매 후, 웹앱/API 각각 서브도메인으로 연결.

원하면 “기존 도메인만 쓸 때” 기준으로 `api.js` / `app.js` 수정 예시(패치 형태)도 적어줄 수 있음.
