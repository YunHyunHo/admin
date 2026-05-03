import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  domainUserColumns,
} from "@/lib/admin-placeholder-config";

export default function DomainUsersPage() {
  return (
    <AdminPlaceholderPage
      activeItem="domain-users"
      badge="Domain Users"
      helperText="도메인 API에서 들어오는 유저 데이터를 조회하는 화면입니다."
      eyebrow="Domain User View"
      title="도메인 유저 리스트"
      description="도메인별 유저, 총입금액, 소속 조직, 생성일을 확인하는 탭입니다."
      columns={domainUserColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
