# 쿠팡 파트너스 다이나믹 배너 설정 가이드

## 1단계: 쿠팡 파트너스 가입

1. [쿠팡 파트너스](https://partners.coupang.com/) 접속
2. 회원가입 및 로그인
3. 파트너스 승인 대기 (보통 1-2일)

## 2단계: 다이나믹 배너 생성

1. 쿠팡 파트너스 대시보드 접속
2. **도구** → **다이나믹 배너** 메뉴 클릭
3. **배너 만들기** 클릭
4. 설정:
   - **배너 이름**: "앱 설치 페이지 배너" (원하는 이름)
   - **배너 크기**: 선택 (예: 728x90, 300x250 등)
   - **스타일**: 선택
5. **생성** 클릭
6. 배너 코드 생성됨

## 3단계: 파트너 ID 및 추적 코드 확인

생성된 배너 코드에서:
- `YOUR_COUPANG_PARTNER_ID`: 파트너 ID
- `YOUR_TRACKING_CODE`: 추적 코드

## 4단계: index.html 수정

`install-page/index.html` 파일에서 다음 부분을 수정:

```html
<!-- 변경 전 -->
<script>
    new PartnersCoupang.G({"id":YOUR_COUPANG_PARTNER_ID,"template":"banner","trackingCode":"YOUR_TRACKING_CODE"});
</script>

<!-- 변경 후 -->
<script>
    new PartnersCoupang.G({"id":실제파트너ID,"template":"banner","trackingCode":"실제추적코드"});
</script>
```

## 5단계: 배포

1. 파일 수정 후 GitHub에 푸시
2. Netlify가 자동으로 재배포
3. 몇 분 후 사이트에서 배너 확인

## 배너 위치

현재 배너는:
- 설치 방법 안내 섹션 아래
- Footer 위
- 중앙 정렬

원하는 위치로 이동 가능합니다.

## 주의사항

- 쿠팡 파트너스 정책 준수 필요
- 클릭 유도 문구 사용 금지
- 배너 크기 및 위치는 쿠팡 가이드라인 준수













