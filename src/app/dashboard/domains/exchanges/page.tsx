import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  DomainExchangesBoard,
  fallbackDomainExchanges,
} from "@/components/domain-exchanges-board";
import { getSessionUser } from "@/lib/auth";
import { getDomainExchangeRows } from "@/lib/domain-exchanges-repository";
import { canProcessRequests } from "@/lib/permissions";

export default async function DomainExchangesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const exchangeRows = await getDomainExchangeRows(fallbackDomainExchanges);

  return (
    <AdminShell
      user={user}
      activeItem="domain-exchanges"
      badge="Domain Exchanges"
      helperText="도메인 기준 환전 요청을 확인하고 처리하는 화면입니다."
    >
      <DomainExchangesBoard
        initialRows={exchangeRows}
        canProcessExchanges={canProcessRequests(user)}
      />
    </AdminShell>
  );
}
