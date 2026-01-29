# Cloudflare Tunnel 사용 가이드 (로컬 서버)

ngrok 대신 **Cloudflare Tunnel**로 로컬 서버를 외부에 노출하는 방법입니다. 무료·고정 도메인·대역폭 제한 거의 없음.

---

## 📋 목차
1. [cloudflared 설치](#cloudflared-설치)
2. [서버 + 터널 시작하기](#서버--터널-시작하기)
3. [터널 URL 확인 및 config.json 업데이트](#터널-url-확인 및-configjson-업데이트)
4. [고정 도메인 사용 (선택)](#고정-도메인-사용-선택)

---

## 1. cloudflared 설치 (필수)

**터널을 쓰려면 반드시 먼저 설치해야 합니다.** 설치 전에 `run-cloudflare.bat`을 실행하면 `'cloudflared'가(은) 인식되지 않습니다` 오류가 납니다.

### Windows — winget으로 설치 (기본)
관리자 권한으로 **CMD** 또는 **PowerShell**을 연 뒤:

```powershell
winget install Cloudflare.cloudflared
```

설치 후 **새 CMD 창**을 열고 `cloudflared --version` 으로 확인한 다음, `start-server-cloudflare.bat` 실행하면 됩니다.

### 설치 확인
새 CMD 창에서:
```powershell
cloudflared --version
```
버전이 나오면 설치된 것입니다.

### (대안) winget이 안 될 때 — 수동 다운로드
1. [cloudflared GitHub Releases](https://github.com/cloudflare/cloudflared/releases) 에서 **cloudflared-windows-amd64.exe** 다운로드
2. `cloudflared.exe` 로 이름 바꿔 **`server`** 폴더에 두기

---

## 2. 서버 + 터널 시작하기

### 방법 1: 배치 파일 사용 (추천)
1. **`server/start-server-cloudflare.bat`** 더블클릭
2. 서버 창 + Cloudflare Tunnel 창이 열림
3. Tunnel 창에 `https://xxxx.trycloudflare.com` 형태의 URL이 출력됨
4. URL은 **`server/tunnel-url.txt`** 에 자동 저장되고, 서버가 30초마다 이 파일을 읽어 config와 비교

### 방법 2: 수동 실행
1. 터미널 1: `cd server` → `node server_local.js`
2. 터미널 2: `cd server` → `node run-cloudflare-writer.js` (또는 `cloudflared tunnel --url http://localhost:3000`)
3. 터널 URL을 복사해 config.json에 반영

---

## 3. 터널 URL 확인 및 config.json 업데이트

### 자동 감지
- 서버는 **5초 후 + 30초마다** `tunnel-url.txt`(Cloudflare) 또는 ngrok(4040)을 확인
- config.json과 다르면 콘솔에 **"config.json mismatch"** 와 새 URL 안내

### 수동 확인
- **API**: 브라우저에서 `http://localhost:3000/api/tunnel-url` 접속 → `url` 값 복사
- **파일**: `server/tunnel-url.txt` 내용 복사

### config.json 수정
1. `install-page/config.json` 열기
2. `apiBaseUrl` 을 터널 URL로 변경 (예: `https://xxxx.trycloudflare.com`)
3. Git commit & push → GitHub Pages 배포 후 앱이 새 URL 사용

---

## 4. URL이 자꾸 바뀌어서 테스트가 어렵다면 — 고정 URL 쓰기

Quick Tunnel은 **실행할 때마다 URL이 바뀌어서** config를 매번 수정하기 번거롭습니다. **고정 URL**이 필요하면 **네임드 터널**을 쓰면 됩니다. (무료, 본인 도메인 없어도 됨.)

### 4-1. Cloudflare 네임드 터널 (고정 URL, 무료)

1. **Cloudflare 계정**  
   https://dash.cloudflare.com/sign-up (무료 가입)

2. **Zero Trust 대시보드**  
   https://one.dash.cloudflare.com/ 접속 → 로그인

3. **터널 생성**  
   **Access** → **Tunnels** → **Create a tunnel**  
   - 이름: 예) `youtube-down`  
   - **Next** → **Cloudflared** 설치 타입 선택  
   - 나오는 **`cloudflared tunnel run`** 명령(또는 토큰) 복사

4. **로컬에서 터널 실행**  
   - 터널 생성 시 나온 **Public Hostname** 이 **고정 URL**입니다.  
     예: `https://youtube-down-xxxx.cfargotunnel.com` (본인 도메인 없어도 이렇게 하나 줌)  
   - **Ingress** 에서 **Service** = `http://localhost:3000` 인지 확인  
   - 터미널에서:
     ```cmd
     cloudflared tunnel run youtube-down
     ```
     (또는 대시보드에서 준 `cloudflared tunnel run ...` 명령 그대로 실행)

5. **config.json 한 번만 설정**  
   `install-page/config.json` 의 `apiBaseUrl` 을 위 **고정 URL**로 넣어 두면, 더 이상 바꿀 필요 없습니다.

이후에는 **서버만 켜고** → **`cloudflared tunnel run youtube-down`** 만 실행하면 항상 같은 URL로 접속됩니다.

### 4-2. 본인 도메인이 있는 경우

도메인을 Cloudflare에 연결한 뒤, 터널의 Public Hostname을 `youtube-down.내도메인.com` 처럼 지정하면 같은 방식으로 고정 URL 사용 가능합니다.

---

## 📁 관련 파일

| 파일 | 설명 |
|------|------|
| `server/start-server-cloudflare.bat` | 서버 + Cloudflare Tunnel 한 번에 실행 |
| `server/run-cloudflare.bat` | Cloudflare Tunnel만 실행 |
| `server/run-cloudflare-writer.js` | cloudflared 실행 + URL을 `tunnel-url.txt`에 저장 |
| `server/tunnel-url.txt` | Quick Tunnel URL 자동 저장 (git 제외) |
| `server/server_local.js` | 터널 URL 감지 (`tunnel-url.txt` 우선, 없으면 ngrok) |

---

## 🔗 ngrok과 비교

- **URL 감지**: ngrok은 4040 API, Cloudflare는 `tunnel-url.txt` 파일. 서버는 둘 다 지원하며 **Cloudflare(tunnel-url.txt) 우선**.
- **기존 ngrok 사용자**: `start-server-ngrok.bat` 그대로 사용 가능. `start-server-cloudflare.bat`만 Cloudflare용입니다.
- **비용/제한**: [TUNNEL_OPTIONS.md](./TUNNEL_OPTIONS.md) 참고.
