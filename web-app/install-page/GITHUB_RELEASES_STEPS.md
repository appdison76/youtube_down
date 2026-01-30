# GitHub Releases 사용 가이드 (단계별)

## 📋 저장소 정보
- 저장소: `https://github.com/appdison76/youtube_down`
- 버전: v1.0.1

---

## 🚀 단계별 가이드

### 1단계: APK 파일 준비

APK 파일이 없으면 먼저 릴리즈 빌드를 해야 합니다:

```bash
# 방법 1: Gradle 사용 (권장)
cd app/android
./gradlew assembleRelease
# Windows: gradlew.bat assembleRelease

# 방법 2: Expo 사용
cd app
npx expo run:android --variant release
```

빌드된 APK 위치:
- `app/android/app/build/outputs/apk/release/app-release.apk`

또는 기존 APK 파일 사용:
- `install-page/app.apk` (이미 있다면)

---

### 2단계: GitHub Releases 생성 (웹 브라우저)

#### 2-1. GitHub 저장소 접속
1. 브라우저에서 접속: https://github.com/appdison76/youtube_down
2. 로그인 확인

#### 2-2. Releases 페이지로 이동
1. 저장소 페이지에서 오른쪽 사이드바의 **"Releases"** 클릭
   - 또는 직접 접속: https://github.com/appdison76/youtube_down/releases

#### 2-3. 새 Release 생성
1. **"Create a new release"** 또는 **"Draft a new release"** 버튼 클릭

#### 2-4. 태그 및 제목 입력
```
Choose a tag: v1.0.1
- "Create new tag: v1.0.1 on publish" 선택 또는 입력

Release title: YouTube Downloader v1.0.1

Description (선택사항):
YouTube 다운로더 앱 v1.0.1

주요 기능:
- 유튜브 영상 검색 및 다운로드
- 음악 다운로드
- 찜하기 기능
- 다운로드 파일 관리

설치 방법:
1. APK 파일을 다운로드하세요
2. 안드로이드 설정에서 "알 수 없는 출처" 설치 허용
3. APK 파일을 실행하여 설치하세요
```

#### 2-5. APK 파일 업로드
1. **"Attach binaries by dropping them here or selecting them"** 영역 찾기
2. APK 파일을 **드래그 앤 드롭** 또는 **"selecting them"** 클릭
   - 파일: `app-release.apk` 또는 `app.apk`
   - 파일 크기: 약 113MB
   - 업로드 시간: 1-2분 소요

#### 2-6. Release 발행
1. 모든 정보 확인 후 **"Publish release"** 버튼 클릭
2. 몇 초 후 Release가 생성됨

---

### 3단계: 다운로드 URL 확인

Release가 생성되면:

1. Release 페이지에서 APK 파일 찾기
2. 파일명 위에 마우스 오버 → 우클릭 → **"링크 주소 복사"**
   - 또는 파일명을 클릭하면 다운로드 페이지로 이동
   
**다운로드 URL 형식:**
```
https://github.com/appdison76/youtube_down/releases/download/v1.0.1/app-release.apk
```

**주의:** 파일명이 `app.apk`로 업로드했다면:
```
https://github.com/appdison76/youtube_down/releases/download/v1.0.1/app.apk
```

---

### 4단계: index.html 수정

`install-page/index.html` 파일 수정:

#### 변경 전:
```html
<a href="https://drive.google.com/uc?export=download&id=1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc&confirm=t" 
   class="download-btn" 
   id="downloadBtn" 
   download="youtube-downloader.apk" 
   type="application/vnd.android.package-archive">
    📥 앱 다운로드 (APK)
</a>
```

#### 변경 후:
```html
<a href="https://github.com/appdison76/youtube_down/releases/download/v1.0.1/app-release.apk" 
   class="download-btn" 
   id="downloadBtn" 
   download="youtube-downloader.apk" 
   type="application/vnd.android.package-archive">
    📥 앱 다운로드 (APK)
</a>
```

**파일명이 다르면 URL도 변경:**
- `app-release.apk`로 업로드했다면: `.../app-release.apk`
- `app.apk`로 업로드했다면: `.../app.apk`

---

### 5단계: 커밋 및 푸시

```bash
git add install-page/index.html
git commit -m "Update APK download link to GitHub Releases"
git push origin main
```

---

## ✅ 완료 확인

1. GitHub Releases 페이지에서 APK 파일 확인
2. 다운로드 URL 접속 테스트
3. 웹 페이지에서 다운로드 버튼 테스트

---

## 🔄 버전 업데이트 시

나중에 앱을 업데이트할 때:

1. **새 APK 빌드** (versionCode, versionName 업데이트)
2. **새 Release 생성** (태그: v1.0.2, v1.0.3 등)
3. **APK 업로드**
4. **index.html의 URL 업데이트** (태그 버전 변경)

예시:
```html
<!-- v1.0.2로 업데이트 -->
<a href="https://github.com/appdison76/youtube_down/releases/download/v1.0.2/app-release.apk"
```

---

## 🎯 빠른 요약

1. ✅ GitHub 저장소: https://github.com/appdison76/youtube_down
2. ✅ Releases 페이지로 이동
3. ✅ "Create a new release" 클릭
4. ✅ 태그: v1.0.1 입력
5. ✅ APK 파일 드래그 앤 드롭
6. ✅ "Publish release" 클릭
7. ✅ 다운로드 URL 복사
8. ✅ index.html 수정
9. ✅ Git 커밋 및 푸시
10. ✅ 완료! 🎉

---

## 💡 팁

- **태그 이름:** `v1.0.1`, `v1.0.2` 형식 권장
- **파일명:** 일관되게 `app-release.apk` 권장
- **설명:** Release 설명에 설치 방법, 변경사항 등 작성 권장
- **최신 버전:** 항상 최신 Release의 다운로드 링크 사용

---

## 🔗 관련 링크

- GitHub Releases: https://github.com/appdison76/youtube_down/releases
- 저장소: https://github.com/appdison76/youtube_down










