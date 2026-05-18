import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { canManageMasterResources } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }
  redirect("/dashboard/org/top-distributors");
}
