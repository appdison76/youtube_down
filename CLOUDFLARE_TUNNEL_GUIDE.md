# Cloudflare Tunnel 사용 가이드 (로컬 서버)

**고정 주소:** https://melodysnap.mediacommercelab.com  
**필요한 것:** cloudflared 서비스(Windows) + 서버만 실행.

---

## 1. 실행 방법 (이것만 하면 됨)

### ① cloudflared 서비스 켜기 (한 번만 또는 PC 켤 때)

- **Win + R** → `services.msc` → Enter  
- 목록에서 **cloudflared** 찾기 → **시작** (또는 자동이면 이미 켜져 있음)

### ② 서버 실행

- **`server/start-server-cloudflare.bat`** 더블클릭  
- 뜬 서버 창 닫지 마세요.

### ③ 접속

- 브라우저: **https://melodysnap.mediacommercelab.com**

---

## 2. 필요한 파일만

| 필요한 것 | 설명 |
|-----------|------|
| **cloudflared** (Windows 서비스) | 터널. 대시보드에서 터널 만들고 `cloudflared service install <토큰>` 로 설치한 것 |
| **start-server-cloudflare.bat** | 서버만 실행 (localhost:3000) |
| **install-page/config.json** | `apiBaseUrl`: `https://melodysnap.mediacommercelab.com` |

---

## 3. 접속이 안 될 때

- **Error 1033** → cloudflared 서비스가 꺼져 있음. **services.msc** 에서 **cloudflared** → **시작**
- **연결할 수 없음** → 서버(localhost:3000)가 안 떠 있음. **start-server-cloudflare.bat** 다시 실행

---

## 4. cloudflared 처음 설치할 때 (이미 했으면 생략)

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → Tunnels → Create tunnel (이름: melodysnap)
2. Public Hostname: **melodysnap.cfargotunnel.com** → **http://localhost:3000**
3. 대시보드에서 나온 **`cloudflared service install <토큰>`** 을 **관리자 CMD**에서 실행
4. 본인 도메인(mediacommercelab.com) DNS에 CNAME: **melodysnap** → **melodysnap.cfargotunnel.com** (Proxied)
5. **config.json** 의 **apiBaseUrl**: **https://melodysnap.mediacommercelab.com**

---

## 5. ngrok 사용 시

- **start-server-ngrok.bat** 그대로 사용 가능. Cloudflare와 별개.
