# 캐시 삭제 (간단 버전)

## 빠른 캐시 삭제

```powershell
cd c:\projects\youtube_down\app

# 1. 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. 캐시 삭제
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path $env:TEMP\metro-* -Recurse -Force -ErrorAction SilentlyContinue

# 3. 완료
Write-Host "✅ 캐시 삭제 완료!" -ForegroundColor Green
```

## 또는 --clear 옵션 사용 (가장 간단)

```powershell
# Metro 서버 종료 후
npm run start:dev
```

`start:dev`는 `--clear` 옵션이 없지만, 캐시 오류가 발생하면:

```powershell
# 캐시 삭제 후 시작
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force
Remove-Item -Path .expo -Recurse -Force -ErrorAction SilentlyContinue
adb reverse tcp:8081 tcp:8081 && expo start --clear --dev-client
```

## 권장 순서

1. **캐시 삭제** (선택사항이지만 권장)
2. **ADB 포트 포워딩 설정**
3. **Metro 서버 시작** (`npm run start:dev`)
