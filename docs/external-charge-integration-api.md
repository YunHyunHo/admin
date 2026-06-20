# WinPay 외부 충전신청 연동 API

외부 사이트에서 발생한 충전신청을 WinPay 마스터 어드민으로 전달하는 서버 간 연동 문서입니다.

## 연동 개요

- 운영 서버: `https://laylow.me`
- 요청 형식: `application/json`
- 인증: 도메인별 `X-API-Key`
- 외부 사이트 1개는 도메인 1개와 연결됩니다.
- API 키로 연결 도메인과 도메인 어드민을 서버가 자동 식별합니다.
- 외부 사이트는 `domainId`, 도메인 어드민 아이디, 계좌정보를 보내지 않습니다.

> API 키를 브라우저 JavaScript에 넣으면 노출됩니다. 외부 사이트의 백엔드 또는 Vercel/Next.js API Route에서 WinPay API를 호출해야 합니다.

## 충전신청 생성

```http
POST https://laylow.me/api/integration/charge-requests
Content-Type: application/json
X-API-Key: 발급받은_API_KEY
```

### 요청 Body

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | ---: | --- |
| `externalId` | UUID string | 필수 | 외부 사이트가 신청마다 자동 생성하는 중복방지 ID |
| `depositorName` | string | 필수 | 실제 입금자명. 구매내역의 `구매자`로 표시 |
| `amount` | integer | 필수 | 충전금액. 최소 `10,000`원, 최대 제한 없음 |
| `bankName` | string | 선택 | Mancoin `result.bank_name`. 계좌정보를 보낼 때 세 필드를 모두 전송 |
| `accountHolder` | string | 선택 | Mancoin `result.bank_holder` |
| `accountNumber` | string | 선택 | Mancoin `result.bank_account` |

```json
{
  "externalId": "2ca5ea3d-f95e-4e89-bdb3-3d0f67984f60",
  "depositorName": "홍길동",
  "amount": 100000,
  "bankName": "우리은행",
  "accountHolder": "Mancoin",
  "accountNumber": "123-456-7890"
}
```

Mancoin 충전 생성 결과를 전달할 때는 다음과 같이 매핑합니다.

- `result.bank_name` -> `bankName`
- `result.bank_holder` -> `accountHolder`
- `result.bank_account` -> `accountNumber`
- `result.price` -> `amount`

세 계좌 필드를 보내면 신청 당시 값으로 저장되어 도메인 어드민 구매내역에도 동일하게 표시됩니다. 세 필드를 모두 생략하면 마스터 어드민에 설정된 업체 출금은행 정보를 사용합니다.

### 보내면 안 되는 값

- `domainId`, `domainName`
- 도메인 어드민 로그인 아이디 또는 비밀번호
- 불완전한 계좌정보(은행, 예금주, 계좌번호 중 일부만 전송)

위 값들은 API 키에 연결된 WinPay 설정을 기준으로 서버가 처리합니다.

## 성공 응답

### 신규 접수: HTTP 201

```json
{
  "ok": true,
  "requestId": "9a49e742-d94f-4bf9-a975-48aa9be0cbb1",
  "externalId": "2ca5ea3d-f95e-4e89-bdb3-3d0f67984f60",
  "status": "PENDING",
  "duplicate": false,
  "message": "충전신청이 관리자에 전송되었습니다."
}
```

### 동일 UUID 재전송: HTTP 200

네트워크 재시도 등으로 같은 `externalId`가 다시 전송되면 새 신청을 만들지 않고 기존 결과를 반환합니다.

```json
{
  "ok": true,
  "requestId": "9a49e742-d94f-4bf9-a975-48aa9be0cbb1",
  "externalId": "2ca5ea3d-f95e-4e89-bdb3-3d0f67984f60",
  "status": "PENDING",
  "duplicate": true,
  "message": "이미 접수된 충전신청입니다. 기존 신청 정보를 반환합니다."
}
```

## 실패 응답

| HTTP | 상황 |
| ---: | --- |
| `400` | UUID 형식 오류, 입금자명 누락, 금액이 정수가 아님, 1만원 미만 |
| `401` | API 키가 없거나 유효하지 않음, 또는 중지된 키 |
| `403` | API 연동 도메인에 API 키 없이 요청 |

```json
{
  "ok": false,
  "message": "유효하지 않거나 중지된 API 키입니다."
}
```

## 상태값

| 상태 | 의미 |
| --- | --- |
| `PENDING` | 마스터 승인 대기 |
| `APPROVED` | 승인 완료 |
| `REJECTED` | 거절 완료 |

외부 사이트는 승인·거절 결과를 별도로 조회하지 않습니다. 결과는 연결된 도메인 어드민의 구매내역에서 확인합니다.

## Node.js 서버 예시

```js
import { randomUUID } from "node:crypto";

const response = await fetch(
  "https://laylow.me/api/integration/charge-requests",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.WINPAY_API_KEY
    },
    body: JSON.stringify({
      externalId: randomUUID(),
      depositorName: "홍길동",
      amount: mancoinResult.price,
      bankName: mancoinResult.bank_name,
      accountHolder: mancoinResult.bank_holder,
      accountNumber: mancoinResult.bank_account
    })
  }
);

const result = await response.json();
```

## 구현 체크리스트

1. 충전신청 버튼 클릭 시 외부 사이트 서버에서 UUID를 한 번 생성합니다.
2. 응답을 받지 못해 재시도할 때는 같은 UUID를 사용합니다.
3. 새로운 신청에는 새로운 UUID를 사용합니다.
4. API 키는 환경변수에 저장하고 브라우저 응답·로그에 노출하지 않습니다.
5. HTTP `200`과 `201`을 모두 성공으로 처리합니다.
6. 성공 응답의 `requestId`를 외부 사이트 서버 로그에 저장합니다.
