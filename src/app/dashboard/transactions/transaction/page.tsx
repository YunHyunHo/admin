import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { TransactionLedgerBoard } from "@/components/transaction-ledger-board";
import { getSessionUser } from "@/lib/auth";

export default async function TransactionPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem="transaction"
      badge="Transaction"
      helperText="전체 거래 원장을 조회하고 승인 상태를 확인하는 화면입니다."
    >
      <TransactionLedgerBoard />
    </AdminShell>
  );
}
