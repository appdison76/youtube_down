# Google Cloud Storage로 배포하기

Google Cloud Storage를 사용하면 정적 웹사이트를 무료/저렴하게 호스팅할 수 있습니다!

## 🚀 배포 방법

### 1. Google Cloud 프로젝트 생성

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 (또는 기존 프로젝트 사용)
3. 결제 계정 연결 (무료 크레딧 $300 제공)

### 2. Cloud Storage 버킷 생성

1. **Cloud Storage** → **버킷 만들기** 클릭
2. 버킷 설정:
   - **이름**: `youtube-downloader-install` (전 세계적으로 고유해야 함)
   - **위치 유형**: 리전 선택 (예: `asia-northeast3` - 서울)
   - **스토리지 클래스**: Standard
   - **액세스 제어**: 균일하게 적용
   - **고급 설정**: 기본값 유지
3. **만들기** 클릭

### 3. 정적 웹사이트 호스팅 활성화

1. 생성한 버킷 클릭
2. **구성** 탭 → **웹사이트** 섹션
3. **웹사이트 구성** 클릭
4. 설정:
   - **인덱스 페이지**: `index.html`
   - **오류 페이지**: `index.html` (또는 비워두기)
5. **저장** 클릭

### 4. 파일 업로드

#### 방법 A: 웹 콘솔에서
1. 버킷 페이지에서 **업로드** 클릭
2. `install-page` 폴더의 모든 파일 선택
3. 업로드

#### 방법 B: gsutil 명령어 (CLI)
```bash
# Google Cloud SDK 설치 필요
# https://cloud.google.com/sdk/docs/install

# 인증
gcloud auth login

# 프로젝트 설정
gcloud config set project YOUR_PROJECT_ID

# 파일 업로드
gsutil -m cp -r install-page/* gs://youtube-downloader-install/
```

### 5. 공개 액세스 설정

1. 버킷 → **권한** 탭
2. **주 구성원 추가** 클릭
3. **새 주 구성원**: `allUsers`
4. **역할**: **Cloud Storage 객체 뷰어** 선택
5. **저장** 클릭

### 6. 접속 URL

버킷의 **구성** → **웹사이트** 섹션에서 URL 확인:
```
https://storage.googleapis.com/youtube-downloader-install/index.html
```

또는 간단하게:
```
https://youtube-downloader-install.storage.googleapis.com
```

---

## 💰 비용

- **무료 할당량**: 
  - 스토리지: 5GB/월
  - 네트워크 송신: 1GB/일
- **초과 시**: 매우 저렴 (GB당 약 $0.02)
- **예상 비용**: 거의 무료 (트래픽이 많지 않다면)

---

## ✅ 장점

- ✅ Google 계정만 있으면 사용 가능
- ✅ 안정적이고 빠름
- ✅ HTTPS 자동 지원
- ✅ 커스텀 도메인 연결 가능
- ✅ 거의 무료

---

## ⚠️ 주의사항

- 버킷 이름은 전 세계적으로 고유해야 함
- 공개 액세스 설정 필수
- 정적 파일만 호스팅 가능 (서버 사이드 불가)

---

## 🔗 커스텀 도메인 연결 (선택사항)

1. Google Cloud Storage는 직접 커스텀 도메인을 지원하지 않음
2. **Cloud Load Balancer** 사용하거나
3. **Cloudflare** 같은 CDN 사용 권장

---

## 📝 빠른 시작 스크립트

```bash
# 1. Google Cloud SDK 설치 후
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. 버킷 생성
gsutil mb -l asia-northeast3 gs://youtube-downloader-install

# 3. 웹사이트 호스팅 활성화
gsutil web set -m index.html -e index.html gs://youtube-downloader-install

# 4. 파일 업로드
gsutil -m cp -r install-page/* gs://youtube-downloader-install/

# 5. 공개 액세스 설정
gsutil iam ch allUsers:objectViewer gs://youtube-downloader-install
```

---

**결론: Google Cloud Storage는 좋은 선택입니다! 무료 할당량으로 시작 가능합니다.**


















