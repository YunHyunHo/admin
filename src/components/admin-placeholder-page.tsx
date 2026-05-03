import { redirect } from "next/navigation";

import { AdminPlaceholderBoard } from "@/components/admin-placeholder-board";
import { AdminShell } from "@/components/admin-shell";
import { getSessionUser } from "@/lib/auth";

type PlaceholderPageProps = {
  activeItem: string;
  badge: string;
  helperText: string;
  eyebrow: string;
  title: string;
  description: string;
  columns: Array<{
    label: string;
    value: string;
  }>;
  nextSteps: string[];
};

export async function AdminPlaceholderPage({
  activeItem,
  badge,
  helperText,
  eyebrow,
  title,
  description,
  columns,
  nextSteps,
}: PlaceholderPageProps) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AdminShell
      user={user}
      activeItem={activeItem}
      badge={badge}
      helperText={helperText}
    >
      <AdminPlaceholderBoard
        eyebrow={eyebrow}
        title={title}
        description={description}
        columns={columns}
        nextSteps={nextSteps}
      />
    </AdminShell>
  );
}
