import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DomainListBoard } from "@/components/domain-list-board";
import { getSessionUser } from "@/lib/auth";
import { getDomainListBoardData } from "@/lib/domain-list-repository";
import { canManageMasterResources } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DomainListPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }

  const data = await getDomainListBoardData(user);

  return (
    <AdminShell
      user={user}
      activeItem="domain-list"
      badge="Domain"
      helperText="도메인별 로그인 계정과 출금 계좌, 충전거래 허용 상태를 한 번에 관리하는 화면입니다."
    >
      <DomainListBoard initialRows={data.rows} ownerOptions={data.ownerOptions} />
    </AdminShell>
  );
}
