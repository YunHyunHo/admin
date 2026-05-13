# Admin Backend/API 설계 문서

이 문서는 현재 관리자 페이지를 실제 운영 가능한 백엔드로 전환하기 위한 기준입니다. 상대방이 제공한 Mancoin API 문서는 입금 거래 생성과 연결 계좌 조회만 포함하므로, 관리자에서 필요한 계정, 권한, 충전/환전 승인, 수수료, 정산, 감사 로그는 우리 백엔드에서 직접 구현합니다.

## 1. 전제

- 프론트와 서버는 Next.js 프로젝트 안에서 함께 운영합니다.
- 운영 데이터는 쿠키가 아니라 DB에 저장합니다.
- DB는 PostgreSQL 계열을 기준으로 합니다.
- 현재 외부 연동 API는 Mancoin의 `makeTransaction`, `getConnectedAccount` 두 개만 확인되었습니다.
- `원페이`, `엠페이` 같은 업체명은 조직관리 기준으로 사용하지 않습니다.
- 조직관리에서 상위총판은 별도 계정/엔티티가 아니라 `master` 계정입니다.
- 조직관리에서 총판은 `master`가 생성한 하부계정입니다.
- 금액은 정수 원화 기준으로 저장합니다.
- 관리자 승인/거절은 우리 관리자 안에서만 기록합니다.
- 승인/거절 결과를 업체 사이트나 Mancoin으로 콜백하지 않습니다.
- 업체 사이트의 유저 잔액, 코인, 주문 상태는 우리 관리자 승인/거절로 변경하지 않습니다.

## 2. 시스템 구성

```text
관리자 브라우저
  -> Next.js Admin App
  -> Admin Backend API
  -> PostgreSQL DB
  -> Mancoin 외부 API
```

역할 분리:

| 영역 | 담당 |
| --- | --- |
| 관리자 로그인/세션 | 우리 백엔드 |
| 관리자/하부계정 생성, 중지, 삭제 | 우리 백엔드 |
| 총판/상위총판/도메인/계좌 관리 | 우리 백엔드. 상위총판은 `master`, 총판은 하부계정 |
| 충전신청 저장, 조회, 승인, 거절 | 우리 백엔드 |
| 환전신청 저장, 조회, 승인, 거절 | 우리 백엔드 |
| 수수료율 저장, 스냅샷 생성 | 우리 백엔드 |
| 정산 집계 | 우리 백엔드 |
| 승인/거절 기록 보관 | 우리 백엔드 |
| 입금 거래 생성 | Mancoin `makeTransaction` 호출 |
| 도메인 연결 계좌 조회 | Mancoin `getConnectedAccount` 호출 |

운영 성격:

- 이 시스템은 외부 업체 사이트를 제어하는 처리 서버가 아니라 관리자 내부의 접수/입금확인/기록 시스템입니다.
- API 연동 업체는 충전신청 내역을 우리 백엔드로 전달합니다.
- API 미연동 흐름은 관리자가 수동으로 충전신청을 등록합니다.
- 관리자가 승인/거절하면 우리 DB에만 상태와 감사 로그가 남습니다.
- 외부 업체 사이트로 승인 결과를 되돌려 보내는 콜백은 구현하지 않습니다.

## 3. 권한 모델

| 권한 | 설명 | 가능 작업 |
| --- | --- | --- |
| `MASTER` | 최상위 관리자 | 전체 조회, 하부계정 생성/중지/삭제, 설정 변경, 승인/거절 |
| `ADMIN` | 운영 관리자 또는 총판 계정 | 충전/환전 처리, 정산 조회 |
| `VIEWER` | 조회 전용 | 조회만 가능 |
| `DOMAIN_ADMIN` | 특정 도메인 관리자 | 연결된 도메인 범위만 조회/처리 |

기본 원칙:

- 모든 API는 세션을 확인합니다.
- 수정성 API는 `MASTER` 또는 허용된 role만 실행할 수 있습니다.
- `MASTER` 계정은 삭제/중지할 수 없습니다.
- 사용중지된 계정은 로그인할 수 없습니다.
- 계정 권한은 프론트 숨김이 아니라 서버에서 검사합니다.

## 4. 핵심 DB 테이블

최소 운영에 필요한 테이블은 아래와 같습니다. 자세한 SQL 초안은 `docs/database-schema.sql`을 기준으로 확장합니다.

| 테이블 | 목적 |
| --- | --- |
| `admins` | 관리자 계정 |
| `companies` | 외부 API/도메인 묶음이 필요할 때만 쓰는 선택적 범위 |
| `distributors` | 총판 정산/보유금 원장이 필요할 때 하부계정과 연결되는 확장 테이블 |
| `domains` | 도메인 |
| `admin_domain_mappings` | 도메인별 관리자 접근 범위 |
| `bank_accounts` | 연결 계좌 |
| `charge_requests` | 충전신청 |
| `exchange_requests` | 환전신청 |
| `fee_rates` | 현재/미래 수수료율 |
| `commission_records` | 승인 충전 건별 수수료 원장 |
| `domain_settlements` | 도메인 정산 스냅샷 |
| `distributor_settlements` | 총판 정산 스냅샷 |
| `distributor_withdrawals` | 총판 환전 신청 |
| `distributor_balance_transactions` | 총판 보유금 원장 |
| `admin_audit_logs` | 관리자 행동 로그 |

## 5. 공통 API 규칙

### 대시보드 요약

현재 구현의 `/api/dashboard-summary`는 DB 연결 환경에서 `charge_requests` 상태별 건수/금액과 `commission_records` 수수료 합계를 기준으로 운영 요약을 반환합니다.

### 응답 형식

```json
{
  "ok": true,
  "data": {},
  "message": "처리되었습니다."
}
```

실패:

```json
{
  "ok": false,
  "message": "권한이 없습니다.",
  "code": "FORBIDDEN"
}
```

### 상태 코드

| HTTP | 의미 |
| --- | --- |
| `200` | 조회/수정 성공 |
| `201` | 생성 성공 |
| `400` | 잘못된 요청 |
| `401` | 로그인 필요 |
| `403` | 권한 없음 |
| `404` | 리소스 없음 |
| `409` | 중복 또는 상태 충돌 |
| `500` | 서버 오류 |

## 6. 인증 API

### POST `/api/auth/login`

관리자 로그인.

요청:

```json
{
  "loginId": "master",
  "password": "0000"
}
```

처리:

- `admins.login_id` 조회
- 비밀번호 해시 검증
- `status = ACTIVE` 확인
- 세션 쿠키 발급
- `last_login_at` 갱신

### POST `/api/auth/logout`

세션 쿠키 삭제.

### GET `/api/auth/session`

현재 로그인 사용자 반환.

## 7. 관리자 계정 API

### GET `/api/admins`

관리자 계정 목록 조회.

필터:

- `query`
- `role`
- `status`

### POST `/api/admins`

하부계정 생성. `MASTER`만 가능.

요청:

```json
{
  "loginId": "subadmin01",
  "password": "abc123",
  "nickname": "총판01",
  "role": "ADMIN"
}
```

주의:

- `MASTER` 계정은 생성할 수 없습니다.
- 비밀번호는 DB에 평문 저장하지 않고 해시로 저장합니다.
- 계정 생성 이력은 `admin_audit_logs`에 남깁니다.

### PATCH `/api/admins/:id/status`

사용/중지 전환.

요청:

```json
{
  "status": "SUSPENDED"
}
```

### DELETE `/api/admins/:id`

계정 삭제. 실제 삭제보다 `status = DELETED` 소프트 삭제를 권장합니다.

## 8. 조직 API

### GET `/api/distributors`

상위총판/총판 목록 조회.

현재 조직관리 화면의 기준:

- 상위총판 목록에는 `master` 계정만 표시합니다.
- 총판 목록에는 `master`가 생성한 하부계정을 표시합니다.
- 상위총판을 별도로 생성하는 기능은 제공하지 않습니다.
- 총판은 `/api/admins` 하부계정 생성으로 만들어집니다.

필드:

- `id`
- `name`
- `level`: `TOP_DISTRIBUTOR` 또는 `DISTRIBUTOR`
- `parentDistributorId`: 현재는 `master` 기준으로 고정
- `currentBalance`
- `status`
- `createdAt`

### POST `/api/distributors`

현재는 별도 구현하지 않습니다. 총판 생성은 하부계정 생성 API인 `POST /api/admins`로 처리합니다.

현재 정책:

- 상위총판은 별도 생성하지 않습니다.
- `MASTER`를 상위총판 성격으로 표시합니다.
- 하부계정은 총판 목록에 표시합니다.

## 9. 도메인/계좌 API

### GET `/api/domains`

도메인 목록 조회.

### POST `/api/domains`

도메인 등록.

요청:

```json
{
  "domainName": "onepay.example.com",
  "companyId": "company_uuid",
  "distributorId": "distributor_uuid"
}
```

### GET `/api/domains/:id/connected-account`

Mancoin `getConnectedAccount`를 호출하거나, DB에 캐시된 계좌 정보를 반환합니다.

외부 호출 요청:

```json
{
  "domainUrl": "https://example.com"
}
```

외부 응답 매핑:

| Mancoin 필드 | 내부 필드 |
| --- | --- |
| `bank_name` | `bankName` |
| `bank_holder` | `accountHolder` |
| `bank_account` | `accountNumber` |

## 10. 충전신청 API

### POST `/api/charge-requests`

충전신청 생성. API 연동 업체 또는 관리자 수동 입력을 통해 들어온 신청 내역을 내부 DB에 저장합니다. Mancoin `makeTransaction`은 입금 거래 생성이 필요한 경우에만 호출합니다.

요청:

```json
{
  "action": "create",
  "userId": "user123",
  "amount": 100000,
  "depositor": "홍길동",
  "bankName": "국민은행",
  "accountNumber": "123-456",
  "domainName": "전체"
}
```

외부 Mancoin 입금 거래 생성이 필요한 경우의 원본 요청 기준:

```json
{
  "userUid": "user123",
  "domainUrl": "https://example.com",
  "coinCount": 10,
  "depositor": "홍길동"
}
```

Mancoin 요청 매핑:

| 내부 필드 | Mancoin 필드 |
| --- | --- |
| `userUid` | `id` |
| `domainUrl` | `domainUrl` |
| `coinCount` | `coinCount` |
| `depositor` | `bankHolderName` |

저장 필드:

- `external_id`
- `company_id`
- `domain_id`
- `user_uid`
- `bank_name`
- `account_number`
- `depositor`
- `amount`
- `status = PENDING`
- `raw_payload`

### POST `/api/integration/charge-requests`

외부 사이트 연동 테스트 및 실제 도메인 연동 충전신청 접수용 공개 API입니다. 관리자 세션 없이 호출하며, `domainId` 또는 `domainName`으로 연결 도메인과 하부계정을 찾은 뒤 `charge_requests`에 `PENDING`으로 저장합니다.
도메인이 아직 연결되지 않은 테스트 단계에서는 `distributorId`로 하부계정을 직접 지정할 수 있습니다.

요청:

```json
{
  "externalId": "ORDER-TEST-001",
  "domainId": "00000000-0000-0000-0000-000000000000",
  "distributorId": null,
  "depositorName": "홍길동",
  "amount": 100000,
  "bankName": "국민은행",
  "accountNumber": "123-456"
}
```

응답:

```json
{
  "ok": true,
  "requestId": "charge-request-id",
  "status": "PENDING",
  "message": "충전신청이 관리자에 전송되었습니다."
}
```

테스트 페이지:

```text
/client/api-test
```

주의:

- 이 API는 신청 내역 접수용입니다.
- 관리자 승인/거절은 우리 DB 상태와 기록만 변경합니다.
- 업체 사이트의 유저 잔액이나 상태를 변경하지 않습니다.

### GET `/api/charge-requests`

충전신청 목록 조회.

필터:

- `status`
- `startDate`
- `endDate`
- `domainId`
- `userUid`
- `depositor`

### PATCH `/api/charge-requests/:id/approve`

충전 승인.

의미:

- 실제 입금이 확인되었음을 우리 관리자에 기록합니다.
- 외부 업체 사이트나 Mancoin에 승인 결과를 콜백하지 않습니다.
- 업체 사이트의 유저 잔액, 코인, 주문 상태는 변경하지 않습니다.

처리 순서:

1. 세션/권한 확인
2. 요청 상태가 `PENDING`인지 확인
3. DB 트랜잭션 시작
4. `charge_requests.status = APPROVED`
5. 현재 수수료율 스냅샷 조회
6. `commission_records` 생성
7. 총판 보유금 증가가 필요하면 원장 기록
8. `admin_audit_logs` 기록
9. 트랜잭션 커밋

중복 승인 방지:

- `charge_requests.status = PENDING` 조건으로 업데이트합니다.
- `commission_records.charge_request_id`에 unique 제약을 둡니다.
- 현재 구현에서는 기존 화면 호환을 위해 `POST /api/charge-requests`에 `id`, `status: "승인"`을 보내면 동일한 승인 트랜잭션을 실행합니다.

### PATCH `/api/charge-requests/:id/reject`

충전 거절.

의미:

- 입금자명 불일치, 미입금, 금액 불일치 등의 사유를 우리 관리자에 기록합니다.
- 외부 업체 사이트나 Mancoin에 거절 결과를 콜백하지 않습니다.

요청:

```json
{
  "reason": "입금자명 불일치"
}
```

## 11. 환전신청 API

### POST `/api/exchange-requests`

환전신청 생성.

### GET `/api/exchange-requests`

환전신청 목록 조회.

### PATCH `/api/exchange-requests/:id/approve`

환전 승인.

### PATCH `/api/exchange-requests/:id/reject`

환전 거절.

환전 정책은 아직 외부 문서가 없으므로, 실제 구현 전 아래가 필요합니다.

- 환전 신청이 어디서 발생하는지
- 환전 완료 상태가 따로 필요한지
- 환전도 관리자 내부 기록만 남기면 되는지

## 12. 수수료 API

### GET `/api/settings/fee-rate`

현재 수수료율 조회. DB 연결 환경에서는 `fee_rates`의 현재 활성 레코드를 반환합니다.

### POST `/api/settings/fee-rate`

수수료율 저장. `MASTER`만 가능합니다.

DB 연결 환경에서는 기존 활성 `fee_rates` 레코드의 `ends_at`을 닫고 새 레코드를 생성합니다.

요청:

```json
{
  "companyId": "company_uuid",
  "domainId": null,
  "distributorId": null,
  "companyRate": 0.4,
  "distributorRate": 0.1
}
```

원칙:

- 수수료율 변경은 이후 승인되는 충전 건부터 적용합니다.
- 이미 승인된 과거 건은 `commission_records`의 스냅샷을 기준으로 유지합니다.

## 13. 정산 API

### GET `/api/settlements/domain`

도메인 정산 조회.

현재 구현의 `/api/domain-settlement`은 승인 시 생성된 `commission_records`와 연결된 `charge_requests`, `domains`를 기준으로 충전액, 수수료, 도메인 정산액을 날짜별 집계합니다.

필터:

- `startDate`
- `endDate`
- `domainId`

### GET `/api/settlements/distributor`

총판 정산 조회.

현재 구현의 `/api/settlement-profit`은 `commission_records`를 날짜별로 집계해서 본사/총판 수익 화면에 제공합니다.

### POST `/api/settlements/snapshot`

정산 스냅샷 생성. 운영 초기에는 실시간 집계로 시작하고, 데이터가 늘면 스냅샷 방식으로 전환합니다.

## 14. 총판 환전 API

### GET `/api/distributor-withdrawals`

총판 환전내역 조회.

현재 구현은 하부계정 생성 시 `distributors` 레코드를 연결하고, 충전 승인 수수료 중 총판 몫이 있으면 `distributor_balance_transactions`와 `distributors.current_balance`에 적립합니다. 총판 환전내역 화면은 DB 연결 시 `distributor_withdrawals`를 조회하고, 신청 내역이 없으면 현재 총판 보유금 목록을 표시합니다.

### POST `/api/distributor-withdrawals`

총판 환전 신청 생성.

### PATCH `/api/distributor-withdrawals/:id/complete`

총판 환전 완료 처리.

중복 차감 방지:

- `distributor_balance_transactions`에 `source_type + source_id` unique 제약을 둡니다.
- 완료 처리는 DB 트랜잭션 안에서 한 번만 수행합니다.

## 15. 감사 로그

수정성 작업은 모두 `admin_audit_logs`에 기록합니다.

기록 대상:

- 로그인 성공/실패
- 계정 생성/중지/삭제
- 업체/도메인/총판 수정
- 충전 승인/거절
- 환전 승인/거절
- 수수료율 변경
- 정산 확정/취소

필드:

- `admin_id`
- `action`
- `resource_type`
- `resource_id`
- `before_data`
- `after_data`
- `ip_address`
- `user_agent`
- `created_at`

## 16. Mancoin 외부 API

### makeTransaction

```text
POST https://asia-northeast3-mancoin-f85f5.cloudfunctions.net/api/makeTransaction
```

요청:

```json
{
  "id": "user123",
  "domainUrl": "https://example.com",
  "coinCount": 10,
  "bankHolderName": "홍길동"
}
```

성공 응답:

```json
{
  "code": 0,
  "message": "Transaction created successfully",
  "result": {
    "bank_name": "은행",
    "bank_holder": "홍길동",
    "bank_account": "1234567890",
    "price": 100000,
    "coin_amount": 10,
    "status": "pending",
    "coin_symbol": "MAN"
  }
}
```

### getConnectedAccount

```text
POST https://asia-northeast3-mancoin-f85f5.cloudfunctions.net/api/getConnectedAccount
```

요청:

```json
{
  "domainUrl": "https://example.com"
}
```

성공 응답:

```json
{
  "code": 0,
  "message": "성공",
  "result": {
    "bank_name": "은행",
    "bank_holder": "홍길동",
    "bank_account": "1234567890"
  }
}
```

주의:

- 현재 문서에는 인증 방식이 없습니다.
- 운영에서 IP 제한이나 API Key가 필요한지 확인해야 합니다.
- 외부 API 실패 시 내부 DB에는 실패 로그를 남깁니다.

## 17. 환경변수

```text
DATABASE_URL=
SESSION_SECRET=
MASTER_PASSWORD=
MANCOIN_API_BASE_URL=https://asia-northeast3-mancoin-f85f5.cloudfunctions.net/api
MANCOIN_API_TIMEOUT_MS=10000
NEXT_PUBLIC_APP_URL=
```

실제 변수명은 구현 시 대문자 스네이크 케이스로 통일합니다.

권장:

```text
MANCOIN_API_BASE_URL=
MANCOIN_API_TIMEOUT_MS=
```

## 18. 구현 순서

1. DB 연결과 migration 적용
2. `admins` 기반 로그인 전환
3. 세션/권한 미들웨어 또는 공통 helper 구현
4. 하부계정 API DB 전환
5. 도메인/계좌 API 구현
6. Mancoin `getConnectedAccount` 연동
7. Mancoin `makeTransaction` 연동
8. 충전신청 DB 저장/목록 조회 구현
9. 충전 승인/거절 구현
10. 수수료율 DB 저장 구현
11. 승인 시 수수료 원장 생성
12. 정산 조회 API 구현
13. 환전 API 구현
14. 감사 로그 적용
15. 엑셀 다운로드 구현

## 19. 아직 확인이 필요한 질문

상대방 또는 운영 담당자에게 확인해야 할 항목:

- Mancoin API 인증 방식이 정말 없는지
- 운영 API URL이 현재 문서 URL과 같은지
- 환전 API가 따로 있는지
- 도메인 URL과 외부 API 연동 범위의 실제 매핑값
- 하부계정별 총판 정산 범위를 어디까지 둘지
- 수수료가 총판 보유금에 적립되는지
- 정산 기준일이 신청일인지 승인일인지
- 삭제는 실제 삭제인지 사용중지/숨김 처리인지
