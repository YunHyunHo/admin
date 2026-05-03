import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import { adminColumns } from "@/lib/admin-placeholder-config";

export default function AdminsPage() {
  return (
    <AdminPlaceholderPage
      activeItem="admins"
      badge="Admins"
      helperText="도메인별 어드민 계정을 생성하고 연결 범위를 관리하는 화면입니다."
      eyebrow="Admin View"
      title="어드민 리스트"
      description="도메인별 어드민 계정, 권한, 상태, 접속 URL, 최근 로그인 일시를 관리하는 탭입니다."
      columns={adminColumns}
      nextSteps={[
        "admins와 admin_domain_mappings 테이블을 연결합니다.",
        "DOMAIN_ADMIN은 서버에서 domain_id 접근 범위를 반드시 검증합니다.",
        "비밀번호 초기화와 사용/중지 처리를 추가합니다.",
      ]}
    />
  );
}
