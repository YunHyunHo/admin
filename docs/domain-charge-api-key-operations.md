# 도메인 충전 API 키 운영

이 문서는 외부 업체에 전달하지 않는 내부 운영용입니다.

## 키 발급 또는 재발급

```bash
npm run integration:key -- issue \
  --master 마스터로그인ID \
  --domain 도메인UUID또는도메인명 \
  --label 외부업체명
```

- 기존 활성 키가 있으면 즉시 중지되고 새 키가 발급됩니다.
- 원본 키는 발급 순간 한 번만 표시됩니다.
- DB에는 원본이 아닌 SHA-256 해시만 저장됩니다.
- 출력된 키는 해당 외부 업체 개발자에게 안전한 경로로 전달합니다.

## 키 상태 확인

```bash
npm run integration:key -- status \
  --master 마스터로그인ID \
  --domain 도메인UUID또는도메인명
```

## 키 중지

```bash
npm run integration:key -- revoke \
  --master 마스터로그인ID \
  --domain 도메인UUID또는도메인명
```

활성 키가 있으면 로그인 응답의 `partner.chargeMode`는 `API`, 없으면 `MANUAL`입니다.

