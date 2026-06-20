# 충전신청 연동 API 문서

> 이 문서는 이전 연동 방식입니다. 신규 외부 업체에는 [`external-charge-integration-api.md`](./external-charge-integration-api.md)를 전달하세요.

상대 개발사가 충전신청 내역을 관리자에 자동으로 전달할 때 사용하는 API입니다.

## 개요

- 목적: 외부 사이트에서 발생한 충전신청 내역을 관리자에 자동 등록
- 메서드: `POST`
- 운영 URL: `https://laylow.me/api/integration/charge-requests`
- 개발 URL 예시: `http://localhost:3000/api/integration/charge-requests`
- 응답 형식: `application/json`

## 요청 방식

### Endpoint

```http
POST /api/integration/charge-requests
Content-Type: application/json
```

## 요청 필드

| 필드명 | 타입 | 필수 | 설명 |
|---|---|---:|---|
| `externalId` | string | 선택 | 외부 사이트에서 관리하는 고유 요청 ID |
| `domainName` | string | 필수 | 관리자에 등록된 도메인명 |
| `depositorName` | string | 필수 | 입금자명 |
| `amount` | number | 필수 | 신청금액. 0보다 커야 함 |
| `bankName` | string | 선택 | 입금은행명 |
| `accountNumber` | string | 선택 | 입금계좌번호 |

## 요청 예시

### 도메인명 기준 연동

```json
{
  "externalId": "CHARGE-20260519-0001",
  "domainName": "www.test.com",
  "depositorName": "홍길동",
  "amount": 100000,
  "bankName": "신한은행",
  "accountNumber": "110-000-0000"
}
```

## 성공 응답

### HTTP 201

```json
{
  "ok": true,
  "requestId": "db1d90ef-376e-4fea-8d21-700e2cfb111f",
  "status": "PENDING",
  "message": "충전신청이 관리자에 전송되었습니다."
}
```

### 응답 필드 설명

| 필드명 | 타입 | 설명 |
|---|---|---|
| `ok` | boolean | 성공 여부 |
| `requestId` | string | 관리자에 생성된 충전신청 ID |
| `status` | string | 최초 상태. 기본값은 `PENDING` |
| `message` | string | 처리 메시지 |

## 실패 응답

### HTTP 400 예시

#### 1. 대상 계정/도메인 누락

```json
{
  "message": "연동 도메인명을 확인해주세요."
}
```

#### 2. 입금자명 또는 신청금액 오류

```json
{
  "message": "입금자명과 신청금액을 확인해주세요."
}
```

#### 3. 등록되지 않은 도메인

```json
{
  "message": "충전신청을 연결할 도메인을 찾을 수 없습니다."
}
```

## 연동 규칙

1. `depositorName`은 관리자 화면에서 `입금자명`으로 표시됩니다.
2. `amount`는 숫자형으로 보내야 하며, 문자열이 아닌 것을 권장합니다.
3. `bankName`, `accountNumber`는 선택값이지만, 보내주면 관리자 거래내역에서 함께 확인할 수 있습니다.
4. 동일한 `externalId`를 보내더라도 현재 서버에서 중복 차단 문서는 별도로 보장하지 않으므로, 상대 개발사 쪽에서 고유값으로 관리하는 것을 권장합니다.

## cURL 예시

```bash
curl -X POST "https://laylow.me/api/integration/charge-requests" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "CHARGE-20260519-0001",
    "domainName": "www.test.com",
    "depositorName": "홍길동",
    "amount": 100000,
    "bankName": "신한은행",
    "accountNumber": "110-000-0000"
  }'
```

## 전달할 때 같이 안내하면 좋은 내용

- 운영 도메인 주소
- 테스트용 도메인명
- 성공/실패 응답 예시
- 상대 개발사가 보내는 `externalId` 규칙
- API 호출 타이밍
  - 충전신청 버튼 클릭 시 즉시 호출
  - 실제 입금 확인 전, 신청 접수 단계에서 호출
