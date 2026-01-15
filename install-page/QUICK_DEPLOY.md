# 빠른 배포 가이드

## 🚀 GitHub Pages로 배포하기 (5분 안에!)

### 방법 1: 새 저장소 만들기 (추천)

1. **GitHub에 새 저장소 생성**
   - https://github.com/new 접속
   - 저장소 이름: `youtube-downloader-install` (원하는 이름)
   - Public 선택
   - Create repository 클릭

2. **파일 업로드**
   ```bash
   # 현재 프로젝트 폴더에서
   cd install-page
   
   # Git 초기화
   git init
   git add .
   git commit -m "Initial commit"
   
   # GitHub 저장소 연결 (YOUR_USERNAME을 실제 사용자명으로 변경)
   git remote add origin https://github.com/YOUR_USERNAME/youtube-downloader-install.git
   git branch -M main
   git push -u origin main
   ```

3. **GitHub Pages 활성화**
   - GitHub 저장소 페이지에서 **Settings** 클릭
   - 왼쪽 메뉴에서 **Pages** 클릭
   - Source에서 **Deploy from a branch** 선택
   - Branch: `main`, Folder: `/ (root)` 선택
   - **Save** 클릭

4. **완료!**
   - 몇 분 후 `https://YOUR_USERNAME.github.io/youtube-downloader-install/` 접속 가능
   - 이 URL을 카카오톡으로 공유하면 됩니다!

---

### 방법 2: Netlify (더 간단, 드래그 앤 드롭)

1. **Netlify 가입**
   - https://www.netlify.com/ 접속
   - GitHub 계정으로 로그인 (또는 이메일 가입)

2. **배포**
   - 대시보드에서 **Sites** → **Add new site** → **Deploy manually**
   - `install-page` 폴더를 드래그 앤 드롭
   - 자동으로 URL 생성 (예: `https://amazing-app-123.netlify.app`)

3. **완료!**
   - 즉시 접속 가능
   - 커스텀 도메인도 무료로 설정 가능

---

### 방법 3: Vercel (개발자 친화적)

```bash
# Vercel CLI 설치
npm i -g vercel

# install-page 폴더에서
cd install-page
vercel

# 질문에 답변:
# - Set up and deploy? Yes
# - Which scope? 본인 계정 선택
# - Link to existing project? No
# - Project name? youtube-downloader-install
# - Directory? ./
# - Override settings? No

# 완료 후 URL 제공됨
```

---

## 📝 Notion은?

Notion은 정적 HTML 호스팅을 직접 지원하지 않습니다.
- HTML을 Notion에 직접 넣을 수 없음
- 대신 GitHub Pages나 Netlify 사용 권장

---

## ✅ 추천 순위

1. **Netlify** - 가장 간단 (드래그 앤 드롭)
2. **GitHub Pages** - 무료, 안정적
3. **Vercel** - 개발자 친화적

**가장 빠른 방법: Netlify 드래그 앤 드롭!**


















