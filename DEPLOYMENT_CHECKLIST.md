# 배포 체크리스트 ✅

## 🎯 완료된 작업

### Railway 서버 배포
- [x] Railway 프로젝트 생성
- [x] GitHub 저장소 연결
- [x] Root Directory: `server` 설정
- [x] 포트 8080 설정
- [x] 도메인 생성: `youtubedown-production.up.railway.app`
- [x] Python + yt-dlp 설치 설정 (`nixpacks.toml`)
- [x] Railway 설정 파일 추가 (`railway.json`)

### 앱 설정
- [x] 외부 config.json 지원 구현
- [x] `api.js` 수정 (동적 서버 주소 로드)
- [x] `downloadService.js` 수정 (동적 API URL 사용)

### 설정 파일
- [x] `install-page/config.json` 생성
- [x] Railway 서버 URL 설정

---

## 🔍 최종 확인 필요

### 1. Railway 서버 배포 상태 확인
- [ ] Railway 대시보드 → "배치" 탭
- [ ] 배포 상태: "활성" 또는 "Deployed" 확인
- [ ] 로그 확인: 서버가 정상 시작되었는지
  ```
  [Server] YouTube Downloader Server running on port 8080
  ```

### 2. 서버 Health Check 테스트
브라우저에서 다음 URL 접속:
```
https://youtubedown-production.up.railway.app/health
```
- [ ] 정상 응답 확인:
  ```json
  {"status":"ok","timestamp":"..."}
  ```

### 3. Git 커밋 및 푸시
- [ ] 변경 사항 커밋
- [ ] GitHub에 푸시
- [ ] Netlify 자동 배포 대기 (config.json)

### 4. 최종 테스트
- [ ] 앱에서 서버 연결 테스트
- [ ] 음악/영상 다운로드 테스트

---

## 📝 다음 단계

1. **Railway 서버 확인**
   - 배포 완료되었는지 확인
   - `/health` 엔드포인트 테스트

2. **Git 커밋**
   ```bash
   git commit -m "Add external config.json support and Railway deployment"
   git push origin main
   ```

3. **Netlify 배포 대기**
   - config.json 자동 배포 (1-2분)

4. **앱 테스트**
   - 앱 재시작
   - 음악/영상 다운로드 테스트

---

## 🔗 중요 URL

- **Railway 서버**: `https://youtubedown-production.up.railway.app`
- **설치 페이지**: `https://youtube-down.netlify.app/`
- **config.json**: `https://youtube-down.netlify.app/config.json`
- **APK 다운로드**: `https://github.com/appdison76/youtube_down/releases/download/v1.0.1/app-release.apk`

---

## ✅ 완료 체크

- [ ] Railway 서버 배포 완료
- [ ] Health check 통과
- [ ] Git 커밋 완료
- [ ] Netlify 배포 완료
- [ ] 앱 테스트 성공










