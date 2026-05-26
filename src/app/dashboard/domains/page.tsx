import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth";
import { canManageMasterResources } from "@/lib/permissions";


export default async function DomainsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  if (!canManageMasterResources(user)) {
    redirect("/dashboard");
  }

  redirect("/dashboard/domains/list");
}
