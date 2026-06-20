# 도메인 어드민 충전 연동 설정

도메인 어드민은 로그인 응답의 `chargeMode`로 수동 충전과 API 자동 연동을 구분하고, 구매내역은 로그인 토큰으로 조회합니다.

## 1. 로그인 응답

```http
POST https://laylow.me/partner/auth/login
Content-Type: application/json
```

성공 응답의 `partner.chargeMode`를 저장합니다.

```json
{
  "ok": true,
  "token": "로그인_토큰",
  "partner": {
    "id": "업체ID",
    "name": "업체명",
    "domainId": "도메인ID",
    "domain": "도메인주소",
    "chargeMode": "API"
  }
}
```

| 값 | 화면 처리 |
| --- | --- |
| `API` | 수동 충전신청 입력 화면 숨김. 구매내역은 표시 |
| `MANUAL` | 기존 수동 충전신청 화면과 구매내역 모두 표시 |

API 키 원문은 로그인 응답에 포함하지 않습니다.

## 2. 구매내역 조회

```http
GET https://laylow.me/api/integration/charge-requests?page=1&pageSize=10
Authorization: Bearer 로그인_토큰
```

로그인 토큰에 연결된 도메인을 서버가 자동 적용하므로 `domainId`를 보낼 필요가 없습니다.

선택 Query:

| 필드 | 설명 |
| --- | --- |
| `page` | 페이지. 기본값 `1` |
| `pageSize` | 페이지 크기. 기본값 `10`, 최대 `100` |
| `from` | 요청일 시작 `YYYY-MM-DD` |
| `to` | 요청일 종료 `YYYY-MM-DD` |
| `status` | `PENDING`, `APPROVED`, `REJECTED` |

### 응답 예시

```json
{
  "ok": true,
  "items": [
    {
      "id": "비가역_식별값",
      "bankName": "국민은행",
      "accountHolder": "Win Pay",
      "accountNumber": "12031-23",
      "amount": 100000,
      "buyer": "홍길동",
      "requestedAt": "26-06-20 15:10:00",
      "changedAt": "26-06-20 15:10:00",
      "status": "PENDING"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 1
  }
}
```

## 3. 고정 테이블 매핑

테이블 헤더는 추가·삭제·변경하지 않습니다.

| 테이블 헤더 | API 필드 |
| --- | --- |
| ID | `id` |
| 은행 | `bankName` |
| 예금주 | `accountHolder` |
| 계좌번호 | `accountNumber` |
| 요청금액 | `amount` |
| 구매자 | `buyer` |
| 요청일 | `requestedAt` |
| 상태변경일 | `changedAt` |
| 상태 | `status` |

- `ID`는 도메인 어드민 로그인 아이디 원문이 아닌 비가역 식별값입니다.
- 계좌정보는 마스터 어드민의 `도메인 > 업체 출금은행 정보`를 신청 시점에 저장한 값입니다.
- `구매자`는 입금자명입니다.
- 최초 `PENDING` 상태의 상태변경일은 요청일과 같습니다.
- 승인·거절 후 상태변경일은 마스터가 처리한 시간으로 변경됩니다.

## 4. 자동 갱신

- 로그인 상태에서는 5초마다 구매내역을 다시 조회합니다.
- 신규 대기 신청부터 즉시 목록에 표시합니다.
- 마스터 승인·거절 후 `status`, `changedAt`을 갱신합니다.
- `401` 응답이면 로그인 토큰 만료로 처리하고 다시 로그인합니다.

