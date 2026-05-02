import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { FeeRateSettingsBoard } from "@/components/fee-rate-settings-board";
import { getSessionUser } from "@/lib/auth";
import { getFeeRateByCompanyFromSettings } from "@/lib/charge-utils";
import { getAdminSettingsFromCookie } from "@/lib/settings-cookie";

export default async function FeeRateSettingsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  const settings = await getAdminSettingsFromCookie();

  return (
    <AdminShell
      user={user}
      activeItem="fee-rate-settings"
      badge="Fee Rate"
      helperText="업체별 수수료 요율을 수정하고 정산 계산에 반영합니다."
    >
      <FeeRateSettingsBoard
        companyName={user.companyName}
        initialFeeRate={getFeeRateByCompanyFromSettings(user.companyName, settings)}
      />
    </AdminShell>
  );
}
