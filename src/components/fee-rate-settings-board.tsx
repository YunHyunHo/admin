"use client";

import { useState } from "react";

type FeeRateSettingsBoardProps = {
  companyName: string;
  initialFeeRate: number;
};

export function FeeRateSettingsBoard({
  companyName,
  initialFeeRate,
}: FeeRateSettingsBoardProps) {
  const [feeRate, setFeeRate] = useState(String(initialFeeRate));
  const [savedFeeRate, setSavedFeeRate] = useState(initialFeeRate);
  const [message, setMessage] = useState("현재 로그인 업체의 수수료 요율을 수정할 수 있습니다.");
  const [isSaving, setIsSaving] = useState(false);

  async function saveFeeRate() {
    setIsSaving(true);

    try {
      const response = await fetch("/api/settings/fee-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feeRate }),
      });

      const data = (await response.json()) as {
        feeRate?: number;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "수수료 요율 저장에 실패했습니다.");
      }

      setSavedFeeRate(data.feeRate ?? Number(feeRate));
      setMessage(data.message ?? "수수료 요율이 저장되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
          Fee Rate Settings
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-white">수수료 설정</h2>
        <p className="mt-3 text-sm leading-6 text-white/56">{message}</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/38">
              업체
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
              {companyName}
            </p>
          </article>
          <article className="rounded-3xl border border-cyan-400/16 bg-cyan-500/8 p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-100/48">
              현재 저장 요율
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-white">
              {savedFeeRate}%
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-[28px] border border-white/8 bg-black/18 p-5 sm:p-6">
        <label className="block max-w-sm">
          <span className="mb-2 block text-sm font-medium text-white/72">
            수수료 요율
          </span>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={feeRate}
              onChange={(event) => setFeeRate(event.target.value)}
              className="h-12 w-48 rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-lg font-semibold text-white outline-none"
            />
            <span className="text-lg font-semibold text-white/70">%</span>
          </div>
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveFeeRate}
            disabled={isSaving}
            className="h-11 rounded-2xl bg-cyan-500 px-5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            저장
          </button>
          <p className="flex items-center text-sm text-white/46">
            저장 후 정산/수수료 화면에서 조회하면 변경된 요율로 계산됩니다.
          </p>
        </div>
      </section>
    </div>
  );
}
