import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  DomainManagementBoard,
  fallbackDomainRows,
} from "@/components/domain-management-board";
import { getSessionUser } from "@/lib/auth";
import { getDomainBoardData } from "@/lib/domain-management-repository";
import { canManageMasterResources } from "@/lib/permissions";


export default async function DomainsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }

  const domainData = await getDomainBoardData(fallbackDomainRows, user);

  return (
    <AdminShell
      user={user}
      activeItem="domains"
      badge="Balance Management"
      helperText="도메인별 보유금 현황과 연결 상태를 함께 관리하는 화면입니다."
    >
      <DomainManagementBoard
        initialRows={domainData.rows}
        distributorOptions={domainData.distributorOptions}
        canManageDomains={canManageMasterResources(user)}
      />
    </AdminShell>
  );
}
