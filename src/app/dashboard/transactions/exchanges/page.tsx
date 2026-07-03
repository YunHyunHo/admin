import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import {
  DomainExchangesBoard,
  fallbackDomainExchanges,
} from "@/components/domain-exchanges-board";
import { getSessionUser } from "@/lib/auth";
import { getDomainExchangeRows } from "@/lib/domain-exchanges-repository";
import { canProcessRequests } from "@/lib/permissions";
import { isRealtimeSyncPilot } from "@/lib/realtime-sync-pilot";
import { getServerSyncCursor } from "@/lib/db";


export default async function ExchangesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const incrementalSyncEnabled = isRealtimeSyncPilot(user);
  const initialSyncCursor = incrementalSyncEnabled
    ? await getServerSyncCursor()
    : undefined;
  const exchangeRows = await getDomainExchangeRows(fallbackDomainExchanges, user);

  return (
    <AdminShell
      user={user}
      activeItem="exchanges"
      badge="Exchange Requests"
      helperText="API로 들어온 환전신청을 승인/거절/완료 처리하는 화면입니다."
    >
      <DomainExchangesBoard
        initialRows={exchangeRows}
        eyebrow="Exchange Requests"
        title="환전신청"
        description="환전 신청 내역을 확인하고 승인/삭제 처리하는 화면입니다."
        canProcessExchanges={canProcessRequests(user)}
        incrementalSyncEnabled={incrementalSyncEnabled}
        initialSyncCursor={initialSyncCursor}
      />
    </AdminShell>
  );
}
