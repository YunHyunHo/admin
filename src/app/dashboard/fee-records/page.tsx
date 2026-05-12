import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { FeeRecordsBoard } from "@/components/fee-records-board";
import { getSessionUser } from "@/lib/auth";
import { getDefaultReportDateRange } from "@/lib/mock-report-service";
import { getFeeRecordsForUser } from "@/lib/fee-records-repository";

export default async function FeeRecordsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const defaultRange = getDefaultReportDateRange();
  const initialRecords = await getFeeRecordsForUser(
    user,
    defaultRange.startDate,
    defaultRange.endDate,
  );

  return (
    <AdminShell
      user={user}
      activeItem="fee-records"
      badge="Fee Records"
      helperText="승인 완료 거래 기준으로 발생한 수수료 내역을 확인하는 화면입니다."
    >
      <FeeRecordsBoard
        companyName={user.companyName}
        initialRows={initialRecords.rows}
      />
    </AdminShell>
  );
}
