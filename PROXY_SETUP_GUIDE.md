# 프록시 설정 가이드

## 방법 1: 프록시 서비스 제공업체 사용 (추천)

### 1. 프록시 서비스 가입 및 가격 비교

#### 🏆 추천 순위

##### 1위: Smartproxy (가장 저렴하고 YouTube에 적합)
- **가격**: 월 $14부터 (7GB 트래픽)
- **특징**: 
  - YouTube 다운로드에 최적화
  - 저렴한 가격
  - 사용하기 쉬움
  - 무료 체험 가능
- **URL**: https://smartproxy.com
- **추천 플랜**: Starter ($14/월) 또는 Residential ($75/월)

##### 2위: Bright Data (구 Luminati) (가장 안정적)
- **가격**: 월 $500부터 (Enterprise)
- **특징**:
  - 가장 큰 IP 풀
  - 매우 안정적
  - 비싸지만 확실함
- **URL**: https://brightdata.com
- **참고**: 개인 사용자에게는 비쌈

##### 3위: Oxylabs (중간 가격)
- **가격**: 월 $300부터
- **특징**:
  - 안정적
  - 중간 가격대
- **URL**: https://oxylabs.io

##### 4위: Proxy-Cheap (저렴한 옵션)
- **가격**: 월 $5~$20
- **특징**:
  - 매우 저렴
  - 품질은 중간
- **URL**: https://proxy-cheap.com

##### 5위: IPRoyal (저렴하고 좋음)
- **가격**: 월 $7부터 (1GB)
- **특징**:
  - 저렴한 가격
  - YouTube 지원
  - 사용하기 쉬움
- **URL**: https://iproyal.com

#### 💰 가격 비교표

| 서비스 | 최저 가격/월 | 트래픽 | YouTube 지원 | 추천도 |
|--------|-------------|--------|--------------|--------|
| **Smartproxy** | $14 | 7GB | ✅ 최적 | ⭐⭐⭐⭐⭐ |
| **IPRoyal** | $7 | 1GB | ✅ | ⭐⭐⭐⭐ |
| **Proxy-Cheap** | $5 | 1GB | ⚠️ | ⭐⭐⭐ |
| **Oxylabs** | $300 | 무제한 | ✅ | ⭐⭐⭐⭐ |
| **Bright Data** | $500 | 무제한 | ✅ | ⭐⭐⭐⭐⭐ |

#### 🎯 YouTube 다운로드용 추천

**예산이 적은 경우:**
- **IPRoyal**: $7/월 (1GB) - 테스트용
- **Smartproxy Starter**: $14/월 (7GB) - 추천!

**안정성이 중요한 경우:**
- **Smartproxy Residential**: $75/월 (무제한)
- **Oxylabs**: $300/월 (무제한)

**엔터프라이즈:**
- **Bright Data**: $500/월+ (무제한, 가장 안정적)

### 2. 프록시 서비스 가입 및 설정

#### Smartproxy 가입 (추천)
1. https://smartproxy.com 접속
2. "Get Started" 클릭
3. 플랜 선택 (Starter $14/월 추천)
4. 가입 후 Dashboard 접속
5. "Residential Proxies" 또는 "Datacenter Proxies" 선택
6. Endpoint URL 복사
   - 예: `gate.smartproxy.com:7000`
   - 또는 `http://gate.smartproxy.com:7000`

#### IPRoyal 가입 (저렴한 옵션)
1. https://iproyal.com 접속
2. "Sign Up" 클릭
3. 플랜 선택 (Residential $7/월)
4. Dashboard에서 Proxy 정보 확인
   - 예: `residential.iproyal.com:12321`

### 3. Railway 환경 변수 설정
1. Railway 대시보드 → 프로젝트 → Variables
2. 새 변수 추가:
   - Key: `PROXY_URL`
   - Value: 프록시 서비스에서 제공한 URL
     - Smartproxy 예: `http://username:password@gate.smartproxy.com:7000`
     - IPRoyal 예: `http://username:password@residential.iproyal.com:12321`
     - 또는 SOCKS5: `socks5://username:password@proxy-server.com:1080`

**중요**: 
- `username`과 `password`는 프록시 서비스 Dashboard에서 확인
- 일부 서비스는 API 키를 사용

### 4. 서버 재배포
Railway가 자동으로 재배포하거나 수동으로 재배포

### 5. 테스트
```bash
curl https://youtubedown-production.up.railway.app/api/test-ip
```

성공하면 `"success": 1` 이상이 나와야 합니다.

---

## 방법 2: 노트북에 프록시 서버 구축

### 옵션 A: 3proxy 사용 (Windows)

#### 1. 3proxy 다운로드
- https://3proxy.org/download/
- 또는 Chocolatey: `choco install 3proxy`

#### 2. 설정 파일 생성 (`3proxy.cfg`)
```
auth none
allow * *
socks -p1080
```

#### 3. 실행
```powershell
# 관리자 권한으로 실행
3proxy.exe 3proxy.cfg
```

#### 4. Railway 환경 변수 설정
- Key: `PROXY_URL`
- Value: `socks5://your-laptop-public-ip:1080`
  - 또는 ngrok 사용: `socks5://your-ngrok-url:1080`

#### 5. 방화벽 설정
- Windows 방화벽에서 포트 1080 허용
- 공유기 포트 포워딩 설정 (1080 포트)

---

### 옵션 B: Squid Proxy 사용 (Docker)

#### 1. Docker로 Squid 실행
```bash
docker run -d \
  --name squid-proxy \
  -p 3128:3128 \
  ubuntu/squid:latest
```

#### 2. Railway 환경 변수
- Key: `PROXY_URL`
- Value: `http://your-laptop-ip:3128`

---

### 옵션 C: Node.js 프록시 서버 (가장 간단)

#### 1. 노트북에 프록시 서버 설치
```bash
npm install -g http-proxy-middleware
```

#### 2. 프록시 서버 실행 스크립트 생성 (`proxy-server.js`)
```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

app.use('/', createProxyMiddleware({
  target: 'https://www.youtube.com',
  changeOrigin: true,
  ws: true,
  logLevel: 'debug'
}));

const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server running on port ${PORT}`);
});
```

#### 3. 실행
```bash
node proxy-server.js
```

#### 4. Railway 환경 변수
- Key: `PROXY_URL`
- Value: `http://your-laptop-ip:8080`

---

## 방법 3: Railway 서버에 프록시 구축 (복잡)

### Dockerfile 수정 필요
```dockerfile
# 프록시 서버 설치 및 실행
RUN apt-get update && apt-get install -y squid
COPY squid.conf /etc/squid/squid.conf
CMD ["squid", "-N", "-d", "1"]
```

**주의**: Railway 서버에서 프록시를 구축하면 복잡하고, 같은 IP를 사용하므로 차단 우회 효과가 제한적일 수 있습니다.

---

## 추천 순서

1. **프록시 서비스 제공업체 사용** (가장 간단, 안정적)
2. **노트북에 프록시 구축** (무료, 테스트용)
3. **Railway에 프록시 구축** (비추천, 복잡하고 효과 제한적)

---

## 테스트

프록시 설정 후:
```bash
curl https://youtubedown-production.up.railway.app/api/test-ip
```

성공하면 `"success": 1` 이상이 나와야 합니다.
