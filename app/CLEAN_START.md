# 깨끗한 시작 - 주식계산기처럼 작동하도록

## ✅ 완료된 작업

1. **`.expo` 폴더 삭제**: 수동으로 만든 설정 파일 제거
2. **`package.json` 수정**: `start:dev`에 `--localhost` 추가

## 🎯 실행 방법

주식계산기와 **정확히 동일하게**:

```powershell
cd c:\projects\youtube_down\app
npx expo run:android
```

이제 주식계산기처럼 자동으로:
- USB 연결 감지
- ADB 포트 포워딩 자동 설정
- 빌드
- 설치
- Metro 서버 시작 (localhost로)
- 연결

## ⚠️ 여전히 네트워크 IP로 나오면

**캐시 완전 삭제 후 재시도:**

```powershell
cd c:\projects\youtube_down\app

# 모든 캐시 삭제
Remove-Item -Path .expo,node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue

# 다시 실행
npx expo run:android
```

## 💡 핵심

**`.expo` 폴더를 삭제했으므로 Expo가 기본 동작으로 작동합니다.**

주식계산기처럼 `npx expo run:android`만 실행하면 자동으로 localhost로 작동해야 합니다.
