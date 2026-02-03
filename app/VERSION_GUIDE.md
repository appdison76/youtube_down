# 버전 관리 가이드

---

## ⚠️ 중요 - 절대 변경 금지 (관리 메모)

- **version.json 위치**: **repo 루트의 `install-page/version.json` 한 곳만** 사용한다.
- **App.js의 VERSION_URL**: `https://appdison76.github.io/youtube_down/install-page/version.json` 으로 고정. **`web-app/install-page/` 로 바꾸지 말 것.**
- **version.json 파일을 두 개 두지 말 것.** `web-app/install-page/version.json` 은 사용하지 않음. 수정할 파일은 `install-page/version.json` 하나만.
- 구버전 앱(1.2.0 이전)과 현재 앱 모두 **같은 경로**(install-page/version.json)를 본다. 여기만 수정하면 됨.

---

## 개요

앱 실행 시 자동으로 버전을 체크하고, 낮은 버전이면 설치 페이지로 리다이렉트하는 기능입니다.

## 작동 방식

1. **앱 시작 시**: `App.js`에서 `checkVersionOnStart()` 호출
2. **버전 정보 가져오기**: `install-page/version.json`에서 최신 버전 정보 조회
3. **버전 비교**: 현재 앱 버전과 최신 버전 비교
4. **강제 업데이트**: `forceUpdate: true`이면 설치 페이지로 자동 리다이렉트
5. **선택적 업데이트**: `forceUpdate: false`이면 사용자에게 선택권 제공

## version.json 설정

`install-page/version.json` 파일을 수정하여 버전 관리:

```json
{
  "version": "1.0.1",
  "forceUpdate": true,
  "message": "새로운 버전이 있습니다. 업데이트가 필요합니다.",
  "updateUrl": "https://youtube-down.netlify.app/"
}
```

### 필드 설명

- **version**: 최신 앱 버전 (예: "1.0.1")
- **forceUpdate**: `true`면 강제 업데이트, `false`면 선택적 업데이트
- **message**: 업데이트 알림 메시지
- **updateUrl**: 설치 페이지 URL

## 버전 업데이트 절차

### 1. 앱 버전 업데이트

`app/app.json`에서 버전 변경:
```json
{
  "expo": {
    "version": "1.0.1"  // 버전 업데이트
  }
}
```

`app/package.json`에서도 버전 변경:
```json
{
  "version": "1.0.1"  // 버전 업데이트
}
```

### 2. version.json 업데이트

`install-page/version.json`에서 최신 버전으로 업데이트:
```json
{
  "version": "1.0.1",
  "forceUpdate": true  // 강제 업데이트 여부
}
```

### 3. Netlify에 배포

```bash
cd install-page
git add version.json
git commit -m "Update version to 1.0.1"
git push
```

Netlify가 자동으로 재배포합니다.

### 4. 새 APK 빌드 및 배포

```bash
cd app
eas build --profile production --platform android
```

빌드 완료 후 APK를 설치 페이지에 업로드하고 링크 업데이트.

## 강제 업데이트 vs 선택적 업데이트

### 강제 업데이트 (forceUpdate: true)
- 앱 실행 시 즉시 설치 페이지로 리다이렉트
- 취소 불가
- 보안 업데이트나 필수 기능 변경 시 사용

### 선택적 업데이트 (forceUpdate: false)
- 사용자에게 업데이트 여부 선택권 제공
- "나중에" 선택 가능
- 일반적인 기능 개선 시 사용

## 테스트 방법

### 1. 로컬 테스트

`install-page/version.json`에서 버전을 높게 설정:
```json
{
  "version": "2.0.0",
  "forceUpdate": true
}
```

앱 실행 시 설치 페이지로 리다이렉트되는지 확인.

### 2. 실제 테스트

1. 현재 앱 버전: 1.0.0
2. `version.json`에서 버전: 1.0.1, `forceUpdate: true`
3. Netlify에 배포
4. 앱 실행 → 설치 페이지로 리다이렉트 확인

## 주의사항

1. **버전 형식**: "1.0.0" 형식 사용 (세미버전)
2. **Netlify 배포**: `version.json` 변경 후 Netlify 재배포 필요
3. **APK 링크**: 새 버전 APK를 설치 페이지에 업로드하고 링크 업데이트
4. **강제 업데이트**: 사용자 경험을 고려하여 신중하게 사용

## 문제 해결

### 버전 체크가 작동하지 않을 때

1. `version.json`이 Netlify에 배포되었는지 확인
2. URL이 올바른지 확인 (`https://youtube-down.netlify.app/version.json`)
3. 네트워크 연결 확인
4. 콘솔 로그 확인

### 강제 업데이트가 너무 자주 발생할 때

- `forceUpdate: false`로 변경하여 선택적 업데이트로 전환
- 또는 버전 업데이트 주기를 조정













