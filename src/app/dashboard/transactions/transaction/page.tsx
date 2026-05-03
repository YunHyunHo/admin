import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  defaultNextSteps,
  transactionColumns,
} from "@/lib/admin-placeholder-config";

export default function TransactionPage() {
  return (
    <AdminPlaceholderPage
      activeItem="transaction"
      badge="Transaction"
      helperText="충전, 환전, 수수료 등 전체 거래 원장을 조회하는 화면입니다."
      eyebrow="Transaction Ledger"
      title="Transaction"
      description="전체 거래를 한 원장에서 조회하고 추적하기 위한 탭입니다."
      columns={transactionColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
