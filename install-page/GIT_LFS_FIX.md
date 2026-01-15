# Git LFS APK 문제 해결 가이드

## 문제 원인

Git LFS를 사용하여 APK 파일을 저장하면:
- 로컬에서는 실제 APK 파일이 보이지만
- 웹 서버(GitHub Pages, Netlify 등)에서는 Git LFS 포인터 파일만 제공됨
- 이로 인해 APK 설치 시 "패키지를 파싱하는 중 문제가 발생했습니다" 오류 발생

## 해결 방법: GitHub Releases 사용 (권장)

### 방법 1: GitHub Releases 사용 (가장 안정적)

1. **GitHub Releases에 APK 업로드**
   - GitHub 저장소 → **Releases** → **Draft a new release** 클릭
   - 태그 버전 입력 (예: `v1.0.1`)
   - Release title: `v1.0.1`
   - `app-release.apk` 파일을 드래그 앤 드롭하여 업로드
   - **Publish release** 클릭

2. **index.html 수정**
   ```html
   <a href="https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.1/app-release.apk" 
      class="download-btn" 
      id="downloadBtn" 
      download="youtube-downloader.apk">
       📥 앱 다운로드 (APK)
   </a>
   ```
   
   `YOUR_USERNAME`, `YOUR_REPO`, `v1.0.1`을 실제 값으로 변경

3. **장점**
   - Git LFS 불필요
   - 대용량 파일 지원 (최대 2GB)
   - 무료
   - 안정적
   - CDN 지원으로 빠른 다운로드

---

### 방법 2: Google Drive 사용

1. **Google Drive에 APK 업로드**
   - Google Drive에 `app-release.apk` 업로드
   - 파일 우클릭 → **공유** → **링크가 있는 모든 사용자** 선택
   - 파일 ID 복사 (URL에서 `id=FILE_ID` 부분)

2. **index.html 수정**
   ```html
   <a href="https://drive.google.com/uc?export=download&id=FILE_ID" 
      class="download-btn" 
      id="downloadBtn" 
      download="youtube-downloader.apk">
       📥 앱 다운로드 (APK)
   </a>
   ```
   
   `FILE_ID`를 실제 파일 ID로 변경

---

### 방법 3: Dropbox 사용

1. **Dropbox에 APK 업로드**
   - Dropbox에 `app-release.apk` 업로드
   - 파일 우클릭 → **공유** → **링크 복사**
   - URL에서 `?dl=0`을 `?dl=1`로 변경

2. **index.html 수정**
   ```html
   <a href="https://www.dropbox.com/s/YOUR_LINK/app-release.apk?dl=1" 
      class="download-btn" 
      id="downloadBtn" 
      download="youtube-downloader.apk">
       📥 앱 다운로드 (APK)
   </a>
   ```

---

### 방법 4: Git LFS에서 APK 제거 (고급)

만약 Git LFS를 계속 사용하고 싶다면:

1. **.gitattributes 수정**
   ```gitattributes
   # APK는 Git LFS에서 제외
   # install-page/*.apk filter=lfs diff=lfs merge=lfs -text
   ```

2. **Git LFS 캐시에서 제거**
   ```bash
   git lfs untrack "install-page/*.apk"
   git rm --cached install-page/app.apk
   git add install-page/app.apk
   git commit -m "Remove APK from Git LFS"
   ```

3. **APK는 GitHub Releases나 다른 호스팅 사용**

---

## 추천 순위

1. **GitHub Releases** ⭐ (가장 추천)
   - 무료, 안정적, 빠름
   
2. **Google Drive**
   - 간단하지만 다운로드 제한 있음
   
3. **Dropbox**
   - 간단하지만 대역폭 제한 있음
   
4. **Git LFS 제거**
   - 복잡하지만 원하는 경우 사용 가능

---

## 빠른 해결 (GitHub Releases 사용)

1. GitHub 저장소 → **Releases** → **Create a new release**
2. APK 파일 업로드
3. `index.html`에서 링크 변경
4. 완료!










