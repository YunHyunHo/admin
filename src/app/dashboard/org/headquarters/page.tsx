import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  organizationColumns,
} from "@/lib/admin-placeholder-config";

export default function HeadquartersPage() {
  return (
    <AdminPlaceholderPage
      activeItem="org-headquarters"
      badge="Organization"
      helperText="본사 계정과 하위 조직 구조를 관리하는 화면입니다."
      eyebrow="Organization View"
      title="본사 리스트"
      description="본사 단위 계정, 보유액, 연결 업체 수, 생성일을 관리하는 탭입니다."
      columns={organizationColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
