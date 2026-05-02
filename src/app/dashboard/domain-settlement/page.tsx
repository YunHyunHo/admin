import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DomainSettlementBoard } from "@/components/domain-settlement-board";
import { getSessionUser } from "@/lib/auth";
import {
  getDomainNameByCompany,
  getFeeRateByCompany,
} from "@/lib/charge-utils";
import {
  getDefaultReportDateRange,
  getDomainSettlement,
} from "@/lib/mock-report-service";
import { getMockChargeStateFromCookie } from "@/lib/mock-state-cookie";

export default async function DomainSettlementPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const defaultRange = getDefaultReportDateRange();
  const state = await getMockChargeStateFromCookie();
  const initialSettlement = getDomainSettlement(
    user.companyName,
    defaultRange.startDate,
    defaultRange.endDate,
    state,
  );

  return (
    <AdminShell
      user={user}
      activeItem="domain-settlement"
      badge="Domain Settlement"
      helperText="승인된 충전금액만 집계해서 날짜별 충전액과 수수료를 확인하는 화면입니다."
    >
      <DomainSettlementBoard
        companyName={user.companyName}
        initialFeeRate={getFeeRateByCompany(user.companyName)}
        domainName={getDomainNameByCompany(user.companyName)}
        initialRows={initialSettlement.rows}
      />
    </AdminShell>
  );
}
