# Google AdSense 설정 가이드

## 1단계: Google AdSense 가입

1. [Google AdSense](https://www.google.com/adsense/) 접속
2. Google 계정으로 로그인
3. "시작하기" 클릭
4. 웹사이트 URL 입력: `https://youtubu-down.netlify.app/`
5. 가입 신청 제출
6. 승인 대기 (보통 1-2일 소요)

## 2단계: 광고 단위 생성

1. AdSense 대시보드 접속
2. **광고** → **광고 단위** 클릭
3. **새 광고 단위** 클릭
4. 설정:
   - **이름**: "앱 설치 페이지 광고" (원하는 이름)
   - **광고 형식**: "반응형" 또는 "자동 광고" 선택
   - **광고 크기**: "반응형" 권장
5. **만들기** 클릭
6. 광고 코드 생성됨

## 3단계: AdSense ID 확인

생성된 광고 코드에서 다음 정보 확인:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXX"
     crossorigin="anonymous"></script>
```

- `ca-pub-XXXXXXXXXX` ← 이것이 **AdSense Publisher ID**

```html
<ins class="adsbygoogle"
     data-ad-client="ca-pub-XXXXXXXXXX"
     data-ad-slot="XXXXXXXXXX"
     ...
```

- `data-ad-slot="XXXXXXXXXX"` ← 이것이 **광고 슬롯 ID**

## 4단계: index.html 수정

`install-page/index.html` 파일에서 다음 부분을 수정:

### 1. 헤더 부분 (10-11줄)
```html
<!-- 변경 전 -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR_ADSENSE_ID"

<!-- 변경 후 -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-실제ID"
```

### 2. 광고 단위 부분 (290-295줄)
```html
<!-- 변경 전 -->
<ins class="adsbygoogle"
     data-ad-client="ca-pub-YOUR_ADSENSE_ID"
     data-ad-slot="YOUR_AD_SLOT_ID"

<!-- 변경 후 -->
<ins class="adsbygoogle"
     data-ad-client="ca-pub-실제ID"
     data-ad-slot="실제슬롯ID"
```

## 5단계: 배포

1. 파일 수정 후 GitHub에 푸시
2. Netlify가 자동으로 재배포
3. 몇 분 후 사이트에서 광고 확인

## 주의사항

- AdSense 승인 전까지는 광고가 표시되지 않습니다
- 승인 후에도 24-48시간 정도 걸릴 수 있습니다
- AdSense 정책을 준수해야 합니다 (클릭 유도 금지 등)

## 문제 해결

- 광고가 안 보여요: AdSense 승인 대기 중일 수 있습니다
- 에러가 나요: ID가 올바른지 확인하세요
- 수익이 없어요: 트래픽이 충분해야 수익이 발생합니다















