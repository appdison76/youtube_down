# 배포 가이드

## 방법 1: GitHub Pages (가장 간단)

### 단계:
1. GitHub에 새 저장소 생성 (예: `youtube-downloader-install`)
2. `install-page` 폴더의 모든 파일을 저장소에 업로드
3. 저장소 Settings → Pages
4. Source를 `main` 브랜치, `/ (root)` 선택
5. 저장 후 몇 분 기다리면 `https://YOUR_USERNAME.github.io/youtube-downloader-install/` 접속 가능

### 또는 현재 프로젝트에 포함:
- `install-page` 폴더를 현재 저장소에 포함
- Settings → Pages에서 `/install-page` 폴더 선택
- `https://YOUR_USERNAME.github.io/youtube_down/install-page/` 접속 가능

---

## 방법 2: Netlify (드래그 앤 드롭)

1. [Netlify](https://www.netlify.com/) 가입
2. `install-page` 폴더를 드래그 앤 드롭
3. 자동으로 URL 생성 (예: `https://random-name-123.netlify.app`)
4. 커스텀 도메인 설정 가능

---

## 방법 3: Vercel

```bash
# Vercel CLI 설치
npm i -g vercel

# install-page 폴더에서 실행
cd install-page
vercel

# 배포 완료 후 URL 제공
```

---

## 방법 4: Notion (제한적)

Notion은 정적 HTML 호스팅을 직접 지원하지 않지만:
- Notion 페이지에 HTML 임베드 가능 (제한적)
- 또는 Notion을 프레임으로 사용하고 실제 호스팅은 다른 곳에서

**추천: GitHub Pages가 가장 간단하고 무료입니다!**


















