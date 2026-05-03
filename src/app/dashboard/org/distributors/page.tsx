import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { DistributorsBoard } from "@/components/distributors-board";
import { getSessionUser } from "@/lib/auth";

export default async function DistributorsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem="org-distributors"
      badge="Organization"
      helperText="총판 생성과 목록 관리를 실제 화면으로 구성했습니다."
    >
      <DistributorsBoard />
    </AdminShell>
  );
}
