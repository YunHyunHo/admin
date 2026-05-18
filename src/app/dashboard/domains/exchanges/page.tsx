import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  DomainExchangesBoard,
  fallbackDomainExchanges,
} from "@/components/domain-exchanges-board";
import { getSessionUser } from "@/lib/auth";
import {
  getDomainExchangeCreateContext,
  getDomainExchangeOptions,
  getDomainExchangeRows,
} from "@/lib/domain-exchanges-repository";
import { canManageMasterResources } from "@/lib/permissions";

export default async function DomainExchangesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const isMaster = canManageMasterResources(user);
  const [exchangeRows, domainOptions, createContext] = await Promise.all([
    getDomainExchangeRows(fallbackDomainExchanges, user),
    getDomainExchangeOptions(user),
    isMaster
      ? Promise.resolve({
          defaultDomainId: null,
          currentBalance: 0,
          hasConnectedDomain: false,
        })
      : getDomainExchangeCreateContext(user),
  ]);

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
        defaultDomainId={createContext.defaultDomainId}
        currentBalance={createContext.currentBalance}
        hasConnectedDomain={createContext.hasConnectedDomain}
        canCreateExchanges={!isMaster}
        canProcessExchanges={isMaster}
      />
    </AdminShell>
  );
}
