# 🚨 Metro 캐시 오류 해결 ("Unable to deserialize cloned data")

## 문제
```
Error while reading cache, falling back to a full crawl: 
Error: Unable to deserialize cloned data
```

이 오류는 Metro Bundler의 캐시가 손상되었을 때 발생합니다.

## ✅ 해결 방법

### 방법 1: 자동 스크립트 사용 (가장 쉬움)

```powershell
cd c:\projects\youtube_down\app
npm run start:dev
```

이 스크립트가 자동으로:
1. 모든 Node 프로세스 종료
2. **모든 캐시 완전 삭제** (`.expo`, `node_modules/.cache`, `$env:TEMP\metro-*` 등)
3. ADB 포트 포워딩 설정
4. `--clear` 옵션으로 Metro 서버 시작

### 방법 2: 수동으로 캐시 삭제 후 시작

```powershell
cd c:\projects\youtube_down\app

# 1. 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

# 2. 모든 캐시 완전 삭제
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path .expo-shared -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\haste-map-* -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\react-* -Recurse -Force -ErrorAction SilentlyContinue

# 3. ADB 포트 포워딩
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081

# 4. Metro 서버 시작 (--clear 옵션 필수!)
$env:EXPO_PACKAGER_PROXY_URL = "http://localhost:8081"
$env:REACT_NATIVE_PACKAGER_HOSTNAME = "localhost"
npx expo start --dev-client --localhost --port 8081 --clear
```

### 방법 3: 한 줄 명령어 (빠른 해결)

```powershell
cd c:\projects\youtube_down\app
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force; Remove-Item -Path .expo,node_modules\.cache,$env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue; adb reverse tcp:8081 tcp:8081; $env:EXPO_PACKAGER_PROXY_URL='http://localhost:8081'; npx expo start --dev-client --localhost --clear
```

## 🔍 삭제되는 캐시 위치

1. **`.expo/`** - Expo 프로젝트 캐시
2. **`.expo-shared/`** - Expo 공유 캐시
3. **`node_modules/.cache/`** - Node 모듈 캐시
4. **`$env:TEMP\metro-*`** - Metro 임시 캐시
5. **`$env:TEMP\haste-map-*`** - Metro 파일 맵 캐시
6. **`$env:TEMP\react-*`** - React 관련 캐시

## ⚠️ 중요 사항

1. **`--clear` 옵션 필수**: Metro 서버 시작 시 반드시 `--clear` 옵션을 사용하세요
2. **프로세스 종료 먼저**: 캐시 삭제 전에 모든 Node 프로세스를 종료해야 합니다
3. **충분한 대기 시간**: 프로세스 종료 후 2-3초 대기하세요

## 🎯 빠른 실행

```powershell
cd c:\projects\youtube_down\app
npm run start:dev
```

**이제 캐시 오류 없이 깨끗하게 시작됩니다!** 🚀

## 💡 예방 방법

캐시 오류를 예방하려면:
- Metro 서버를 정상적으로 종료하세요 (Ctrl+C)
- 개발 중간중간 `npm run start:dev`를 사용하여 캐시를 정리하세요
- 문제가 발생하면 즉시 `npm run start:dev`로 재시작하세요
