# Metro 서버 포트 자동 감지 및 ADB 포트 포워딩 자동 설정

Write-Host "=== Metro 서버 포트 자동 감지 및 ADB 포트 포워딩 설정 ===" -ForegroundColor Cyan
Write-Host ""

# Metro 서버 포트 감지 (8081 또는 8082)
$metroPort = $null
$port8081 = netstat -ano | findstr ":8081" | findstr "LISTENING"
$port8082 = netstat -ano | findstr ":8082" | findstr "LISTENING"

if ($port8081) {
    $metroPort = 8081
    Write-Host "✅ Metro 서버가 8081 포트에서 실행 중입니다." -ForegroundColor Green
} elseif ($port8082) {
    $metroPort = 8082
    Write-Host "✅ Metro 서버가 8082 포트에서 실행 중입니다." -ForegroundColor Green
} else {
    Write-Host "⚠️ Metro 서버가 실행 중이지 않습니다!" -ForegroundColor Yellow
    Write-Host "먼저 Metro 서버를 시작하세요: npm run start:clean" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 기존 ADB 포트 포워딩 제거
Write-Host "기존 ADB 포트 포워딩 제거 중..." -ForegroundColor Yellow
adb reverse --remove tcp:8081 2>$null
adb reverse --remove tcp:8082 2>$null

# 새로운 포트 포워딩 설정
Write-Host "ADB 포트 포워딩 설정 중 (포트: $metroPort)..." -ForegroundColor Yellow
adb reverse tcp:$metroPort tcp:$metroPort

# 확인
Write-Host ""
Write-Host "=== 설정 완료 ===" -ForegroundColor Green
Write-Host "Metro 서버 포트: $metroPort" -ForegroundColor Cyan
Write-Host "ADB 포트 포워딩:" -ForegroundColor Cyan
adb reverse --list
Write-Host ""
Write-Host "✅ 포트가 일치합니다. 개발 빌드를 진행할 수 있습니다." -ForegroundColor Green
