# Railway Dockerfile 빌드

## 현재 구조

- **빌드 컨텍스트**: `server` 폴더 (Railway Root Directory = `server` 그대로 사용)
- **install-page**: GitHub Pages로 서빙하므로 Docker 이미지에 포함하지 않음  
  → Railway `/install-page/` 는 404 (PRO 배너 링크는 GitHub Pages install-page URL 사용)

## Root Directory

Railway → Settings → Source → **Root Directory: `server`** 로 두면 됩니다.  
별도 루트 변경이나 `railway.toml` 설정 없이 빌드됩니다.
