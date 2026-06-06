# 도메인 관리자 사이트 연동 가이드

이 문서는 `https://www.laylow.org/` 도메인 관리자 사이트에서 발생하는 충전/출금 신청을 `https://laylow.me/` 마스터 관리자에 전달하기 위한 기능 기준입니다.

## 전달 배경

- 도메인 관리자 사이트 예시: `https://www.laylow.org/`
- 테스트 계정: `test04 / 0000`
- 이 계정은 마스터 관리자에서 도메인 계정을 생성하면 로그인할 수 있는 도메인 관리자 화면입니다.
- 도메인 관리자 화면에서 충전 또는 출금을 신청하면, 그 신청은 마스터 관리자에 대기 상태로 노출되어야 합니다.
- 마스터 관리자는 `거래내역 > 충전신청`, `도메인 > 도메인환전`에서 승인/거절을 처리합니다.

## 핵심 연결 기준

외부 도메인 관리자 사이트에서 요청을 보낼 때는 반드시 마스터 관리자에 등록된 도메인과 연결되어야 합니다.

우선순위는 아래와 같습니다.

1. `domainId` 사용 권장
2. `domainId`를 모르면 `domainName` 사용
3. `externalId`는 외부 사이트에서 요청마다 고유하게 생성

요청이 마스터 관리자 DB에 들어갈 때 연결되어야 하는 값은 다음과 같습니다.

| 값 | 설명 |
| --- | --- |
| `company_id` | 도메인/업체가 속한 회사 ID |
| `domain_id` | 마스터 관리자에 등록된 도메인 ID |
| `distributor_id` | 도메인에 연결된 총판 또는 상위총판 ID |

## 1. 충전신청 연동

충전신청 API는 현재 운영 서버에 이미 있습니다.

### Endpoint

```http
POST https://laylow.me/api/integration/charge-requests
Content-Type: application/json
```

### 요청 예시

`domainId` 기준 요청을 권장합니다.

```json
{
  "externalId": "domain-test04-charge-20260606-001",
  "domainId": "마스터에서 생성된 domain uuid",
  "depositorName": "홍길동",
  "amount": 10000,
  "bankName": "국민은행",
  "accountNumber": "123-456-789"
}
```

`domainId`를 모르는 경우 `domainName`으로도 요청할 수 있습니다.

```json
{
  "externalId": "domain-test04-charge-20260606-001",
  "domainName": "도메인 테스트",
  "depositorName": "홍길동",
  "amount": 10000,
  "bankName": "국민은행",
  "accountNumber": "123-456-789"
}
```

### 요청 필드

| 필드 | 필수 | 설명 |
| --- | ---: | --- |
| `externalId` | 권장 | 외부 도메인 관리자 사이트의 고유 요청 ID |
| `domainId` | 권장 | 마스터 관리자에 등록된 도메인 UUID |
| `domainName` | 조건부 | `domainId`가 없을 때 사용하는 도메인/업체명 |
| `depositorName` | 필수 | 입금자명 |
| `amount` | 필수 | 충전 신청 금액. 숫자로 전달 |
| `bankName` | 선택 | 입금은행 |
| `accountNumber` | 선택 | 입금계좌번호 |

### 성공 응답

```json
{
  "ok": true,
  "requestId": "생성된 충전신청 uuid",
  "status": "PENDING",
  "message": "충전신청이 관리자에 전송되었습니다."
}
```

### 마스터 관리자 노출 위치

- `거래내역 > 충전신청`
- 최초 상태: 대기
- 마스터 승인 시:
  - 충전신청 상태가 승인으로 변경
  - 수수료율 기준으로 수수료 기록 생성
  - 연결 총판 보유금에 수수료 적립
- 마스터 거절 시:
  - 상태만 거절로 변경
  - 수수료/보유금은 반영하지 않음

## 2. 출금/환전신청 연동

출금은 도메인환전 요청으로 마스터 관리자에 들어와야 합니다.

현재 마스터 관리자 내부에는 세션 기반 `/api/domain-exchanges`가 있지만, 이 API는 관리자 화면 내부용입니다. `https://www.laylow.org/` 같은 별도 도메인 관리자 사이트에서 직접 호출할 외부 연동 API는 별도로 추가해야 합니다.

### 필요한 신규 Endpoint

```http
POST https://laylow.me/api/integration/domain-exchanges
Content-Type: application/json
```

### 요청 예시

```json
{
  "externalId": "domain-test04-exchange-20260606-001",
  "domainId": "마스터에서 생성된 domain uuid",
  "userId": "test04",
  "amount": 50000,
  "bankName": "국민은행",
  "accountHolder": "홍길동",
  "accountNumber": "123-456-789"
}
```

`domainId`를 모르는 경우:

```json
{
  "externalId": "domain-test04-exchange-20260606-001",
  "domainName": "도메인 테스트",
  "userId": "test04",
  "amount": 50000,
  "bankName": "국민은행",
  "accountHolder": "홍길동",
  "accountNumber": "123-456-789"
}
```

### 요청 필드

| 필드 | 필수 | 설명 |
| --- | ---: | --- |
| `externalId` | 권장 | 외부 도메인 관리자 사이트의 고유 요청 ID |
| `domainId` | 권장 | 마스터 관리자에 등록된 도메인 UUID |
| `domainName` | 조건부 | `domainId`가 없을 때 사용하는 도메인/업체명 |
| `userId` | 필수 | 도메인 관리자 또는 요청 사용자 ID |
| `amount` | 필수 | 출금/환전 신청 금액. 숫자로 전달 |
| `bankName` | 필수 | 출금은행 |
| `accountHolder` | 필수 | 예금주 |
| `accountNumber` | 필수 | 계좌번호 |

### 성공 응답 제안

```json
{
  "ok": true,
  "requestId": "생성된 도메인환전 uuid",
  "status": "PENDING",
  "message": "환전신청이 관리자에 전송되었습니다."
}
```

### 마스터 관리자 노출 위치

- `도메인 > 도메인환전`
- 최초 상태: 대기
- 마스터 승인 시:
  - 환전 요청 상태가 승인으로 변경
  - 연결된 도메인/총판 보유금에서 요청금액 차감
  - 정산/거래내역에 환전 금액 반영
- 마스터 거절 시:
  - 상태만 거절로 변경
  - 보유금은 차감하지 않음

## 3. 외부 개발자에게 전달할 멘트

아래 문장을 그대로 전달하면 됩니다.

```text
도메인 관리자 사이트에서 충전/출금 신청이 발생하면 마스터 관리자 서버인 https://laylow.me 로 신청 데이터를 보내주셔야 합니다.

충전신청은 이미 준비된 API가 있습니다.
POST https://laylow.me/api/integration/charge-requests

요청에는 externalId, domainId 또는 domainName, depositorName, amount, bankName, accountNumber를 JSON으로 보내주세요.
가능하면 domainName보다 마스터 관리자에서 생성된 domainId를 보내는 방식이 안전합니다.
이 요청이 성공하면 마스터 관리자 > 거래내역 > 충전신청에 대기 상태로 노출됩니다.

출금신청은 도메인환전으로 들어와야 합니다.
출금은 같은 방식으로 POST https://laylow.me/api/integration/domain-exchanges API가 필요합니다.
요청에는 externalId, domainId 또는 domainName, userId, amount, bankName, accountHolder, accountNumber를 보내주세요.
이 요청이 성공하면 마스터 관리자 > 도메인 > 도메인환전에 대기 상태로 노출되어야 합니다.

두 요청 모두 externalId는 매 요청마다 중복되지 않게 생성해주세요.
그리고 domainId/domainName은 마스터 관리자에서 생성된 도메인과 매칭되어야 합니다.
```

## 4. 보안 권장사항

현재 충전신청 연동 API는 단순 JSON 요청으로 사용할 수 있습니다. 운영 안정성을 위해 아래 보강을 권장합니다.

- 도메인별 `X-API-Key` 발급
- 요청 헤더에 `X-API-Key` 포함
- 서버에서 API Key와 `domainId` 매칭 검증
- `externalId` 중복 요청 차단
- 요청 금액은 정수 원화만 허용

권장 헤더 예시:

```http
Content-Type: application/json
X-API-Key: 도메인별로 발급한 키
```

## 5. 확인 시나리오

1. 마스터 관리자에서 도메인 계정을 생성합니다.
2. 생성된 도메인 계정으로 `https://www.laylow.org/`에 로그인합니다.
3. 충전신청을 보냅니다.
4. 마스터 관리자 `거래내역 > 충전신청`에 대기 건이 보이는지 확인합니다.
5. 마스터가 승인하면 수수료 기록과 보유금이 반영되는지 확인합니다.
6. 출금신청을 보냅니다.
7. 마스터 관리자 `도메인 > 도메인환전`에 대기 건이 보이는지 확인합니다.
8. 마스터가 승인하면 보유금이 차감되는지 확인합니다.
9. 거절 시 보유금이 변하지 않는지 확인합니다.
