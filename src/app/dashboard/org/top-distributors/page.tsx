import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  organizationColumns,
} from "@/lib/admin-placeholder-config";

export default function TopDistributorsPage() {
  return (
    <AdminPlaceholderPage
      activeItem="org-top-distributors"
      badge="Organization"
      helperText="상위총판 계정과 연결 업체 범위를 관리하는 화면입니다."
      eyebrow="Organization View"
      title="상위총판 리스트"
      description="상위총판 생성, 사용/중지, 연결된 총판 및 업체 수를 확인하는 탭입니다."
      columns={organizationColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
