"use client";

import { useState } from "react";

type Setting = { domainId: string; companyName: string; domainName: string; botUsername: string | null; chatTitle: string | null; connected: boolean; startUrl: string | null };

export function TelegramSettingsBoard({ initialSettings }: { initialSettings: Setting[] }) {
  const [settings, setSettings] = useState(initialSettings);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("도메인별 전용 봇만 해당 도메인의 환전 승인 알림을 받습니다.");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: string, domainId: string) {
    setBusy(`${domainId}:${action}`);
    try {
      const response = await fetch("/api/settings/telegram", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, domainId, token: tokens[domainId] }),
      });
      const data = (await response.json()) as { message?: string; settings?: Setting[] };
      setMessage(data.message ?? (response.ok ? "처리되었습니다." : "처리에 실패했습니다."));
      if (response.ok && data.settings) {
        setSettings(data.settings);
        if (action === "save-token") setTokens((current) => ({ ...current, [domainId]: "" }));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-white/8 bg-[#10131a] p-5 sm:p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">Telegram</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">텔레그램 알림봇</h2>
      <p className="mt-3 text-sm leading-6 text-white/55">{message}</p>
      <div className="mt-6 space-y-4">
        {settings.map((setting) => (
          <article key={setting.domainId} className="rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-semibold text-white">{setting.companyName}</h3><p className="mt-1 text-xs text-white/45">도메인 {setting.domainName} · {setting.connected ? `연결됨 · ${setting.chatTitle}` : setting.botUsername ? `@${setting.botUsername} · 채팅방 연결 대기` : "연결되지 않음"}</p></div>
              <span className={`rounded-full px-3 py-1 text-xs ${setting.connected ? "bg-emerald-400/15 text-emerald-200" : "bg-white/5 text-white/45"}`}>{setting.connected ? "사용중" : "대기"}</span>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="password" value={tokens[setting.domainId] ?? ""} onChange={(event) => setTokens((current) => ({ ...current, [setting.domainId]: event.target.value }))} placeholder="BotFather에서 발급받은 봇 토큰" className="h-11 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none" />
              <button type="button" onClick={() => void run("save-token", setting.domainId)} disabled={busy !== null} className="h-11 rounded-2xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40">봇 확인</button>
            </div>
            {setting.botUsername ? <div className="mt-4 rounded-2xl border border-white/8 bg-black/15 p-4 text-sm text-white/65"><p>1. 아래 도메인 전용 링크로 텔레그램 봇을 엽니다.</p><p className="mt-1">2. 텔레그램의 <strong className="text-white">시작</strong> 버튼을 누른 뒤 연결을 확인합니다.</p><div className="mt-3 flex flex-wrap gap-2">{setting.startUrl ? <a href={setting.startUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-cyan-300/20 px-4 py-2 font-semibold text-cyan-100">@{setting.botUsername} 열기</a> : null}<button type="button" onClick={() => void run("connect-chat", setting.domainId)} disabled={busy !== null} className="rounded-xl bg-fuchsia-500 px-4 py-2 font-semibold text-white disabled:opacity-40">채팅방 연결 확인</button>{setting.connected ? <button type="button" onClick={() => void run("test", setting.domainId)} disabled={busy !== null} className="rounded-xl border border-white/10 px-4 py-2 font-semibold text-white disabled:opacity-40">테스트 알림</button> : null}</div></div> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
