# laylow.org 업체 어드민 로그인 API

## Endpoint

- `POST https://laylow.me/partner/auth/login`

상대 프론트 도메인:

- `https://laylow.org`
- `https://www.laylow.org`

## 요청 Body

```json
{
  "loginId": "업체 로그인 ID",
  "password": "비밀번호",
  "domain": "접속 도메인 (선택)"
}
```

예시:

```json
{
  "loginId": "abc_admin",
  "password": "1234",
  "domain": "www.laylow.org"
}
```

## 성공 응답

```json
{
  "ok": true,
  "token": "access_token",
  "user": {
    "loginId": "abc_admin",
    "name": "담당자명",
    "role": "partner_admin",
    "permissions": [
      "partner:charges",
      "partner:withdrawals",
      "partner:purchases",
      "partner:settlement"
    ],
    "menus": ["charge", "withdrawal", "purchase", "settlement"]
  },
  "partner": {
    "id": "업체ID",
    "name": "업체명",
    "domainId": "도메인ID",
    "domain": "www.laylow.org"
  }
}
```

## 실패 응답

```json
{
  "ok": false,
  "message": "아이디 또는 비밀번호가 올바르지 않습니다."
}
```

## 인증 기준

- `loginId`는 생성된 도메인 계정의 로그인 ID여야 합니다.
- `password`는 해당 계정 비밀번호여야 합니다.
- `domain`은 선택값입니다.
- `domain`을 보내면 해당 도메인과 일치하는 계정을 우선 확인합니다.
- `domain`을 보내지 않아도 `loginId + password`로 로그인할 수 있습니다.

## 토큰 사용 방식

이후 API 호출은 아래처럼 Bearer 토큰 방식으로 사용합니다.

```http
Authorization: Bearer {token}
```

## 계정 생성 위치

업체 계정은 관리자 페이지의 아래 메뉴에서 생성합니다.

- `도메인 > 도메인`
- `도메인 추가`

이 흐름으로 생성된 계정만 `laylow.org` 로그인 연동 대상입니다.
