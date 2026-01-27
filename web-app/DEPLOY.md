# 웹페이지 배포 가이드

## 방법 1: 로컬에서 확인 (빠른 테스트)

### Python 사용 (가장 간단)
```bash
cd web-app
python -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속

### Node.js 사용
```bash
cd web-app
npx http-server -p 8000
```

브라우저에서 `http://localhost:8000` 접속

---

## 방법 2: GitHub Pages 배포

### 현재 저장소에 추가

1. **GitHub 저장소에 푸시**
   ```bash
   git add web-app/
   git commit -m "Add web-app PWA"
   git push
   ```

2. **GitHub Pages 설정**
   - GitHub 저장소 → Settings → Pages
   - Source: Deploy from a branch
   - Branch: main
   - Folder: `/web-app`
   - Save

3. **접속 URL**
   - `https://YOUR_USERNAME.github.io/youtube_down/web-app/`
   - 또는 커스텀 도메인 설정 가능

---

## 방법 3: Netlify (드래그 앤 드롭)

1. [Netlify](https://www.netlify.com/) 접속
2. `web-app` 폴더를 드래그 앤 드롭
3. 자동으로 URL 생성

---

## 방법 4: Vercel

```bash
cd web-app
npx vercel
```

---

## 참고

- API 서버가 없어도 화면 UI는 확인 가능
- 실제 기능 테스트는 Railway 서버 API 필요
- API URL은 `index.html`에서 설정
