import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  exchangeColumns,
} from "@/lib/admin-placeholder-config";

export default function ExchangesPage() {
  return (
    <AdminPlaceholderPage
      activeItem="exchanges"
      badge="Exchange Requests"
      helperText="API로 들어온 환전신청을 승인/거절/완료 처리하는 화면입니다."
      eyebrow="Transaction View"
      title="환전신청"
      description="환전 신청 내역을 상태별로 확인하고, 완료 처리 시 정산에 반영하는 탭입니다."
      columns={exchangeColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
