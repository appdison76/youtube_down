# Google Drive 공유 설정 확인 가이드

## ✅ 올바른 설정 방법

### 1단계: Google Drive에서 파일 확인

1. 제공하신 링크로 접속:
   ```
   https://drive.google.com/file/d/1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc/view
   ```

2. 파일이 보이는지 확인 (로그인 필요 시 로그인)

### 2단계: 공유 설정 확인 및 변경

1. **파일 우클릭** → **"공유"** 또는 **"Share"** 클릭

2. 공유 설정 창에서:

   **"일반 액세스" 또는 "General access" 섹션:**
   - ✅ **"링크가 있는 모든 사용자"** 또는 **"Anyone with the link"** 선택
   - ✅ 권한: **"뷰어"** 또는 **"Viewer"** 선택
   
   **중요:**
   - ❌ "제한됨" 또는 "Restricted" 선택하면 안됨
   - ❌ "편집자" 또는 "Editor" 권한은 필요 없음 (보안상 위험)
   - ✅ **"뷰어"만으로도 다운로드 가능함**

3. **"완료"** 또는 **"Done"** 클릭

### 3단계: 공유 링크 확인

공유 설정 후 표시되는 링크 형식:
```
https://drive.google.com/file/d/1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc/view?usp=sharing
```

이 링크가 정상적으로 보이면 설정이 올바른 것입니다.

---

## 🧪 테스트 방법

### 방법 1: 시크릿 모드에서 테스트

1. 시크릿 모드(Incognito) 브라우저 창 열기
2. 다음 링크로 접속:
   ```
   https://drive.google.com/uc?export=download&id=1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc&confirm=t
   ```
3. APK 파일이 다운로드되면 ✅ 성공
4. 로그인 페이지가 나오거나 접근 거부되면 ❌ 공유 설정 문제

### 방법 2: 웹 페이지에서 테스트

1. `install-page/index.html` 파일을 브라우저에서 열기
2. "앱 다운로드" 버튼 클릭
3. APK 파일이 다운로드되면 ✅ 성공
4. 오류가 발생하면 아래 문제 해결 참고

---

## ⚠️ 문제 해결

### 문제 1: "액세스 권한이 없습니다" 오류

**원인:** 파일 공유 설정이 "제한됨"으로 되어 있음

**해결:**
1. Google Drive에서 파일 우클릭
2. "공유" 클릭
3. "링크가 있는 모든 사용자"로 변경
4. 권한: "뷰어" 선택
5. 저장

### 문제 2: 로그인 페이지가 나옴

**원인:** 공유 설정이 아직 적용되지 않았거나 잘못 설정됨

**해결:**
1. 파일 공유 설정 다시 확인
2. "링크가 있는 모든 사용자"로 설정 확인
3. 몇 분 기다린 후 다시 시도 (설정 반영 시간 필요)

### 문제 3: "바이러스 스캔 경고" 페이지가 나옴

**원인:** 큰 파일(100MB 이상) 다운로드 시 Google의 보안 검사

**해결:**
- URL에 `&confirm=t` 파라미터가 있으면 자동으로 건너뜀
- 만약 여전히 나온다면, 경고 페이지에서 "다운로드" 클릭

### 문제 4: 파일이 다운로드되지 않고 Google Drive 페이지로 이동

**원인:** 직접 다운로드 URL 형식이 올바르지 않음

**해결:**
- 현재 설정된 URL 확인:
  ```
  https://drive.google.com/uc?export=download&id=1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc&confirm=t
  ```
- 파일 ID가 정확한지 확인: `1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc`

---

## 📝 현재 설정 상태

### 파일 ID
```
1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc
```

### 직접 다운로드 URL (현재 index.html에 설정됨)
```
https://drive.google.com/uc?export=download&id=1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc&confirm=t
```

### 공유 링크 (확인용)
```
https://drive.google.com/file/d/1b7NPh_HjyJb9Ihy5V3LRrus7MaEMNuJc/view?usp=sharing
```

---

## ✅ 체크리스트

다음 항목을 모두 확인하세요:

- [ ] Google Drive에서 파일이 보임
- [ ] 파일 공유 설정: "링크가 있는 모든 사용자"
- [ ] 파일 권한: "뷰어"
- [ ] 시크릿 모드에서도 접근 가능 (로그인 없이)
- [ ] 직접 다운로드 URL 테스트 성공
- [ ] index.html에서 다운로드 버튼 작동 확인

---

## 🔄 업데이트 시 주의사항

나중에 APK 파일을 업데이트할 때:

1. **같은 파일 ID 사용 (덮어쓰기):**
   - Google Drive에서 기존 파일 삭제 후 새 파일 업로드 → **새 파일 ID 생성됨 ❌**
   - 대신: 기존 파일을 **덮어쓰기** (같은 이름으로 업로드 시 "대체" 선택)
   - 또는: 기존 파일 삭제 후 같은 위치에 같은 이름으로 업로드하면 파일 ID는 변경됨

2. **새 파일 ID로 업데이트:**
   - 새 파일 ID가 생성되면 `index.html`의 URL도 업데이트 필요
   - 파일 ID만 변경하면 됨

3. **권장 방법:**
   - 파일 이름에 버전 번호 포함: `app-v1.0.1.apk`, `app-v1.0.2.apk`
   - 각 버전마다 새 파일로 업로드
   - `index.html`에서 최신 버전 URL로 업데이트

---

## 💡 추가 팁

### 파일 이름 변경
- Google Drive에서 파일 이름을 변경해도 파일 ID는 변하지 않음
- 따라서 URL은 그대로 사용 가능

### 폴더에 있을 경우
- 파일이 폴더 안에 있어도 파일 ID만 있으면 직접 접근 가능
- 폴더 공유 설정과는 무관

### 대용량 파일 다운로드
- 100MB 이상 파일: `&confirm=t` 파라미터 필수
- 500MB 이상: Google Drive의 다운로드 제한이 있을 수 있음
- 현재 APK 크기: 약 113MB → 문제 없음 ✅










