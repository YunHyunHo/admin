import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DistributorsBoard } from "@/components/distributors-board";
import { getAllAdminAccounts } from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";

export default async function DistributorsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const adminAccounts = await getAllAdminAccounts();

  return (
    <AdminShell
      user={user}
      activeItem="org-distributors"
      badge="Organization"
      helperText="어드민 리스트에서 생성한 하부계정이 총판 목록에 표시됩니다."
    >
      <DistributorsBoard adminAccounts={adminAccounts} />
    </AdminShell>
  );
}
