import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  organizationColumns,
} from "@/lib/admin-placeholder-config";

export default function AgenciesPage() {
  return (
    <AdminPlaceholderPage
      activeItem="org-agencies"
      badge="Organization"
      helperText="대리점 계정과 하위 연결 정보를 관리하는 화면입니다."
      eyebrow="Organization View"
      title="대리점 리스트"
      description="대리점 단위의 계정, 소속 총판, 관리 업체, 보유액을 확인하는 탭입니다."
      columns={organizationColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
