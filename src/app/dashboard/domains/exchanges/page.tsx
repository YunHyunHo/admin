import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  exchangeColumns,
} from "@/lib/admin-placeholder-config";

export default function DomainExchangesPage() {
  return (
    <AdminPlaceholderPage
      activeItem="domain-exchanges"
      badge="Domain Exchanges"
      helperText="도메인 기준 환전 요청을 확인하고 처리하는 화면입니다."
      eyebrow="Domain Exchange View"
      title="도메인환전"
      description="도메인별 환전 신청자, 출금 계좌, 요청 금액, 처리 상태를 관리하는 탭입니다."
      columns={exchangeColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
