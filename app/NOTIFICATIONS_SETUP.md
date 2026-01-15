# 푸시 알림 설정 가이드

## 현재 상태

- **알림 서비스**: 구현 완료
- **관리자 서버 연동**: 준비됨 (나중에 구현)
- **토큰 등록**: 로컬 저장 완료

## 기능

1. **알림 권한 요청**: 앱 시작 시 자동 요청
2. **푸시 토큰 발급**: Expo Push Token 생성
3. **토큰 저장**: 로컬 스토리지에 저장 (관리자 서버 등록용)
4. **알림 수신**: 포그라운드/백그라운드 알림 처리

## 관리자 프로그램 연동 준비

### 1. 푸시 토큰 구조

```javascript
{
  token: "ExponentPushToken[xxxxxxxxxxxxx]",
  deviceId: "Device Model Name",
  platform: "android" | "ios",
  appVersion: "1.0.0"
}
```

### 2. 관리자 서버 API (나중에 구현)

`app/src/services/notifications.js`의 `registerTokenToServer` 함수를 구현:

```javascript
export const registerTokenToServer = async (token) => {
  const response = await axios.post(`${ADMIN_SERVER_URL}/register-token`, {
    token,
    deviceId: Device.modelName,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version,
  });
  return response.data;
};
```

### 3. 알림 전송 (관리자 프로그램에서)

관리자 프로그램에서 Expo Push API를 사용하여 알림 전송:

```bash
curl -H "Content-Type: application/json" \
     -X POST https://exp.host/--/api/v2/push/send \
     -d '{
       "to": "ExponentPushToken[xxxxxxxxxxxxx]",
       "title": "알림 제목",
       "body": "알림 내용",
       "data": { "customData": "value" }
     }'
```

## Expo Push Notification 설정

### 1. Expo 프로젝트 ID 설정

`app/app.json`에 추가:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

또는 `eas.json`에서 확인:

```bash
eas project:info
```

### 2. 푸시 토큰 가져오기

앱에서 자동으로 푸시 토큰을 가져와서 로컬에 저장합니다.

콘솔에서 확인:
```
푸시 토큰: ExponentPushToken[xxxxxxxxxxxxx]
```

## 알림 수신 처리

### 포그라운드 알림
앱이 실행 중일 때 알림 수신:

```javascript
import { setupNotificationListeners } from '../services/notifications';

setupNotificationListeners(
  (notification) => {
    // 알림 수신 시 처리
    console.log('알림 수신:', notification);
  },
  (response) => {
    // 알림 탭 시 처리
    console.log('알림 탭:', response);
  }
);
```

### 백그라운드 알림
앱이 백그라운드일 때도 알림 수신 가능 (자동 처리)

## 테스트

### 1. 로컬 알림 테스트

```javascript
import { sendLocalNotification } from '../services/notifications';

await sendLocalNotification('테스트', '알림 테스트입니다.');
```

### 2. 푸시 알림 테스트

Expo Push Notification Tool 사용:
https://expo.dev/notifications

또는 관리자 프로그램에서 전송

## 주의사항

1. **권한**: 사용자가 알림 권한을 거부하면 알림을 받을 수 없음
2. **Expo Go**: Expo Go에서는 푸시 알림 제한적
3. **EAS Build**: 실제 푸시 알림은 EAS Build 필요
4. **프로젝트 ID**: Expo 프로젝트 ID 설정 필요

## 다음 단계

1. Expo 프로젝트 ID 설정
2. 관리자 서버 API 구현
3. 관리자 프로그램에서 알림 전송 기능 구현
4. 실제 기기에서 테스트













