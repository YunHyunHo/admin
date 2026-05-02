import { redirect } from "next/navigation";

import { ChargeRequestsBoard } from "@/components/charge-requests-board";
import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import {
  approvedRequests,
  filterRequestsByCompany,
  pendingRequests,
  rejectedRequests,
} from "@/lib/mock-charge-data";

export default async function ChargesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const companyPendingRequests = filterRequestsByCompany(
    pendingRequests,
    user.companyName,
  );
  const companyApprovedRequests = filterRequestsByCompany(
    approvedRequests,
    user.companyName,
  );
  const companyRejectedRequests = filterRequestsByCompany(
    rejectedRequests,
    user.companyName,
  );

  return (
    <AdminShell
      user={user}
      activeItem="charges"
      badge="Charge Requests"
      helperText="API가 연결되면 충전신청이 이 화면으로 들어오고 상태값에 따라 승인내역과 거절내역으로 분기됩니다."
    >
      <ChargeRequestsBoard
        initialPendingRequests={companyPendingRequests}
        initialApprovedRequests={companyApprovedRequests}
        initialRejectedRequests={companyRejectedRequests}
      />
    </AdminShell>
  );
}
