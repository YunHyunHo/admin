# Maple Realtime Server pilot

Railway Singapore 리전에 배포하는 `maple` 전용 WebSocket 테스트 서버입니다.
Neon의 `admin_request_event_log`를 원본으로 사용하고 Redis는 Replica 간 Broadcast에만 사용합니다.

필수 환경변수:

- `DATABASE_DIRECT_URL`: Neon Direct Connection URL
- `DATABASE_SSL`: 로컬 PostgreSQL만 `false`
- `REDIS_URL`: Railway Redis URL
- `REALTIME_SERVER_SHARED_SECRET`: Vercel과 공유하는 32자 이상 티켓 서명키
- `REALTIME_SERVER_PUSH_SECRET`: 내부 Fast Path용 32자 이상 키
- `PORT`: Railway가 자동 설정

Vercel에는 다음 값을 설정합니다.

- `REALTIME_SERVER_PUBLIC_WS_URL=wss://<railway-domain>/ws`
- `REALTIME_SERVER_INTERNAL_URL=https://<railway-domain>`
- 위 두 공유 Secret

환경변수가 모두 설정되기 전에는 기존 `maple` Vercel WebSocket 파일럿이 유지됩니다.
운영 계정은 이 서버에 연결되지 않습니다.
