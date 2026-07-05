import { redirect } from "next/navigation";

import { ChargeRequestsBoard } from "@/components/charge-requests-board";
import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";
import {
  getChargeRequestHistoryPageForUser,
  getPendingChargeRequestPageForUser,
  getChargeRequestsForUser,
} from "@/lib/charge-requests-repository";
import { getServerSyncCursor, hasDatabaseUrl } from "@/lib/db";
import { getDomainExchangeOptions } from "@/lib/domain-exchanges-repository";
import { isPerformancePilotUser } from "@/lib/performance-pilot";
import { canProcessRequests } from "@/lib/permissions";
import { isRealtimeSyncPilot } from "@/lib/realtime-sync-pilot";

type ChargeHistoryPage = {
  items: Awaited<ReturnType<typeof getChargeRequestHistoryPageForUser>>["items"];
  total: number;
  page: number;
  pageSize: number;
};

type ChargePendingPage = Awaited<
  ReturnType<typeof getPendingChargeRequestPageForUser>
>;

type ChargeRequestsPilotPayload = {
  pending: ChargePendingPage["items"];
  approved: ChargeHistoryPage["items"];
  rejected: ChargeHistoryPage["items"];
  pendingPage: ChargePendingPage;
  approvedPage: ChargeHistoryPage;
  rejectedPage: ChargeHistoryPage;
};

function hasPilotHistoryPages(
  value: Awaited<ReturnType<typeof getChargeRequestsForUser>> | ChargeRequestsPilotPayload,
): value is ChargeRequestsPilotPayload {
  return (
    "pendingPage" in value && "approvedPage" in value && "rejectedPage" in value
  );
}


export default async function ChargesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const incrementalSyncEnabled = isRealtimeSyncPilot(user);
  const serverHistoryEnabled = isPerformancePilotUser(user);
  const initialSyncCursor = incrementalSyncEnabled
    ? await getServerSyncCursor()
    : undefined;
  const [companyRequests, domainOptions] = await Promise.all([
    serverHistoryEnabled
      ? Promise.all([
          getPendingChargeRequestPageForUser(user),
          getChargeRequestHistoryPageForUser(user, { status: "approved" }),
          getChargeRequestHistoryPageForUser(user, { status: "rejected" }),
        ]).then(([pendingPage, approvedPage, rejectedPage]) => ({
          pending: pendingPage.items,
          approved: approvedPage.items,
          rejected: rejectedPage.items,
          pendingPage,
          approvedPage,
          rejectedPage,
        }))
      : getChargeRequestsForUser(user),
    getDomainExchangeOptions(user),
  ]);

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
        initialPendingPage={
          hasPilotHistoryPages(companyRequests)
            ? companyRequests.pendingPage
            : undefined
        }
        canProcessCharges={canProcessRequests(user)}
        isDatabaseBacked={hasDatabaseUrl()}
        domainOptions={domainOptions}
        incrementalSyncEnabled={incrementalSyncEnabled}
        initialSyncCursor={initialSyncCursor}
        serverHistoryEnabled={serverHistoryEnabled}
        initialApprovedHistoryPage={
          hasPilotHistoryPages(companyRequests)
            ? companyRequests.approvedPage
            : undefined
        }
        initialRejectedHistoryPage={
          hasPilotHistoryPages(companyRequests)
            ? companyRequests.rejectedPage
            : undefined
        }
      />
    </AdminShell>
  );
}
