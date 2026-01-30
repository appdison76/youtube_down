# 앱 설치 페이지

Melody Snap 앱의 설치 페이지입니다.

## 설정 방법

### 1. APK 다운로드 링크 설정

`index.html` 파일에서 다음 부분을 수정하세요:

```html
<a href="YOUR_APK_DOWNLOAD_URL" class="download-btn" id="downloadBtn">
```

`YOUR_APK_DOWNLOAD_URL`을 실제 APK 파일이 있는 URL로 변경하세요.

예시:
- Google Drive: `https://drive.google.com/uc?export=download&id=YOUR_FILE_ID`
- Dropbox: `https://www.dropbox.com/s/YOUR_LINK/app.apk?dl=1`
- 자체 서버: `https://yourdomain.com/downloads/app.apk`

### 2. Google AdSense 설정

1. [Google AdSense](https://www.google.com/adsense/)에 가입
2. 광고 단위 생성
3. `index.html`에서 다음 부분 수정:

```html
<!-- AdSense 스크립트 -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_ADSENSE_ID"
     crossorigin="anonymous"></script>

<!-- 광고 단위 -->
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-YOUR_ADSENSE_ID"
     data-ad-slot="YOUR_AD_SLOT_ID"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
```

`YOUR_ADSENSE_ID`와 `YOUR_AD_SLOT_ID`를 실제 값으로 변경하세요.

### 3. 배포

#### 옵션 1: GitHub Pages
```bash
# install-page 폴더를 GitHub 저장소에 푸시
# Settings → Pages에서 활성화
```

#### 옵션 2: Netlify
```bash
# install-page 폴더를 Netlify에 드래그 앤 드롭
# 또는 GitHub과 연동
```

#### 옵션 3: Vercel
```bash
vercel --prod
```

#### 옵션 4: 자체 서버
```bash
# install-page 폴더를 웹 서버에 업로드
```

## 커스터마이징

- 아이콘: `app-icon` 클래스의 이모지를 이미지로 변경 가능
- 색상: CSS의 `#667eea`, `#764ba2` 색상 코드 변경
- 기능 설명: `features` 섹션 수정

## 보안

- APK 파일은 HTTPS로 제공하는 것을 권장합니다
- APK 서명을 확인하도록 안내하세요
- 악성 소프트웨어 경고를 표시하세요


















