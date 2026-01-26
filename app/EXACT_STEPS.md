# 정확한 실행 방법

## 🎯 목표
`npm run android` 실행 시 자동으로:
1. ADB 포트 포워딩 설정
2. 빌드
3. 설치
4. Metro 서버 시작 (localhost로)
5. 연결 (타임아웃 없이)

## ✅ 실행 방법

### 1단계: USB로 폰 연결
- USB 디버깅 활성화 확인
- `adb devices`로 연결 확인

### 2단계: 한 번만 실행
```powershell
cd c:\projects\youtube_down\app
npm run android
```

**끝!** 이제 자동으로:
- ADB 포트 포워딩 설정
- 빌드 시작
- 설치
- Metro 서버 시작 (localhost)
- 연결

## 🔍 확인 사항

빌드 후 Metro 서버가 시작되면:

**정상:**
```
› Metro waiting on
exp+app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081
```

**문제:**
```
› Metro waiting on
exp+app://expo-development-client/?url=http%3A%2F%2F192.168.x.x%3A8081
```

## ⚠️ 여전히 네트워크 IP로 나오면

1. **캐시 삭제 후 재시도:**
```powershell
cd c:\projects\youtube_down\app
Remove-Item -Path .expo,node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
npm run android
```

2. **PowerShell 세션 재시작** (새 터미널 열기)

3. **ADB 수동 설정 후 빌드:**
```powershell
adb reverse tcp:8081 tcp:8081
npm run android
```

## 💡 핵심

**`npm run android` 하나만 실행하면 됩니다!**

자동으로 모든 설정이 완료됩니다.
