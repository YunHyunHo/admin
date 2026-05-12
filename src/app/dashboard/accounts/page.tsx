import { redirect } from "next/navigation";

import { AccountsBoard } from "@/components/accounts-board";
import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import { getBankAccountBoardData } from "@/lib/bank-accounts-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { canManageMasterResources } from "@/lib/permissions";

export default async function AccountsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const accountData = await getBankAccountBoardData(user);
  const isDatabaseBacked = hasDatabaseUrl();
  const isMaster = canManageMasterResources(user);

  return (
    <AdminShell
      user={user}
      activeItem="accounts"
      badge="Accounts"
      helperText="충전 입금 확인에 사용할 계좌를 생성하고 관리하는 화면입니다."
    >
      <AccountsBoard
        initialAccounts={isDatabaseBacked ? accountData.accounts : undefined}
        branchOptions={accountData.branchOptions}
        canCreateAccounts={!isMaster || accountData.branchOptions.length === 1}
        canManageAccounts={isMaster}
      />
    </AdminShell>
  );
}
