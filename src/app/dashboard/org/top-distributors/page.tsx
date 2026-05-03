import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { TopDistributorsBoard } from "@/components/top-distributors-board";
import { getSessionUser } from "@/lib/auth";

export default async function TopDistributorsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem="org-top-distributors"
      badge="Organization"
      helperText="상위총판 생성과 목록 관리를 먼저 실제 화면으로 구성했습니다."
    >
      <TopDistributorsBoard />
    </AdminShell>
  );
}
