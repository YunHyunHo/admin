export const organizationColumns = [
  { label: "ID", value: "DB 연결 후 자동 생성" },
  { label: "관리자/아이디", value: "계정 정보" },
  { label: "상위 구조", value: "본사 / 상위총판 / 총판 / 대리점" },
  { label: "관리업체", value: "연결된 업체 수" },
  { label: "보유액", value: "0 원" },
  { label: "생성일", value: "-" },
  { label: "관리", value: "수정 / 중지 / 삭제" },
];

export const accountColumns = [
  { label: "본사명", value: "본사" },
  { label: "생성자", value: "총관리자" },
  { label: "은행명", value: "은행 선택" },
  { label: "예금주", value: "예금주 입력" },
  { label: "계좌번호", value: "계좌번호 입력" },
  { label: "사용여부", value: "사용중 / 중지" },
  { label: "API 연동 사이트", value: "0개" },
];

export const domainColumns = [
  { label: "ID", value: "DB 연결 후 자동 생성" },
  { label: "본사", value: "본사" },
  { label: "상위총판", value: "-" },
  { label: "총판", value: "-" },
  { label: "업체명", value: "원페이" },
  { label: "URL", value: "도메인 URL" },
  { label: "API 상태", value: "연결 대기" },
  { label: "관리", value: "계좌관리 / 삭제" },
];

export const domainUserColumns = [
  { label: "ID", value: "DB 연결 후 자동 생성" },
  { label: "본사", value: "본사" },
  { label: "상위총판", value: "-" },
  { label: "총판", value: "-" },
  { label: "도메인", value: "연결 도메인" },
  { label: "유저명", value: "API 유저" },
  { label: "총입금액", value: "0 원" },
  { label: "생성일", value: "-" },
];

export const exchangeColumns = [
  { label: "ID", value: "DB 연결 후 자동 생성" },
  { label: "도메인", value: "연결 도메인" },
  { label: "신청자", value: "환전 신청자" },
  { label: "은행명", value: "은행" },
  { label: "계좌번호", value: "계좌번호" },
  { label: "요청금액", value: "0 원" },
  { label: "상태", value: "PENDING" },
  { label: "처리일", value: "-" },
];

export const transactionColumns = [
  { label: "ID", value: "DB 연결 후 자동 생성" },
  { label: "도메인", value: "연결 도메인" },
  { label: "유저ID", value: "유저" },
  { label: "거래구분", value: "충전 / 환전 / 수수료" },
  { label: "금액", value: "0 원" },
  { label: "상태", value: "처리상태" },
  { label: "요청일", value: "-" },
  { label: "처리일", value: "-" },
];

export const adminColumns = [
  { label: "어드민 ID", value: "admin-domain-01" },
  { label: "어드민명", value: "도메인 관리자" },
  { label: "연결 도메인", value: "domain_id 필수" },
  { label: "연결 업체", value: "company_id 필수" },
  { label: "권한", value: "DOMAIN_ADMIN" },
  { label: "상태", value: "ACTIVE" },
  { label: "접속 URL", value: "/client/{domain}" },
  { label: "최근 로그인", value: "-" },
];

export const distributorWithdrawalColumns = [
  { label: "총판명", value: "총판" },
  { label: "현재 보유금", value: "0 원" },
  { label: "환전 신청 금액", value: "0 원" },
  { label: "환전 후 잔여 보유금", value: "0 원" },
  { label: "은행명", value: "은행" },
  { label: "계좌번호", value: "계좌번호" },
  { label: "예금주", value: "예금주" },
  { label: "신청 상태", value: "PENDING" },
  { label: "관리자 메모", value: "-" },
];

export const defaultNextSteps = [
  "DB 테이블 생성 후 목록 API를 연결합니다.",
  "권한별 접근 범위를 서버에서 검증합니다.",
  "검색, 필터, 엑셀 다운로드를 순서대로 붙입니다.",
];
