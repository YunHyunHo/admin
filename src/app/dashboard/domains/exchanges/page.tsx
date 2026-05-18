import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  DomainExchangesBoard,
  fallbackDomainExchanges,
} from "@/components/domain-exchanges-board";
import { getSessionUser } from "@/lib/auth";
import {
  getDomainExchangeOptions,
  getDomainExchangeRows,
} from "@/lib/domain-exchanges-repository";
import { canManageMasterResources } from "@/lib/permissions";

export default async function DomainExchangesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const exchangeRows = await getDomainExchangeRows(fallbackDomainExchanges, user);
  const domainOptions = await getDomainExchangeOptions(user);
  const isMaster = canManageMasterResources(user);

  return (
    <AdminShell
      user={user}
      activeItem="domain-exchanges"
      badge="Domain Exchanges"
      helperText="도메인 기준 환전 요청을 확인하고 처리하는 화면입니다."
    >
      <DomainExchangesBoard
        initialRows={exchangeRows}
        domainOptions={domainOptions}
        canCreateExchanges={!isMaster}
        canProcessExchanges={isMaster}
      />
    </AdminShell>
  );
}
