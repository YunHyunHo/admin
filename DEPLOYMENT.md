# 배포 준비 순서

## 1. 환경변수

배포 서버에는 `.env.example`을 기준으로 아래 값을 등록합니다.

- `SESSION_SECRET`: 세션 쿠키 서명용 긴 랜덤 문자열
- `MASTER_PASSWORD`: 마스터 관리자 비밀번호
- `DATABASE_URL`: Neon 또는 PostgreSQL 연결 문자열
- `DATABASE_SSL`: Neon은 `true`, 로컬 PostgreSQL은 필요 시 `false`
- `NEXT_PUBLIC_APP_URL`: 실제 관리자 도메인 주소

운영 배포 전에는 개발 중 사용한 Neon 비밀번호와 `MASTER_PASSWORD`를 교체합니다.

## 2. 배포 검증

로컬에서 아래 명령이 통과해야 배포 후보로 봅니다.

```bash
npm run ops:check
npm run lint
npm run build
```

검증 과정에서 만든 `smoke-...` 테스트 데이터는 아래 명령으로 정리할 수 있습니다.

```bash
npm run db:clean-smoke
```

## 3. 운영 전 직접 해야 할 일

- Neon 콘솔에서 DB 비밀번호를 새 값으로 회전합니다.
- 새 Neon 연결 문자열을 배포 환경의 `DATABASE_URL`에 등록합니다.
- `SESSION_SECRET`은 32자 이상 랜덤 문자열로 새로 생성해 등록합니다.
- `MASTER_PASSWORD`는 `0000`이 아닌 강한 비밀번호로 바꾼 뒤 `npm run db:init`을 한 번 실행합니다.
- 관리자 접속 주소가 정해지면 `NEXT_PUBLIC_APP_URL`을 실제 주소로 바꿉니다.
- 검증용 데이터가 필요 없으면 `npm run db:clean-smoke`로 삭제합니다.

## 4. 도메인 연결

관리자 도메인은 보통 `admin.example.com`처럼 서브도메인으로 연결합니다.
배포 플랫폼에서 안내하는 DNS 값을 도메인 구매처의 DNS 관리 화면에 등록합니다.

## 5. API 연결

API 문서를 받은 뒤에는 업체별 환경변수를 읽어서 로그인 계정에 맞는 API만 호출하도록 연결합니다.
