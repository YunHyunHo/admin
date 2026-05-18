import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DistributorsBoard } from "@/components/distributors-board";
import { getAllAdminAccounts } from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";
import { canManageMasterResources } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DistributorsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }

  const adminAccounts = await getAllAdminAccounts(user);

  return (
    <AdminShell
      user={user}
      activeItem="org-distributors"
      badge="Organization"
      helperText="마스터 계정에서 총판을 생성하고 상위총판에 연결합니다."
    >
      <DistributorsBoard adminAccounts={adminAccounts} />
    </AdminShell>
  );
}
