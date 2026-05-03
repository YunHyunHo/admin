import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { TransactionCreateBoard } from "@/components/transaction-create-board";
import { getSessionUser } from "@/lib/auth";

export default async function TransactionCreatePage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem="transaction-create"
      badge="Transaction Create"
      helperText="입금 거래 생성/조회 내역을 확인하는 화면입니다."
    >
      <TransactionCreateBoard />
    </AdminShell>
  );
}
