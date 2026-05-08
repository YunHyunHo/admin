import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { AdminsBoard } from "@/components/admins-board";
import {
  getManagedCompanyOptions,
  getPublicAdminAccounts,
} from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";

export default async function AdminsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const [adminAccounts, managedCompanies] = await Promise.all([
    getPublicAdminAccounts(),
    getManagedCompanyOptions(),
  ]);

  return (
    <AdminShell
      user={user}
      activeItem="admins"
      badge="Admins"
      helperText="도메인별 어드민 계정과 업체 연결 범위를 관리하는 화면입니다."
    >
      <AdminsBoard
        initialAdmins={adminAccounts}
        managedCompanies={managedCompanies}
        canManageAdmins={user.role === "MASTER"}
      />
    </AdminShell>
  );
}
