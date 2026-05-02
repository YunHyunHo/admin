import { redirect } from "next/navigation";

import { ChargeRequestsBoard } from "@/components/charge-requests-board";
import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import { getChargeRequestsByCompany } from "@/lib/mock-api-store";

export default async function ChargesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const companyRequests = getChargeRequestsByCompany(user.companyName);

  return (
    <AdminShell
      user={user}
      activeItem="charges"
      badge="Charge Requests"
      helperText="API가 연결되면 충전신청이 이 화면으로 들어오고 상태값에 따라 승인내역과 거절내역으로 분기됩니다."
    >
      <ChargeRequestsBoard
        initialPendingRequests={companyRequests.pending}
        initialApprovedRequests={companyRequests.approved}
        initialRejectedRequests={companyRequests.rejected}
      />
    </AdminShell>
  );
}
