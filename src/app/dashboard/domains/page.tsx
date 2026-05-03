import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import { defaultNextSteps, domainColumns } from "@/lib/admin-placeholder-config";

export default function DomainsPage() {
  return (
    <AdminPlaceholderPage
      activeItem="domains"
      badge="Domains"
      helperText="업체별 도메인과 API 연동 정보를 관리하는 화면입니다."
      eyebrow="Domain View"
      title="도메인 리스트"
      description="업체명, URL, 연결 조직, 출금은행 정보, API 상태를 관리하는 탭입니다."
      columns={domainColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
