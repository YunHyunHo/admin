import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DomainSettlementBoard } from "@/components/domain-settlement-board";
import { getSessionUser } from "@/lib/auth";
import { getDefaultReportDateRange } from "@/lib/mock-report-service";
import { getDomainSettlementForUser } from "@/lib/settlement-repository";


export default async function DomainSettlementPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const defaultRange = getDefaultReportDateRange();
  const initialSettlement = await getDomainSettlementForUser(
    user,
    defaultRange.startDate,
    defaultRange.endDate,
  );

  return (
    <AdminShell
      user={user}
      activeItem="domain-settlement"
      badge="Domain Settlement"
      helperText="승인된 충전금액만 집계해서 날짜별 충전액과 수수료를 확인하는 화면입니다."
    >
      <DomainSettlementBoard
        initialFeeRate={0}
        domainName={initialSettlement.domainName}
        initialRows={initialSettlement.rows}
      />
    </AdminShell>
  );
}
