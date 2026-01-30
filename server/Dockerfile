# Python 3.11을 베이스로 사용하고 Node.js 설치
FROM python:3.11-slim

# Node.js 18 설치 및 ffmpeg 설치 (오디오 추출용)
RUN apt-get update && \
    apt-get install -y curl ffmpeg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp 최신 버전 설치 및 업데이트 (nightly 빌드 사용 - 최신 YouTube 변경사항 대응)
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir --upgrade --force-reinstall https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz || \
    pip3 install --no-cache-dir --upgrade --force-reinstall yt-dlp

# 작업 디렉토리 설정
WORKDIR /app

# (빌드 컨텍스트: 프로젝트 루트에서 docker build -f server/Dockerfile .)
# package.json과 package-lock.json 복사
COPY server/package*.json ./

# npm 의존성 설치
RUN npm ci --only=production

# 서버 파일 복사
COPY server/server.js ./

# 설치 페이지 (PRO 배너 링크용, web-app 아래로 이동됨)
COPY web-app/install-page ./web-app/install-page

# 다운로드 디렉토리 생성
RUN mkdir -p downloads

# 포트 노출 (Railway가 PORT 환경 변수로 설정)
EXPOSE 3000

# 서버 시작
CMD ["node", "server.js"]

