"use client";

import { useState } from "react";

import { formatKoreanWon } from "@/lib/charge-utils";
import type { HeadquartersAccountSnapshot } from "@/lib/headquarters-withdrawals-repository";

type Props = {
  initialSnapshot: HeadquartersAccountSnapshot;
};

const emptyForm = {
  amount: "",
  bankName: "",
  accountHolder: "",
  accountNumber: "",
};

export function HeadquartersBalancePanel({ initialSnapshot }: Props) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [form, setForm] = useState(emptyForm);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submitWithdrawal() {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/headquarters-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount.replaceAll(",", "")),
        }),
      });
      const data = (await response.json()) as HeadquartersAccountSnapshot & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "본사 환전 처리에 실패했습니다.");
      }

      setSnapshot(data);
      setForm(emptyForm);
      setIsOpen(false);
      setMessage(data.message ?? "본사 환전 신청이 생성되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "본사 환전 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function processWithdrawal(id: string, action: "approve" | "reject" | "cancel") {
    const actionLabel = action === "approve" ? "승인" : action === "reject" ? "거절" : "승인취소";

    if (!window.confirm(`이 본사 환전 신청을 ${actionLabel}할까요?`)) return;

    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/headquarters-withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = (await response.json()) as HeadquartersAccountSnapshot & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "본사 환전 처리에 실패했습니다.");
      setSnapshot(data);
      setMessage(data.message ?? `본사 환전 신청이 ${actionLabel}되었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "본사 환전 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mb-6 rounded-[28px] border border-cyan-300/20 bg-cyan-400/[0.05] p-5 shadow-[0_20px_70px_rgba(0,0,0,0.28)] sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
            Headquarters Balance
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            본사 누적금액
          </h2>
          <p className="mt-2 text-sm text-white/45">
            본사 수수료를 누적하고 환전 신청·승인·지출 내역을 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setMessage("");
            setIsOpen(true);
          }}
          className="h-11 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          본사 환전
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["누적 본사 수수료", snapshot.earnedTotal],
          ["누적 환전 지출", snapshot.withdrawnTotal],
          ["현재 본사 잔액", snapshot.currentBalance],
          ["승인 대기 금액", snapshot.pendingTotal],
          ["환전 가능 금액", snapshot.availableBalance],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <dt className="text-xs text-white/45">{label}</dt>
            <dd className="mt-2 text-xl font-semibold text-white">
              {formatKoreanWon(Number(value))}
            </dd>
          </div>
        ))}
      </dl>

      {message ? <p className="mt-4 text-sm text-cyan-100/80">{message}</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-black/20 text-white/75">
            <tr>
              {["신청시간", "출금계좌", "환전금액", "환전 전", "환전 후", "상태", "처리"].map((head) => (
                <th key={head} className="border border-white/12 px-4 py-2 text-center font-semibold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.withdrawals.length ? (
              snapshot.withdrawals.map((row) => (
                <tr key={row.id} className="text-white/85">
                  <td className="border border-white/12 px-4 py-2 text-center">{row.requestedAt}</td>
                  <td className="border border-white/12 px-4 py-2">
                    {row.bankName} / {row.accountHolder} / {row.accountNumber}
                  </td>
                  <td className="border border-white/12 px-4 py-2 text-right">{formatKoreanWon(row.amount)}</td>
                  <td className="border border-white/12 px-4 py-2 text-right">{formatKoreanWon(row.beforeBalance)}</td>
                  <td className="border border-white/12 px-4 py-2 text-right">{formatKoreanWon(row.afterBalance)}</td>
                  <td className="border border-white/12 px-4 py-2 text-center text-emerald-300">{row.status}</td>
                  <td className="border border-white/12 px-4 py-2 text-center">
                    {row.status === "승인중" ? (
                      <div className="flex justify-center gap-2">
                        <button type="button" disabled={isSubmitting} onClick={() => void processWithdrawal(row.id, "approve")} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">승인</button>
                        <button type="button" disabled={isSubmitting} onClick={() => void processWithdrawal(row.id, "reject")} className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">거절</button>
                      </div>
                    ) : row.status === "승인" ? (
                      <button type="button" disabled={isSubmitting} onClick={() => void processWithdrawal(row.id, "cancel")} className="rounded-lg bg-slate-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">승인취소</button>
                    ) : "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="border border-white/12 px-4 py-8 text-center text-white/40">
                  본사 환전 신청내역이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-[28px] bg-white p-6 text-slate-950 shadow-2xl sm:p-8">
            <h3 className="text-2xl font-bold">본사 환전신청</h3>
            <p className="mt-2 text-sm text-slate-500">
              현재 환전 가능 금액: {formatKoreanWon(snapshot.availableBalance)}
            </p>
            <div className="mt-6 space-y-3">
              {[
                ["amount", "환전금액", "number"],
                ["bankName", "출금은행", "text"],
                ["accountHolder", "예금주", "text"],
                ["accountNumber", "계좌번호", "text"],
              ].map(([key, placeholder, type]) => (
                <input
                  key={key}
                  type={type}
                  min={key === "amount" ? 1 : undefined}
                  value={form[key as keyof typeof form]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={placeholder}
                  className="h-12 w-full rounded-xl border border-slate-300 px-4 outline-none transition focus:border-blue-500"
                />
              ))}
            </div>
            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="h-11 rounded-xl bg-red-600 px-6 font-semibold text-white disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void submitWithdrawal()}
                disabled={isSubmitting}
                className="h-11 rounded-xl bg-blue-600 px-6 font-semibold text-white disabled:opacity-50"
              >
                {isSubmitting ? "처리 중" : "신청"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
