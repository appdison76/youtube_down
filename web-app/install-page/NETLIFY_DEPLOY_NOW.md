# Netlify 지금 바로 배포하기

## 🚀 빠른 배포 (3분 안에!)

### 현재 상황
- ✅ Git에 커밋 완료
- ❌ Netlify에 배포 필요

### 배포 방법 (둘 중 하나 선택)

---

## 방법 1: 수동 배포 (가장 빠름, 1분)

1. **Netlify 접속**
   - https://app.netlify.com 접속

2. **기존 사이트 재배포**
   - `youtube-down` 사이트 클릭
   - **"Deploys"** 탭 클릭
   - **"Trigger deploy"** 버튼 클릭 → **"Clear cache and deploy site"** 선택
   - 또는 **"Add new site"** → **"Deploy manually"** 클릭
   - `install-page` 폴더를 드래그 앤 드롭

3. **완료!**
   - 몇 초 후 배포 완료
   - https://youtube-down.netlify.app/config.json 접속하여 확인

---

## 방법 2: Git 연동 설정 (자동 배포, 처음 한 번만)

### 이미 Git 연동이 되어 있다면?
- Git push만 하면 자동 배포됨!
- 배포 상태 확인: Netlify 대시보드 → Deploys 탭

### Git 연동이 안 되어 있다면?

1. **Netlify 접속**
   - https://app.netlify.com 접속

2. **새 사이트 추가 (Git 연동)**
   - **"Add new site"** → **"Import an existing project"** 클릭
   - **GitHub** 선택
   - GitHub 인증 (처음만)
   - `appdison76/youtube_down` 저장소 선택

3. **빌드 설정**
   - **Base directory**: `install-page` (또는 빈칸)
   - **Build command**: (비워두기 - 정적 파일이므로)
   - **Publish directory**: `install-page`
   - **Deploy site** 클릭

4. **완료!**
   - 이제 Git push만 하면 자동 배포됨!

---

## ✅ 배포 확인

배포 완료 후 다음 URL에서 확인:

- **메인 페이지**: https://youtube-down.netlify.app/
- **config.json**: https://youtube-down.netlify.app/config.json
- **version.json**: https://youtube-down.netlify.app/version.json

`config.json`에서 JSON 데이터가 보이면 성공! 🎉

---

## 🔄 앞으로는?

### Git 연동 시:
```bash
git add .
git commit -m "변경 사항"
git push origin main
```
→ Netlify 자동 배포! (1-2분 소요)

### 수동 배포 시:
- Netlify 대시보드에서 "Trigger deploy" 클릭

---

## ❓ 문제 해결

### config.json이 404라면?
1. Netlify에서 `install-page` 폴더가 배포되었는지 확인
2. `Publish directory`가 `install-page`로 설정되어 있는지 확인
3. 파일이 `install-page/config.json` 경로에 있는지 확인

### Git 연동이 안 될 때?
- Netlify → Site settings → Build & deploy → Continuous Deployment
- "Link repository" 버튼으로 다시 연동

---

**가장 빠른 방법: 수동 배포 (드래그 앤 드롭)! 🚀**









