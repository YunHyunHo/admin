import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DistributorWithdrawalHistoryBoard } from "@/components/distributor-withdrawal-history-board";
import { getSessionUser } from "@/lib/auth";

export default async function DistributorWithdrawalsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem="distributor-withdrawals"
      badge="Distributor Withdrawals"
      helperText="총판 보유금 환전 신청과 처리 내역을 확인하는 화면입니다."
    >
      <DistributorWithdrawalHistoryBoard />
    </AdminShell>
  );
}
