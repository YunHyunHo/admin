import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin-shell";
import { TelegramSettingsBoard } from "@/components/telegram-settings-board";
import { getSessionUser } from "@/lib/auth";
import { canManageTelegramSettings, getTelegramSettings } from "@/lib/telegram-notifications";

export const dynamic = "force-dynamic";

export default async function TelegramSettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (!canManageTelegramSettings(user)) redirect("/dashboard");
  return <AdminShell user={user} activeItem="telegram-settings" badge="Telegram" helperText="도메인별 환전 승인 알림봇을 연결합니다."><TelegramSettingsBoard initialSettings={await getTelegramSettings(user)} /></AdminShell>;
}
