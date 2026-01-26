# Metro 서버 종료 방법

## 방법 1: 터미널에서 직접 종료 (가장 간단)

Metro 서버가 실행 중인 터미널에서:

```
Ctrl + C
```

또는

```
Ctrl + C (한 번 더 눌러서 강제 종료)
```

## 방법 2: PowerShell에서 모든 Node 프로세스 종료

Metro 서버가 실행 중인 터미널을 찾을 수 없거나 닫혔을 때:

```powershell
# 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force
```

## 방법 3: 특정 포트 사용 프로세스 종료

특정 포트(8081 또는 8082)를 사용하는 프로세스만 종료:

```powershell
# 8081 포트 사용 프로세스 찾기
netstat -ano | findstr ":8081" | findstr "LISTENING"

# PID 확인 후 종료 (예: PID가 12345인 경우)
taskkill /PID 12345 /F

# 또는 8082 포트
netstat -ano | findstr ":8082" | findstr "LISTENING"
taskkill /PID [PID번호] /F
```

## 방법 4: 한 번에 모든 것 종료 (권장)

```powershell
# 모든 Node/Expo 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*' -or $_.ProcessName -like '*expo*'} | Stop-Process -Force -ErrorAction SilentlyContinue
```

## 확인 방법

Metro 서버가 종료되었는지 확인:

```powershell
# 포트 확인
netstat -ano | findstr ":8081 :8082" | findstr "LISTENING"

# 아무것도 나오지 않으면 종료된 것
```

## 빠른 종료 스크립트

```powershell
# 모든 Node 프로세스 종료
Get-Process | Where-Object {$_.ProcessName -like '*node*'} | Stop-Process -Force -ErrorAction SilentlyContinue

# 확인
Write-Host "Metro 서버 종료 완료"
netstat -ano | findstr ":8081 :8082" | findstr "LISTENING"
```
