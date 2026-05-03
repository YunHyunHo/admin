import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DomainExchangesBoard } from "@/components/domain-exchanges-board";
import { getSessionUser } from "@/lib/auth";

export default async function DomainExchangesPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem="domain-exchanges"
      badge="Domain Exchanges"
      helperText="도메인 기준 환전 요청을 확인하고 처리하는 화면입니다."
    >
      <DomainExchangesBoard />
    </AdminShell>
  );
}
