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

  const domainData = await getDomainBoardData(fallbackDomainRows);

  return (
    <AdminShell
      user={user}
      activeItem="domains"
      badge="Domains"
      helperText="도메인과 도메인 유저를 한 화면에서 확인하는 통합 관리 화면입니다."
    >
      <DomainManagementBoard
        initialRows={domainData.rows}
        distributorOptions={domainData.distributorOptions}
        canManageDomains={canManageMasterResources(user)}
      />
    </AdminShell>
  );
}
