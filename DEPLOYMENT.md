# 배포 준비 순서

## 1. 환경변수

배포 서버에는 `.env.example`을 기준으로 아래 값을 등록합니다.

- `SESSION_SECRET`: 세션 쿠키 서명용 긴 랜덤 문자열
- `ADMIN1_PASSWORD`: 원페이 관리자 비밀번호
- `ADMIN2_PASSWORD`: 엠페이 관리자 비밀번호
- `NEXT_PUBLIC_APP_URL`: 실제 관리자 도메인 주소
- `ONEPAY_API_BASE_URL`, `ONEPAY_API_KEY`: 원페이 API 연결 정보
- `MPAY_API_BASE_URL`, `MPAY_API_KEY`: 엠페이 API 연결 정보

## 2. 배포 검증

로컬에서 아래 명령이 통과해야 배포 후보로 봅니다.

```bash
npm run lint
npm run build
```

## 3. 도메인 연결

관리자 도메인은 보통 `admin.example.com`처럼 서브도메인으로 연결합니다.
배포 플랫폼에서 안내하는 DNS 값을 도메인 구매처의 DNS 관리 화면에 등록합니다.

## 4. API 연결

API 문서를 받은 뒤에는 업체별 환경변수를 읽어서 로그인 계정에 맞는 API만 호출하도록 연결합니다.
