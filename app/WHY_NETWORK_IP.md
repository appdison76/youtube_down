# 왜 네트워크 IP로 실행되는가?

## 원인 분석

### 원래 동작 (아이콘 변경 전)
- `expo run:android` 실행 시 자동으로 Metro 서버 시작
- 기본적으로 `localhost:8081` 사용
- USB 연결 시 자동으로 작동

### 현재 문제 (아이콘 변경 후)
- `expo run:android` 실행 시 Metro 서버가 네트워크 IP(`10.11.227.4:8081`)로 시작
- USB 연결 시 타임아웃 발생

## 왜 이런 일이 발생하는가?

1. **Expo의 자동 IP 감지**
   - Expo는 네트워크 인터페이스를 스캔하여 사용 가능한 IP를 찾음
   - 네트워크 IP가 감지되면 우선적으로 사용
   - `--localhost` 옵션이 있어도 네트워크 IP를 우선 사용할 수 있음

2. **네트워크 환경 변경**
   - Wi-Fi 연결 상태
   - 네트워크 인터페이스 활성화
   - 방화벽 설정

3. **Expo 버전 업데이트**
   - 최신 Expo 버전이 네트워크 IP를 더 우선적으로 사용할 수 있음

## 해결 방법

### 방법 1: Metro 서버를 먼저 localhost로 시작 (가장 확실)

```powershell
# 터미널 1: Metro 서버를 localhost로 먼저 시작
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
cd c:\projects\youtube_down\app
npm run start:clean

# Metro 서버가 "exp://localhost:8081"로 시작되는지 확인
# 확인 후 터미널 2에서:
npx expo run:android
```

### 방법 2: 환경 변수 설정 후 개발 빌드 (업데이트된 스크립트)

```powershell
# 이제 npm run android가 환경 변수를 자동 설정합니다
npm run android
```

### 방법 3: 직접 환경 변수 설정

```powershell
# PowerShell에서 환경 변수 설정
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"

# 개발 빌드 실행
cd c:\projects\youtube_down\app
npx expo run:android
```

## 원래 방식으로 돌아가기

원래는 `npx expo run:android`만 실행해도 작동했습니다. 하지만 지금은:

1. **Metro 서버를 먼저 localhost로 시작** (터미널 1)
2. **그 다음 개발 빌드 실행** (터미널 2)

이 순서를 따르면 원래처럼 작동합니다.

## 요약

- **원인**: Expo가 네트워크 IP를 우선적으로 감지하여 사용
- **해결**: Metro 서버를 먼저 localhost로 시작하거나, 환경 변수로 강제 설정
- **권장**: `npm run android` 스크립트 사용 (환경 변수 자동 설정됨)
