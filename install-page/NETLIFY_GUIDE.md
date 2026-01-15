# Netlify 배포 가이드

## 🚀 가장 간단한 방법: 드래그 앤 드롭

### 1단계: Netlify 가입/로그인
1. https://www.netlify.com/ 접속
2. "Sign up" 클릭
3. GitHub 계정으로 로그인 (또는 이메일 가입)

### 2단계: 배포
1. Netlify 대시보드 접속
2. **"Sites"** 클릭
3. **"Add new site"** → **"Deploy manually"** 클릭
4. `install-page` 폴더를 드래그 앤 드롭
5. 자동으로 배포 시작!

### 3단계: 완료!
- 몇 초 후 URL 생성됨
- 예: `https://amazing-app-123.netlify.app`
- 이 URL을 카카오톡으로 공유하면 됩니다!

---

## 📝 고급: Git 연동 (선택사항)

### GitHub과 연동하면:
- 코드 푸시 시 자동 배포
- 더 편리한 관리

### 설정 방법:
1. Netlify 대시보드 → **"Add new site"** → **"Import an existing project"**
2. **GitHub** 선택
3. 저장소 선택
4. 빌드 설정:
   - **Build command**: (비워두기 - 정적 파일이므로)
   - **Publish directory**: `install-page`
5. **Deploy site** 클릭

---

## ⚙️ 커스텀 도메인 설정 (선택사항)

1. Netlify 대시보드 → 사이트 선택
2. **"Domain settings"** 클릭
3. **"Add custom domain"** 클릭
4. 도메인 입력 (예: `install.yourdomain.com`)
5. DNS 설정 안내 따르기

---

## 💡 팁

- **무료 플랜**: 충분히 사용 가능
- **HTTPS**: 자동으로 제공됨
- **CDN**: 전 세계 빠른 속도
- **자동 배포**: Git 연동 시 코드 푸시만 하면 자동 업데이트

---

## ✅ 체크리스트

- [ ] Netlify 가입 완료
- [ ] `install-page` 폴더 드래그 앤 드롭
- [ ] URL 확인
- [ ] APK 다운로드 링크 설정 (`index.html`에서 `YOUR_APK_DOWNLOAD_URL` 변경)
- [ ] AdSense 설정 (선택사항)

---

**가장 빠른 방법: 드래그 앤 드롭! 5분 안에 완료 가능합니다! 🎉**


















