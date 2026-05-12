import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  fallbackLedgerRows,
  TransactionLedgerBoard,
} from "@/components/transaction-ledger-board";
import { getSessionUser } from "@/lib/auth";
import { getTransactionLedgerRows } from "@/lib/transaction-ledger-repository";

export default async function TransactionPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const ledgerRows = await getTransactionLedgerRows(fallbackLedgerRows);

  return (
    <AdminShell
      user={user}
      activeItem="transaction"
      badge="Transaction"
      helperText="전체 거래 원장을 조회하고 승인 상태를 확인하는 화면입니다."
    >
      <TransactionLedgerBoard initialRows={ledgerRows} />
    </AdminShell>
  );
}
