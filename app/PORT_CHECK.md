# 개발 빌드 포트 확인 가이드

## 문제
개발 빌드 후 앱이 타임아웃 오류가 발생하는 경우, 대부분 **포트 불일치** 문제입니다.

## 핵심 원칙
**Metro 서버 포트 = ADB 포트 포워딩**

## 빠른 확인 방법

### 1. 현재 포트 상태 확인
```powershell
npm run check:ports
```

또는 수동으로:
```powershell
# Metro 서버 포트 확인
netstat -ano | findstr ":8081 :8082"

# ADB 포트 포워딩 확인
adb reverse --list
```

### 2. 포트 불일치 시 수정

**시나리오 A: Metro가 8081, ADB가 8082인 경우**
```powershell
adb reverse --remove tcp:8082
adb reverse tcp:8081 tcp:8081
adb reverse --list  # 확인
```

**시나리오 B: Metro가 8082, ADB가 8081인 경우**
```powershell
adb reverse --remove tcp:8081
adb reverse tcp:8082 tcp:8082
adb reverse --list  # 확인
```

## 개발 빌드 전 필수 체크리스트

1. ✅ Metro 서버가 실행 중인가?
   ```powershell
   # 브라우저에서 확인
   http://localhost:8081 또는 http://localhost:8082
   ```

2. ✅ Metro 서버가 어떤 포트에서 실행 중인가?
   ```powershell
   netstat -ano | findstr ":8081 :8082" | findstr LISTENING
   ```

3. ✅ ADB 포트 포워딩이 Metro 서버 포트와 일치하는가?
   ```powershell
   adb reverse --list
   # 예: Metro가 8081이면 → tcp:8081 tcp:8081
   # 예: Metro가 8082이면 → tcp:8082 tcp:8082
   ```

4. ✅ 개발 빌드 실행 (자동 포트 설정)
   ```powershell
   npm run android
   ```
   
   또는 수동으로:
   ```powershell
   npx expo run:android
   ```

## 자동 해결 스크립트

### 개발 빌드 (포트 자동 설정) ⭐ 권장
```powershell
# Metro 서버 먼저 시작 (8081 또는 8082)
npx expo start --clear --port 8081

# 다른 터미널에서 (포트 자동 감지 및 설정)
npm run android
```

### 8081 포트 사용
```powershell
npm run fix:all
```

### 8082 포트 사용
```powershell
npm run fix:all:8082
```

## 문제 해결 순서

1. **포트 상태 확인**
   ```powershell
   npm run check:ports
   ```

2. **포트 불일치 발견 시**
   - Metro 서버 포트 확인
   - ADB 포트 포워딩을 Metro 서버 포트와 일치시킴

3. **개발 빌드 실행**
   ```powershell
   npx expo run:android
   ```

4. **여전히 타임아웃 발생 시**
   - Metro 서버 재시작
   - ADB 포트 포워딩 재설정
   - 앱 재설치

## 예시

### 올바른 설정
```
Metro 서버: 8081 포트에서 실행
ADB 포트 포워딩: tcp:8081 tcp:8081
결과: ✅ 정상 연결
```

### 잘못된 설정
```
Metro 서버: 8082 포트에서 실행
ADB 포트 포워딩: tcp:8081 tcp:8081
결과: ❌ 타임아웃 오류 (포트 불일치)
```

## 참고
- 개발 빌드 앱은 **빌드 시점에 실행 중인 Metro 서버의 포트**를 감지합니다
- Metro 서버가 8082에서 실행 중이면, 앱도 8082로 연결을 시도합니다
- 따라서 ADB 포트 포워딩도 반드시 8082로 설정해야 합니다
