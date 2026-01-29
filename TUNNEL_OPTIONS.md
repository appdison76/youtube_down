# 터널 옵션 비교 (로컬 서버 → 외부 접속)

노트북 서버를 외부에서 접속하려면 터널 서비스가 필요합니다. ngrok 유료 vs **Cloudflare Tunnel** 비교입니다.

---

## 📊 비교표 (재미나이님 추천 반영)

| 항목 | ngrok (유료) | Cloudflare Tunnel (추천) |
|------|--------------|--------------------------|
| **비용** | 월 약 1~2만 원 ($8/월 등) | **무료** |
| **안정성** | 매우 높음 (설정이 쉬움) | 매우 높음 (기업용 수준) |
| **주소 고정** | 유료 플랜만 가능 | **본인 도메인으로 무료 고정 가능** |
| **속도/대역폭** | 플랜에 따라 제한 있음 | 무료임에도 **제한이 거의 없음** |

---

## 💡 정리

- **ngrok 무료**: URL 매번 바뀜, 대역폭 제한(예: ~0.06MB 끊김) → 테스트용으로만 적합.
- **ngrok 유료**: 고정 URL, 설정 쉬움 → 비용 부담 있음.
- **Cloudflare Tunnel**: 무료 + 고정 도메인 + 대역폭 거의 무제한 → **노트북 서버 상시 노출용으로 추천.**

---

## 🔗 Cloudflare Tunnel 참고

- **프로젝트 가이드**: [CLOUDFLARE_TUNNEL_GUIDE.md](./CLOUDFLARE_TUNNEL_GUIDE.md) — 설치, `start-server-cloudflare.bat`, config.json 연동
- 공식: [Cloudflare Zero Trust · Tunnels](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)
- 로컬 터널: `cloudflared tunnel --url http://localhost:3000` 로 빠르게 공개 URL 발급 가능.
- 본인 도메인이 있으면 Cloudflare에 DNS 연결 후 **고정 서브도메인**(예: `youtube-down.내도메인.com`)으로 무료 고정 가능.

---

## 📁 관련 문서

- **ngrok 사용**: [NGROK_GUIDE.md](./NGROK_GUIDE.md) — 무료/유료 ngrok 사용법
- **노트북 서버 전체 설정**: [LAPTOP_SERVER_SETUP.md](./LAPTOP_SERVER_SETUP.md) — 전원, Node, ngrok 유료 기준

Cloudflare Tunnel으로 전환 시에도 `config.json`의 `apiBaseUrl`만 터널 URL(예: `https://youtube-down.내도메인.com`)로 바꾸면 동일하게 사용 가능합니다.
