import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  transactionColumns,
} from "@/lib/admin-placeholder-config";

export default function TransactionCreatePage() {
  return (
    <AdminPlaceholderPage
      activeItem="transaction-create"
      badge="Create Transaction"
      helperText="관리자가 수동 거래를 생성해야 할 때 사용하는 화면입니다."
      eyebrow="Transaction View"
      title="거래생성"
      description="예외 처리, 테스트 거래, 수동 정정 거래를 생성할 수 있는 탭입니다."
      columns={transactionColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
