import { AdminPlaceholderPage } from "@/components/admin-placeholder-page";
import {
  accountColumns,
  defaultNextSteps,
} from "@/lib/admin-placeholder-config";

export default function AccountsPage() {
  return (
    <AdminPlaceholderPage
      activeItem="accounts"
      badge="Accounts"
      helperText="충전 입금 확인에 사용할 계좌를 관리하는 화면입니다."
      eyebrow="Account View"
      title="계좌관리"
      description="은행명, 예금주, 계좌번호, 연결 도메인, 사용 여부를 관리하는 탭입니다."
      columns={accountColumns}
      nextSteps={defaultNextSteps}
    />
  );
}
