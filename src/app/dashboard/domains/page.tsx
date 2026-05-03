import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DomainManagementBoard } from "@/components/domain-management-board";
import { getSessionUser } from "@/lib/auth";

export default async function DomainsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem="domains"
      badge="Domains"
      helperText="도메인과 도메인 유저를 한 화면에서 확인하는 통합 관리 화면입니다."
    >
      <DomainManagementBoard />
    </AdminShell>
  );
}
