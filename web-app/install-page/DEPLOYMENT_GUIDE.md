# APK 배포 방법 상세 가이드

## 📋 문제 상황
- APK 파일이 Git LFS로 저장되어 있음
- 웹 서버에서 실제 APK 파일 대신 LFS 포인터만 제공됨
- 결과: "패키지를 파싱하는 중 문제가 발생했습니다" 오류 발생

---

## 방법 1: GitHub Releases 사용 (가장 추천) ⭐

### 장점
- ✅ 완전 무료
- ✅ 안정적이고 빠른 다운로드 (CDN 지원)
- ✅ 대용량 파일 지원 (최대 2GB)
- ✅ 버전 관리 자동화 가능
- ✅ 다운로드 통계 확인 가능
- ✅ GitHub와 통합되어 관리 편리

### 단점
- ❌ GitHub 계정 필요
- ❌ 약간의 설정 시간 필요 (5분 정도)

### 단계별 가이드

#### 1단계: GitHub 저장소 확인
- 현재 프로젝트의 GitHub 저장소 URL 확인
- 예: `https://github.com/사용자명/저장소명`

#### 2단계: APK 파일 준비
- 빌드된 APK 파일 위치 확인
- 경로: `app/android/app/build/outputs/apk/release/app-release.apk`
- 파일 크기: 약 113MB

#### 3단계: GitHub Releases 생성

**방법 A: 웹 브라우저에서 (가장 간단)**

1. GitHub 저장소 페이지 접속
   ```
   https://github.com/YOUR_USERNAME/YOUR_REPO
   ```

2. 오른쪽 사이드바에서 **"Releases"** 클릭
   - 또는 직접: `https://github.com/YOUR_USERNAME/YOUR_REPO/releases`

3. **"Create a new release"** 또는 **"Draft a new release"** 버튼 클릭

4. Release 정보 입력:
   ```
   Choose a tag: v1.0.1 (또는 원하는 버전)
   - 처음이면 "Create new tag: v1.0.1 on publish" 입력
   
   Release title: v1.0.1 (또는 "YouTube Downloader v1.0.1")
   
   Description (선택사항):
   - YouTube 다운로더 앱 v1.0.1
   - 주요 기능: 영상 다운로드, 음악 다운로드, 찜하기
   ```

5. **"Attach binaries by dropping them here or selecting them"** 영역에
   - `app-release.apk` 파일을 **드래그 앤 드롭**
   - 또는 **"selecting them"** 클릭하여 파일 선택
   - 파일 크기가 크므로 업로드에 1-2분 소요될 수 있음

6. **"Publish release"** 버튼 클릭
   - 몇 초 후 Release가 생성됨

7. APK 다운로드 URL 확인:
   - Release 페이지에서 APK 파일을 우클릭 → "링크 주소 복사"
   - 또는 Release 페이지에서 파일명 클릭
   - URL 형식: `https://github.com/USERNAME/REPO/releases/download/v1.0.1/app-release.apk`

**방법 B: GitHub CLI 사용 (고급 사용자)**

```bash
# GitHub CLI 설치 (https://cli.github.com/)
# 이미 설치되어 있다면 생략

# 로그인
gh auth login

# Release 생성 및 APK 업로드
gh release create v1.0.1 app/android/app/build/outputs/apk/release/app-release.apk \
  --title "v1.0.1" \
  --notes "YouTube 다운로더 앱 v1.0.1"
```

#### 4단계: index.html 수정

`install-page/index.html` 파일을 열고 다음 부분을 수정:

**변경 전:**
```html
<a href="./app.apk" class="download-btn" id="downloadBtn" download="youtube-downloader.apk">
```

**변경 후:**
```html
<a href="https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.1/app-release.apk" 
   class="download-btn" 
   id="downloadBtn" 
   download="youtube-downloader.apk"
   type="application/vnd.android.package-archive">
```

**실제 예시:**
```html
<a href="https://github.com/johndoe/youtube-downloader/releases/download/v1.0.1/app-release.apk" 
   class="download-btn" 
   id="downloadBtn" 
   download="youtube-downloader.apk"
   type="application/vnd.android.package-archive">
```

#### 5단계: 테스트
1. 웹 페이지에서 다운로드 버튼 클릭
2. APK 파일이 정상적으로 다운로드되는지 확인
3. 다운로드한 APK 파일을 안드로이드 기기에서 설치 테스트

---

## 방법 2: Google Drive 사용

### 장점
- ✅ 설정이 매우 간단 (2분 정도)
- ✅ Google 계정만 있으면 바로 사용 가능
- ✅ 무료 (15GB 저장 공간)
- ✅ 파일 크기 제한 없음 (개인 계정 기준)

### 단점
- ❌ 하루 다운로드 제한 있음 (약 750GB/일)
- ❌ Google 계정 필요
- ❌ 파일 ID를 직접 관리해야 함
- ❌ URL이 변경될 수 있음

### 단계별 가이드

#### 1단계: Google Drive에 APK 업로드

**방법 A: 웹 브라우저**

1. https://drive.google.com 접속
2. **"새로 만들기"** 또는 **"업로드"** 클릭
3. **"파일 업로드"** 선택
4. `app-release.apk` 파일 선택 (경로: `app/android/app/build/outputs/apk/release/`)
5. 업로드 완료 대기 (113MB이므로 1-2분 소요)

**방법 B: 드래그 앤 드롭**

1. Google Drive 페이지 열기
2. Windows 탐색기에서 `app-release.apk` 파일을 Google Drive 창으로 드래그
3. 업로드 완료 대기

#### 2단계: 공유 설정 변경

1. Google Drive에서 업로드한 `app-release.apk` 파일 **우클릭**
2. **"공유"** 또는 **"Share"** 클릭
3. 공유 설정 창에서:
   - **"링크가 있는 모든 사용자"** 선택
   - 또는 **"Anyone with the link"** 선택
   - 권한: **"뷰어"** 또는 **"Viewer"** (읽기 전용)
4. **"완료"** 또는 **"Done"** 클릭
5. **"링크 복사"** 클릭하여 공유 링크 복사
   - 예: `https://drive.google.com/file/d/1ABC123XYZ456DEF789/view?usp=sharing`

#### 3단계: 직접 다운로드 URL 생성

공유 링크에서 **파일 ID** 추출:

**원본 공유 링크:**
```
https://drive.google.com/file/d/1ABC123XYZ456DEF789/view?usp=sharing
                                        ↑
                                   이것이 파일 ID
```

**직접 다운로드 URL로 변환:**
```
https://drive.google.com/uc?export=download&id=1ABC123XYZ456DEF789
```

또는 더 안정적인 방법 (큰 파일용):
```
https://drive.google.com/uc?export=download&id=1ABC123XYZ456DEF789&confirm=t
```

#### 4단계: index.html 수정

`install-page/index.html` 파일을 열고 다음 부분을 수정:

**변경 전:**
```html
<a href="./app.apk" class="download-btn" id="downloadBtn" download="youtube-downloader.apk">
```

**변경 후:**
```html
<a href="https://drive.google.com/uc?export=download&id=YOUR_FILE_ID" 
   class="download-btn" 
   id="downloadBtn" 
   download="youtube-downloader.apk"
   type="application/vnd.android.package-archive">
```

**실제 예시 (파일 ID가 `1ABC123XYZ456DEF789`인 경우):**
```html
<a href="https://drive.google.com/uc?export=download&id=1ABC123XYZ456DEF789&confirm=t" 
   class="download-btn" 
   id="downloadBtn" 
   download="youtube-downloader.apk"
   type="application/vnd.android.package-archive">
```

**참고:**
- `&confirm=t` 파라미터 추가 시: 큰 파일 다운로드 시 Google의 바이러스 스캔 경고를 건너뜀
- 파일 ID만 변경하면 되므로 업데이트 시 편리함

#### 5단계: 테스트
1. 웹 페이지에서 다운로드 버튼 클릭
2. APK 파일이 정상적으로 다운로드되는지 확인
3. 다운로드한 APK 파일을 안드로이드 기기에서 설치 테스트

---

## 두 방법 비교

| 항목 | GitHub Releases | Google Drive |
|------|----------------|--------------|
| **설정 난이도** | ⭐⭐⭐ (보통) | ⭐ (매우 쉬움) |
| **무료 여부** | ✅ 완전 무료 | ✅ 무료 |
| **다운로드 속도** | ⭐⭐⭐⭐⭐ (매우 빠름) | ⭐⭐⭐ (보통) |
| **안정성** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **다운로드 제한** | 없음 | 하루 750GB |
| **버전 관리** | ✅ 자동 | ❌ 수동 |
| **파일 크기 제한** | 2GB | 없음 (개인 기준) |
| **URL 변경** | 거의 없음 | 파일 이동 시 변경 |
| **통계 확인** | ✅ 가능 | ❌ 불가능 |
| **업데이트 편의성** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |

---

## 추천

### GitHub Releases를 추천하는 경우:
- ✅ GitHub를 이미 사용 중
- ✅ 버전 관리가 중요
- ✅ 다운로드 통계 확인이 필요
- ✅ 더 안정적인 서비스 원함
- ✅ 업데이트가 자주 발생

### Google Drive를 추천하는 경우:
- ✅ 빠르게 설정하고 싶음
- ✅ GitHub 계정이 없음
- ✅ 간단한 배포만 필요
- ✅ 업데이트가 거의 없음

---

## 빠른 시작 가이드

### GitHub Releases (5분)
1. GitHub 저장소 → Releases → Create new release
2. 태그: `v1.0.1`
3. APK 파일 드래그 앤 드롭
4. Publish release
5. index.html에서 URL 수정

### Google Drive (2분)
1. Google Drive에 APK 업로드
2. 공유 설정: "링크가 있는 모든 사용자"
3. 파일 ID 추출
4. index.html에서 URL 수정

---

## 주의사항

### 공통
- ✅ APK 파일은 항상 HTTPS로 제공하세요
- ✅ 업데이트 시 버전 번호를 변경하세요
- ✅ 다운로드 전 파일 크기를 표시하세요 (113MB)

### GitHub Releases
- ⚠️ Release를 삭제하면 기존 링크가 작동하지 않습니다
- ⚠️ 태그를 삭제하지 마세요

### Google Drive
- ⚠️ 파일을 이동하거나 삭제하면 링크가 작동하지 않습니다
- ⚠️ 공유 설정을 변경하지 마세요
- ⚠️ 하루 다운로드 제한이 있습니다 (일반적으로 문제없음)

---

## 문제 해결

### GitHub Releases에서 다운로드가 안 될 때:
1. Release가 "Published" 상태인지 확인
2. 파일이 실제로 업로드되었는지 확인
3. URL이 정확한지 확인 (태그 버전 확인)

### Google Drive에서 다운로드가 안 될 때:
1. 공유 설정 확인 ("링크가 있는 모든 사용자")
2. 파일 ID가 정확한지 확인
3. `&confirm=t` 파라미터 추가 시도
4. 직접 링크 형식 사용: `https://drive.google.com/uc?export=download&id=FILE_ID`

---

## 다음 단계

1. 원하는 방법 선택
2. 위의 단계별 가이드 따라하기
3. index.html 수정
4. 웹 페이지 배포 (GitHub Pages, Netlify 등)
5. 다운로드 테스트
6. 완료! 🎉










