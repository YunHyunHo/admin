import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  organizationColumns,
} from "@/lib/admin-placeholder-config";

export default function DistributorsPage() {
  return (
    <AdminPlaceholderPage
      activeItem="org-distributors"
      badge="Organization"
      helperText="총판 보유금과 연결 도메인을 관리하는 화면입니다."
      eyebrow="Organization View"
      title="총판 리스트"
      description="총판별 보유금, 하위 대리점, 연결 업체, 수수료율을 확인하고 관리하는 탭입니다."
      columns={organizationColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
