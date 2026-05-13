import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { AdminsBoard } from "@/components/admins-board";
import {
  getManagedCompanyOptions,
  getPublicAdminAccounts,
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
    getPublicAdminAccounts(user),
    getManagedCompanyOptions(),
  ]);

  return (
    <AdminShell
      user={user}
      activeItem="admins"
      badge="Admins"
      helperText="master가 하부계정을 만들고, 생성된 하부계정은 조직관리의 총판으로 표시됩니다."
    >
      <AdminsBoard
        initialAdmins={adminAccounts}
        managedCompanies={managedCompanies}
        canManageAdmins={canManageMasterResources(user)}
      />
    </AdminShell>
  );
}
