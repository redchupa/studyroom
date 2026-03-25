# 제일풍경채더숲 독서실 출입 명부 시스템

아파트 독서실 1회 입장권 이용자를 위한 온라인 출입 명부 웹 서비스입니다.  
Netlify + GitHub API 기반으로 DB 없이 운영되며, 완전 무료입니다.

---

## 시스템 구조

```
브라우저 (index.html / admin.html)
    ↓ API 요청 (토큰 없음)
Netlify Functions (netlify/functions/api.js)   ← 토큰은 환경변수에만 존재
    ↓ GitHub API 호출
GitHub Repository (JSON 파일 = 데이터 저장소)
```

---

## 파일 구성

```
studyroom/
├── index.html                  # 이용자 출입 명부 페이지
├── admin.html                  # 관리자 페이지 (코드 발급, 강제 퇴실)
├── rules.html                  # 독서실 이용수칙 페이지
├── netlify.toml                # Netlify 빌드 설정
├── seats.json                  # 좌석 현황 데이터 (자정 자동 초기화)
├── codes.json                  # 미사용 입장 코드 목록
├── attempts.json               # 관리자 로그인 실패 기록 (브루트포스 방어)
└── netlify/
    └── functions/
        └── api.js              # 서버리스 함수 (GitHub API 프록시)
```

---

## 데이터 파일 구조

**seats.json**
```json
{
  "date": "2025-01-01",
  "seats": [
    { "name": "홍길동", "time": "09:30", "exitCode": "7429" }
  ]
}
```

**codes.json**
```json
{
  "codes": [
    { "code": "A3F7", "memo": "101-1001", "created": "2025-01-01 09:00" }
  ]
}
```

**attempts.json**
```json
{
  "IP주소": { "count": 0, "lockedUntil": null }
}
```

---

## Netlify 환경변수

Netlify 대시보드 → Site → Environment variables 에서 설정  
(`.env` 파일 import 기능 사용 가능)

| 변수명 | 설명 | 예시 |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxx...` |
| `GITHUB_REPO` | 저장소 경로 | `redchupa/studyroom` |
| `ADMIN_PASSWORD` | 관리자 페이지 비밀번호 | - |

> 환경변수 변경 후에는 **Deploys → Retry deploy** 로 재배포 필요

---

## API 액션 목록

| action | 인증 | 설명 |
|---|---|---|
| `getSeats` | 없음 | 좌석 현황 조회 (exitCode 미포함) |
| `register` | 입장코드 | 명부 등록 + 퇴실코드 발급 |
| `deleteEntry` | 퇴실코드 | 본인 퇴실 처리 |
| `adminLogin` | 비밀번호 | 관리자 로그인 (브루트포스 방어) |
| `getCodes` | 관리자 | 미사용 코드 목록 조회 |
| `createCode` | 관리자 | 입장 코드 생성 |
| `deleteCode` | 관리자 | 코드 수동 삭제 |
| `resetSeats` | 관리자 | 좌석 전체 초기화 |
| `adminDeleteEntry` | 관리자 | 강제 퇴실 (퇴실코드 없이) |

---

## 보안 구조

- **GitHub 토큰** — Netlify 환경변수에만 존재, HTML 소스에 미노출
- **입장 코드** — 영대문자+숫자 4자리, 1회 사용 후 자동 삭제
- **퇴실 코드** — 숫자 4자리, 등록 시 1회만 표시, GitHub에만 저장
- **브루트포스 방어** — 입장코드/퇴실코드/관리자 로그인 모두 5회 실패 시 1분 잠금
- **개인정보** — 동호수 미수집, 이름만 표시

---

## 운영 규칙

- 1회 입장권 하루 최대 **5명** 제한
- 입장 코드는 관리자가 **1회 입장권 제출 시** 발급
- 명부는 매일 **자정(KST 00:00)** 자동 초기화
- 퇴실 시 이용자가 **직접 명부 삭제** (퇴실코드 필요)
- 운영 시간: **06:00 ~ 00:00**

---

## 다음 개발 시 참고사항

- 좌석 수 변경: `api.js` 의 `>= 5` 부분과 `index.html` 의 `>= 5`, `/ 5` 를 수정
- 잠금 시간 변경: `api.js` 의 `LOCK_MS`, `index.html` 의 `EXIT_LOCK_MS` / `REG_LOCK_MS`
- 최대 실패 횟수 변경: `api.js` 의 `MAX_ATTEMPTS`, `index.html` 의 `EXIT_MAX_FAIL` / `REG_MAX_FAIL`
- 운영 시간 변경: 현재 클라이언트 자정 체크만 존재, 별도 서버 로직 없음
- 이용수칙 수정: `rules.html` 만 수정하면 됨 (다른 파일 불필요)

---

## 배포 URL

- 이용자 명부: `https://jeil-studyroom.netlify.app/`
- 관리자 페이지: `https://jeil-studyroom.netlify.app/admin.html`
- 이용수칙: `https://jeil-studyroom.netlify.app/rules.html`

---

## 개발 이력

| 날짜 | 내용 |
|---|---|
| 2025-03 | 최초 개발 (Netlify Functions + GitHub API) |
| 2025-03 | 퇴실코드 방식 도입, 동호수 미수집으로 개인정보 보호 강화 |
| 2025-03 | 입장코드·퇴실코드·관리자 로그인 브루트포스 방어 추가 |
| 2025-03 | 이용수칙 페이지 분리 (rules.html) |
