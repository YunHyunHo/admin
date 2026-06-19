import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { AdminsBoard } from "@/components/admins-board";
import {
  getAllAdminAccounts,
  getManagedCompanyOptions,
} from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";
import { canManageMasterResources } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }

  const [adminAccounts, managedCompanies] = await Promise.all([
    getAllAdminAccounts(user).then((accounts) =>
      accounts.map((account) => {
        const { password, ...visibleAccount } = account;
        void password;

        return visibleAccount;
      }),
    ),
    getManagedCompanyOptions(user),
  ]);

  return (
    <AdminShell
      user={user}
      activeItem="admins"
      badge="Admins"
      helperText="총판 계정과 업체 계정을 생성하고, 업체 연결 범위를 설정하는 화면입니다."
    >
      <AdminsBoard
        initialAdmins={adminAccounts}
        managedCompanies={managedCompanies}
        canManageAdmins={canManageMasterResources(user)}
      />
    </AdminShell>
  );
}
