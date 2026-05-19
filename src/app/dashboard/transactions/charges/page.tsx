import { redirect } from "next/navigation";

import { ChargeRequestsBoard } from "@/components/charge-requests-board";
import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import { getChargeRequestsForUser } from "@/lib/charge-requests-repository";
import { hasDatabaseUrl } from "@/lib/db";
import { getDomainExchangeOptions } from "@/lib/domain-exchanges-repository";
import { canProcessRequests } from "@/lib/permissions";


export default async function ChargesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const companyRequests = await getChargeRequestsForUser(user);
  const domainOptions = await getDomainExchangeOptions(user);

  return (
    <AdminShell
      user={user}
      activeItem="charges"
      badge="Charge Requests"
      helperText="충전신청을 확인하고 상태값에 따라 승인내역과 거절내역으로 분기합니다."
    >
      <ChargeRequestsBoard
        initialPendingRequests={companyRequests.pending}
        initialApprovedRequests={companyRequests.approved}
        initialRejectedRequests={companyRequests.rejected}
        canProcessCharges={canProcessRequests(user)}
        isDatabaseBacked={hasDatabaseUrl()}
        domainOptions={domainOptions}
      />
    </AdminShell>
  );
}
