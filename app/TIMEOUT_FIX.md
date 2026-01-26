# 타임아웃 문제 해결

## ✅ 확인된 사실

**주식계산기도 네트워크 IP로 나오는데 잘 작동합니다!**

그렇다면 문제는:
- ❌ 네트워크 IP 사용 (이건 정상)
- ✅ **타임아웃 발생** (이게 실제 문제)

## 🔍 타임아웃 원인

네트워크 IP로 나와도 작동해야 하는데 타임아웃이 발생하는 이유:

1. **방화벽 문제**: Windows 방화벽이 포트 8081을 차단
2. **네트워크 보안 설정**: Android의 네트워크 보안 설정
3. **ADB 포트 포워딩 문제**: USB 연결이 제대로 안 됨
4. **Metro 서버 접근 불가**: 네트워크 IP로 접근할 수 없음

## ✅ 해결 방법

### 1. 방화벽 확인

```powershell
# Windows 방화벽에서 포트 8081 허용 확인
Get-NetFirewallRule | Where-Object {$_.DisplayName -like '*8081*' -or $_.DisplayName -like '*node*'}
```

포트 8081이 허용되어 있는지 확인하세요.

### 2. ADB 포트 포워딩 확인

```powershell
# ADB 포트 포워딩 상태 확인
adb reverse --list

# 포트 포워딩 설정
adb reverse tcp:8081 tcp:8081
```

### 3. 네트워크 연결 확인

```powershell
# PC의 네트워크 IP 확인
ipconfig | findstr IPv4

# Metro 서버가 해당 IP로 접근 가능한지 확인
# 브라우저에서 http://192.168.x.x:8081 접속 시도
```

### 4. AndroidManifest.xml 확인

`android:usesCleartextTraffic="true"`가 설정되어 있는지 확인 (이미 설정됨)

## 💡 핵심

**네트워크 IP로 나와도 정상 작동해야 합니다!**

주식계산기가 네트워크 IP로 작동한다면, 현재 프로젝트도 네트워크 IP로 작동해야 합니다.

타임아웃 문제는:
- 방화벽
- ADB 포트 포워딩
- 네트워크 접근성

이 중 하나일 가능성이 높습니다.
