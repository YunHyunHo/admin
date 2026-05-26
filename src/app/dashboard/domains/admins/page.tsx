import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DomainAdminsBoard } from "@/components/domain-admins-board";
import { getPublicAdminAccounts } from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";
import { canManageMasterResources } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DomainAdminsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }

  const adminAccounts = await getPublicAdminAccounts(user);

  return (
    <AdminShell
      user={user}
      activeItem="domain-admins"
      badge="Domain Admins"
      helperText="도메인 전용 계정은 별도 URL에서 관리하고, 기존 어드민리스트와 분리합니다."
    >
      <DomainAdminsBoard
        initialAdmins={adminAccounts}
        canManageAdmins={canManageMasterResources(user)}
      />
    </AdminShell>
  );
}
