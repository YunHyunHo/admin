import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { SettlementProfitBoard } from "@/components/settlement-profit-board";
import { getSessionUser } from "@/lib/auth";
import { getDefaultReportDateRange } from "@/lib/mock-report-service";
import { getSettlementProfitForUser } from "@/lib/settlement-repository";

export default async function SettlementProfitPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const defaultRange = getDefaultReportDateRange();
  const initialProfit = await getSettlementProfitForUser(
    user,
    defaultRange.startDate,
    defaultRange.endDate,
  );

  return (
    <AdminShell
      user={user}
      activeItem="settlement-profit"
      badge="Settlement Profit"
      helperText="승인 완료된 충전 데이터 기준으로 본사/총판 수익을 확인하는 화면입니다."
    >
      <SettlementProfitBoard
        companyName={user.companyName}
        initialDomainName={initialProfit.domainName}
        initialRows={initialProfit.rows}
        initialTotals={initialProfit.totals}
      />
    </AdminShell>
  );
}
