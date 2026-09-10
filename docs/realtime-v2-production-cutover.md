# Realtime V2 Production 전환 준비서

이 문서는 운영 변경 전에 확인할 준비 범위와 실제 승인 후 실행할 절차를 정리한다. 문서 작성만으로 Production 설정이나 Feature Flag는 변경되지 않는다.

## 적용 단위

- 그룹 소유자: `kks758`
- 활성 관리자 계정: 총 30개 (`kks758` 포함, 연결 계정 29개)
- 업체 어드민 대상: 19개 활성 도메인
- 그룹 판별 기준: MASTER 계정과 `admins.created_by`로 연결된 계정
- 업체 판별 기준: 도메인 회사에 매핑된 DOMAIN_ADMIN의 소유 MASTER

운영 값은 `realtime_account_flags(environment='production', login_id='kks758')` 한 행으로 제어한다. 개별 계정마다 Flag를 만들지 않는다.

## Production에서 변경되는 Route와 코드 범위

### 마스터 어드민

- `GET /api/realtime-mode`: 최초 진입, 탭 재활성화, WebSocket 재연결 시에만 그룹 모드를 확인한다. 정상 연결 중 주기 조회는 없다.
- `GET /api/realtime-token`: 현재 로그인 사용자의 그룹과 권한 범위를 확인하고 짧은 수명의 Railway WebSocket 토큰을 발급한다.
- `/api/request-notifications`: Realtime V2 연결 완료 시 주기 호출을 중단한다. 최초 동기화, 실제 이벤트, 장애 fallback에서만 사용한다.
- `/api/request-events`, `/api/live-sync`: 정상 Realtime V2 상태에서는 연결하지 않는다. Flag OFF 시 기존 방식 복구를 위해 Route 자체는 유지한다.
- 충전, 도메인 환전, 총판 환전, 도메인 정보 변경 저장 경로: 업무 데이터와 Outbox를 같은 DB transaction에 저장하고 Commit 후 Railway에 eventId를 전달한다.
- 충전/도메인 환전/총판 환전 화면: 정상 연결 중 타이머 조회를 중단하고 Railway 이벤트 수신 시 필요한 목록만 갱신한다.

### 업체 어드민

- `GET /api/realtime/token`: 기존 업체 로그인 토큰을 그대로 사용해 마스터의 `/api/integration/realtime-token`을 호출한다.
- `app/page.js`: Railway WebSocket 연결 완료 시 `/api/integration/domain-events` EventSource와 30초 동기화를 중단한다.
- WebSocket 장애 시에만 10초 fallback 조회를 시작하고, 재연결 및 replay 완료 즉시 중단한다.
- 정상 연결 중에는 실제 이벤트, 사용자 검색/페이지 이동, 최초 동기화 외 반복 업무 조회가 없다.

### Railway Realtime Server

- `POST /internal/events`: Vercel Fast Path에서 eventId를 수신한다.
- `POST /internal/control`: `kks758` 그룹의 모든 활성 연결에 ON/OFF 제어 이벤트를 fan-out한다.
- `/ws`: 토큰의 관리자/업체 권한 범위로 연결하고 Outbox replay, ACK, heartbeat를 처리한다.
- 중앙 reconciliation worker: Fast Path 누락 및 서버 재시작 시 Neon Outbox cursor 이후 이벤트를 복구한다.

## 정상 상태에서 중단되는 반복 호출

- 마스터: `/api/request-notifications` 1초 polling
- 마스터: `/api/request-events` 장기 SSE
- 마스터: `/api/live-sync` 장기 SSE
- 마스터: `/api/realtime-mode` 5초 polling
- 업체: `/api/integration/domain-events` 장기 SSE 및 내부 3초 DB polling
- 업체: 충전/환전/정산의 30초 반복 조회

위 Route는 즉시 롤백을 위해 삭제하지 않는다. Realtime V2 정상 연결 상태에서 호출되지 않는 것이 기준이다. WebSocket ping/pong은 Railway 연결 내부 트래픽이며 Vercel Route 호출이 아니다.

## 운영 승인 후 필요한 설정

승인 전에는 아래 Production 값을 등록하거나 변경하지 않는다.

1. Vercel 마스터 Production에 Railway URL, 공유 Secret, `REALTIME_V2_OWNER_LOGIN_IDS=kks758`를 등록한다.
2. Railway 운영 환경에 동일한 공유 Secret, Neon 연결, `kks758` owner allowlist, 실제 운영 Origin과 19개 도메인 범위를 등록한다.
3. 업체 어드민 Production은 기존 마스터 토큰 API 주소를 유지한다. Automation Bypass 토큰은 사용하지 않는다.
4. `node scripts/realtime-group-status.mjs production kks758`로 DB의 계정/도메인 수와 저장된 Flag 상태를 읽기 전용으로 확인한다. 출력의 `localEnvironmentHints`는 실행한 로컬 셸의 환경변수 참고값이며 Vercel/Railway Production 설정 상태를 뜻하지 않는다.
5. 배포 후에도 Flag는 OFF 상태로 두고 로그인 세션과 legacy 동작을 먼저 확인한다.
6. 별도 승인 시에만 `node scripts/realtime-group-flag.mjs production kks758 on --confirm-production`으로 그룹 전체를 ON 한다.

## 전체 롤백 절차

1. `node scripts/realtime-group-flag.mjs production kks758 off --confirm-production`을 실행한다.
2. 명령은 DB의 Production 그룹 Flag를 먼저 OFF로 저장한 뒤 Railway `/internal/control`에 제어 이벤트를 보낸다.
3. 연결된 클라이언트는 WebSocket을 종료하고 DB 기준으로 한 번 재동기화한 뒤 기존 SSE/fallback 경로로 전환한다.
4. Railway가 이미 장애라 제어 이벤트를 못 보내도 클라이언트가 close/error/heartbeat timeout으로 장애를 감지해 fallback으로 전환한다.
5. Railway 재연결 전 토큰/모드 조회에서 저장된 OFF 상태가 다시 확인되므로 WebSocket으로 잘못 복귀하지 않는다.
6. Route 로그와 DB pending 목록/건수를 비교해 legacy 복구를 확인한다.

OFF 저장이 성공하고 제어 Push가 실패한 경우에도 다음 연결/탭 활성화 시 DB의 OFF 상태가 적용된다. 문제가 해소된 뒤 ON으로 복귀할 때는 Outbox replay와 초기 DB 동기화를 거쳐 최종 상태를 맞춘다.

## 로그인 세션 영향

- 이번 변경 범위에는 Session Secret, Cookie 이름/Domain/Path/SameSite, 세션 저장 방식, 로그인 Middleware 변경이 없다.
- 마스터의 기존 쿠키 세션과 업체 어드민의 기존 localStorage 세션을 그대로 사용한다.
- Feature Flag ON/OFF는 인증정보를 삭제하거나 회전하지 않는다.
- 따라서 새 버전 새로고침과 ON/OFF 전환 때문에 로그아웃될 코드 경로는 없다. 실제 운영 배포 전 기존 로그인 탭에서 새로고침 후 세션 유지 smoke test를 한 번 더 수행한다.

## 최초 배포 후 기존 탭 전환 안내

기존에 열려 있던 탭에는 배포된 새 JavaScript가 자동 주입되지 않는다. 최초 Cutover 때 사용자에게 아래처럼 안내한다.

> 실시간 알림 방식이 변경되었습니다. 현재 열려 있는 마스터 및 업체 어드민 화면을 한 번만 새로고침해주세요. 로그아웃은 되지 않으며, 새로고침 후 새 실시간 연결로 자동 전환됩니다.

새로고침 후 확인 항목:

1. 로그인 상태 유지
2. Railway WebSocket 연결 수 증가
3. 정상 상태에서 기존 polling/SSE Route 호출 중단
4. 신규 신청의 목록, pending 건수, 상태, 알림음이 1초 이내 반영
5. 오래된 탭에서 기존 Route 호출이 남으면 해당 탭만 새로고침

## 운영 직후 관찰 및 중단 기준

- 충전/도메인 환전/총판 환전 생성 및 상태 변경
- 모든 활성 PC/브라우저/탭 수신
- pending 목록/건수와 Neon DB 일치
- WebSocket disconnect, replay, ACK, fallback 시작/중단
- `/api/request-notifications`, `/api/request-events`, `/api/live-sync`, `/api/integration/domain-events`, 반복 목록 조회 호출량
- Vercel Invocation, Active CPU, Provisioned Memory, Timeout과 Railway CPU/Memory/Network

누락, 중복 알림, 1초 초과 지연의 반복, DB 불일치가 확인되면 즉시 그룹 Flag를 OFF하고 위 롤백 절차를 수행한다.
