import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { TopDistributorsBoard } from "@/components/top-distributors-board";
import { getAllAdminAccounts } from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";
import { canManageMasterResources } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TopDistributorsPage() {
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
      activeItem="org-top-distributors"
      badge="Organization"
      helperText="마스터 계정에서 상위총판 계정을 별도로 생성하고 관리합니다."
    >
      <TopDistributorsBoard adminAccounts={adminAccounts} />
    </AdminShell>
  );
}
