# Node.js와 Python을 모두 포함하는 베이스 이미지
FROM node:18-bullseye

# Python 및 pip 설치
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# yt-dlp 설치
RUN pip3 install --no-cache-dir yt-dlp

# 작업 디렉토리 설정
WORKDIR /app

# package.json과 package-lock.json 복사
COPY package*.json ./

# npm 의존성 설치
RUN npm ci --only=production

# 서버 파일 복사
COPY server.js ./

# 다운로드 디렉토리 생성
RUN mkdir -p downloads

# 포트 노출 (Railway가 PORT 환경 변수로 설정)
EXPOSE 3000

# 서버 시작
CMD ["node", "server.js"]

