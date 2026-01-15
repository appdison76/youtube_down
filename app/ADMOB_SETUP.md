# AdMob 설정 가이드

## 현재 상태

- **테스트 모드**: 활성화됨 (개발 중)
- **테스트 광고 ID**: 사용 중
- **실제 광고 ID**: 배포 시 교체 필요

## 테스트 광고 ID (현재 사용 중)

### Android
- **배너**: `ca-app-pub-3940256099942544/6300978111`
- **전면**: `ca-app-pub-3940256099942544/1033173712`
- **보상형**: `ca-app-pub-3940256099942544/5224354917`

### iOS
- **배너**: `ca-app-pub-3940256099942544/2934735716`
- **전면**: `ca-app-pub-3940256099942544/4411468910`
- **보상형**: `ca-app-pub-3940256099942544/1712485313`

## 실제 배포 시 설정

### 1. AdMob 계정 생성 및 앱 등록

1. [Google AdMob](https://admob.google.com/) 접속
2. 계정 생성 및 로그인
3. 앱 추가:
   - Android: 패키지 이름 `com.youtubedownloader.app`
   - iOS: Bundle ID `com.youtubedownloader.app`
4. 광고 단위 생성:
   - 배너 광고
   - 전면 광고 (선택)
   - 보상형 광고 (선택)

### 2. 광고 단위 ID 교체

`app/src/services/admob.js` 파일에서 실제 광고 단위 ID로 교체:

```javascript
export const AD_UNIT_IDS = {
  BANNER: 'ca-app-pub-실제ID/실제단위ID',
  INTERSTITIAL: 'ca-app-pub-실제ID/실제단위ID',
  REWARDED: 'ca-app-pub-실제ID/실제단위ID',
};
```

### 3. 앱 ID 설정

`app/app.json`에 AdMob 앱 ID 추가:

```json
{
  "expo": {
    "android": {
      "config": {
        "googleMobileAdsAppId": "ca-app-pub-실제ID~앱ID"
      }
    },
    "ios": {
      "config": {
        "googleMobileAdsAppId": "ca-app-pub-실제ID~앱ID"
      }
    }
  }
}
```

### 4. google-services.json 추가 (Android)

1. Firebase Console에서 `google-services.json` 다운로드
2. `app/` 폴더에 저장
3. `app.json`에서 경로 확인

## 광고 표시 위치

현재 광고는 다음 위치에 표시됩니다:

1. **검색 화면**: 검색 결과 하단
2. **찜하기 화면**: 찜한 영상 목록 하단

## 추가 광고 타입

### 전면 광고 (Interstitial)
다운로드 완료 후 또는 특정 액션 후 표시:

```javascript
import { showInterstitialAd } from '../services/admob';

// 사용 예시
await showInterstitialAd();
```

### 보상형 광고 (Rewarded)
특정 기능 사용 시 표시:

```javascript
import { showRewardedAd } from '../services/admob';

// 사용 예시
await showRewardedAd((reward) => {
  console.log('보상 획득:', reward);
});
```

## 주의사항

1. **테스트 모드**: 개발 중에는 반드시 테스트 ID 사용
2. **정책 준수**: AdMob 정책을 준수해야 함
3. **사용자 경험**: 광고가 앱 사용을 방해하지 않도록 배치
4. **EAS Build**: 네이티브 모듈이므로 EAS Build 필요

## 문제 해결

### 광고가 표시되지 않을 때

1. AdMob 계정 상태 확인
2. 광고 단위 ID 확인
3. 네트워크 연결 확인
4. EAS Build로 네이티브 빌드 확인

### 테스트 광고가 표시되지 않을 때

- `__DEV__` 모드 확인
- `TestIds.BANNER` 사용 확인
- 콘솔 로그 확인













