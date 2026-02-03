@echo off
echo ========================================
echo Release APK 빌드 스크립트 (버전 1.2.3)
echo ========================================
echo.

echo [1/2] Asset export 중...
call npx expo export --platform android
if %errorlevel% neq 0 (
    echo.
    echo [오류] Asset export 실패!
    pause
    exit /b 1
)
echo [완료] Asset export 성공
echo.

echo [2/2] Release APK 빌드 중...
cd android
call gradlew.bat assembleRelease
if %errorlevel% neq 0 (
    echo.
    echo [오류] APK 빌드 실패!
    cd ..
    pause
    exit /b 1
)
cd ..
echo.
echo ========================================
echo [성공] 빌드 완료!
echo ========================================
echo.
echo APK 위치:
echo   app\android\app\build\outputs\apk\release\melody-snap-1.2.3.apk
echo.
pause
