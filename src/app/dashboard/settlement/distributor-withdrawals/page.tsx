import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  DistributorWithdrawalHistoryBoard,
  fallbackDistributorWithdrawals,
} from "@/components/distributor-withdrawal-history-board";
import { getSessionUser } from "@/lib/auth";
import {
  getDistributorWithdrawalCreateBalance,
  getDistributorWithdrawalRows,
} from "@/lib/distributor-withdrawals-repository";
import { canManageMasterResources } from "@/lib/permissions";


export default async function DistributorWithdrawalsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const isMaster = canManageMasterResources(user);
  const [withdrawalRows, availableBalance] = await Promise.all([
    getDistributorWithdrawalRows(fallbackDistributorWithdrawals, user),
    isMaster ? Promise.resolve(0) : getDistributorWithdrawalCreateBalance(user),
  ]);

  return (
    <AdminShell
      user={user}
      activeItem="distributor-withdrawals"
      badge="Distributor Withdrawals"
      helperText="총판 보유금 환전 신청과 처리 내역을 확인하는 화면입니다."
    >
      <DistributorWithdrawalHistoryBoard
        initialRows={withdrawalRows}
        canCreateWithdrawals={!isMaster}
        canProcessWithdrawals={isMaster}
        availableBalance={availableBalance}
      />
    </AdminShell>
  );
}
