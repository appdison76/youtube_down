# GitHub Releases 빠른 가이드 ⚡

## 🎯 현재 상황
- ✅ 저장소: `https://github.com/appdison76/youtube_down`
- ✅ APK 파일: `install-page/app.apk` (113MB)
- ✅ 버전: v1.0.1

---

## 📝 5분 안에 완료하기

### 1️⃣ GitHub Releases 페이지 접속
브라우저에서 접속:
```
https://github.com/appdison76/youtube_down/releases
```

### 2️⃣ "Create a new release" 클릭
오른쪽 상단 또는 중앙의 버튼 클릭

### 3️⃣ 정보 입력

**태그:**
```
v1.0.1
```
(처음이면 "Create new tag: v1.0.1 on publish" 선택)

**제목:**
```
YouTube Downloader v1.0.1
```

**설명 (선택사항):**
```
YouTube 다운로더 앱 v1.0.1

주요 기능:
- 유튜브 영상 검색 및 다운로드
- 음악 다운로드
- 찜하기 기능
- 다운로드 파일 관리
```

### 4️⃣ APK 파일 업로드

**"Attach binaries by dropping them here or selecting them"** 영역에:
- `install-page/app.apk` 파일을 **드래그 앤 드롭**
- 또는 **"selecting them"** 클릭 후 파일 선택

⏱️ 업로드 시간: 1-2분 (113MB)

### 5️⃣ "Publish release" 클릭

### 6️⃣ 다운로드 URL 복사

Release 페이지에서:
- `app.apk` 파일명에 마우스 오버
- 우클릭 → **"링크 주소 복사"**

**URL 형식:**
```
https://github.com/appdison76/youtube_down/releases/download/v1.0.1/app.apk
```

---

## 🔧 index.html 자동 수정

Release를 생성한 후 알려주시면 `index.html`을 자동으로 수정해드리겠습니다!

또는 직접 수정:
```html
<a href="https://github.com/appdison76/youtube_down/releases/download/v1.0.1/app.apk" 
   class="download-btn" 
   id="downloadBtn" 
   download="youtube-downloader.apk" 
   type="application/vnd.android.package-archive">
    📥 앱 다운로드 (APK)
</a>
```

---

## ✅ 완료!

이제 Google Drive 경고 페이지 없이 바로 다운로드됩니다! 🎉










