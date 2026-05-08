import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { TopDistributorsBoard } from "@/components/top-distributors-board";
import { getAllAdminAccounts } from "@/lib/admin-accounts";
import { getSessionUser } from "@/lib/auth";

export default async function TopDistributorsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const adminAccounts = await getAllAdminAccounts();

  return (
    <AdminShell
      user={user}
      activeItem="org-top-distributors"
      badge="Organization"
      helperText="마스터 계정은 상위총판으로만 표시되고, 상위총판 계정은 별도로 생성하지 않습니다."
    >
      <TopDistributorsBoard adminAccounts={adminAccounts} />
    </AdminShell>
  );
}
