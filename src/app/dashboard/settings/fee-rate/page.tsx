import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { FeeRateSettingsBoard } from "@/components/fee-rate-settings-board";
import { getSessionUser } from "@/lib/auth";
import { getFeeRateSettingsForUser } from "@/lib/fee-rates-repository";
import { canManageMasterResources } from "@/lib/permissions";

export default async function FeeRateSettingsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }

  const feeRateSettings = await getFeeRateSettingsForUser(user);

  return (
    <AdminShell
      user={user}
      activeItem="fee-rate-settings"
      badge="Fee Rate"
      helperText="업체별 수수료 요율을 수정하고 정산 계산에 반영합니다."
    >
      <FeeRateSettingsBoard
        companyName={feeRateSettings.companyName}
        initialFeeRate={feeRateSettings.feeRate}
        initialRows={feeRateSettings.rows}
        canManageFeeRates={canManageMasterResources(user)}
      />
    </AdminShell>
  );
}
