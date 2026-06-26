"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  requestNotificationSyncEventName,
  requestNotifierRefreshEventName,
  type RequestNotificationSyncDetail,
} from "@/components/global-request-notifier";
import { ModalFeedback } from "@/components/modal-feedback";
import type { DistributorWithdrawalRow } from "@/lib/distributor-withdrawals-repository";

type WithdrawalRow = DistributorWithdrawalRow;

export const fallbackDistributorWithdrawals: WithdrawalRow[] = [
  {
    id: "54ae4810-43dc-11f1-becc-5db9d4a75a34",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 2_407_353,
    requestedAt: "04-30 00:01:41",
    completedAt: "04-30 00:01:46",
    status: "승인",
  },
  {
    id: "3fa39fb0-43dc-11f1-bb22-c7e3549dae57",
    topDistributor: "비비",
    withdrawalBranch: "비랜드오실장",
    currentBalance: 0,
    requester: "비랜드 오실장",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 1_166_141,
    requestedAt: "04-30 00:01:06",
    completedAt: "04-30 00:01:12",
    status: "승인",
  },
  {
    id: "06bcab10-43dc-11f1-bb22-c7e3549dae57",
    topDistributor: "-",
    withdrawalBranch: "비비",
    currentBalance: 1_580_937,
    requester: "비비",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 24_000_000,
    requestedAt: "04-29 23:59:31",
    completedAt: "04-29 23:59:40",
    status: "승인",
  },
  {
    id: "0a27a910-42f8-11f1-a887-cf356ea1a1b4",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "국민은행",
    accountHolder: "3",
    accountNumber: "3",
    requestAmount: 825_000,
    requestedAt: "04-28 20:47:31",
    completedAt: "04-28 20:47:32",
    status: "승인",
  },
  {
    id: "0d55a260-42f6-11f1-a56e-eb6aca565922",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "우리은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 750_000,
    requestedAt: "04-28 20:33:17",
    completedAt: "04-28 20:33:18",
    status: "승인",
  },
  {
    id: "5e639f30-3d93-11f1-ba22-fd872ecf38f7",
    topDistributor: "비비",
    withdrawalBranch: "비랜드오실장",
    currentBalance: 0,
    requester: "비랜드 오실장",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 4_360_000,
    requestedAt: "04-22 00:04:17",
    completedAt: "04-22 00:04:17",
    status: "승인",
  },
  {
    id: "4c052b10-3d93-11f1-ba22-fd872ecf38f7",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 10_360_000,
    requestedAt: "04-22 00:03:47",
    completedAt: "04-22 00:03:50",
    status: "승인",
  },
  {
    id: "b6c2d690-3d7b-11f1-86be-f5c6a8e40001",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 950_000,
    requestedAt: "04-21 21:14:58",
    completedAt: "04-21 21:15:02",
    status: "승인",
  },
  {
    id: "ca783500-3992-11f1-89c7-5152312d9c91",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 1_750_000,
    requestedAt: "04-16 21:50:05",
    completedAt: "04-16 21:50:08",
    status: "승인",
  },
  {
    id: "192ac860-38e0-11f1-9b81-d93dd080c4b7",
    topDistributor: "-",
    withdrawalBranch: "코인뱅크",
    currentBalance: 8_759_463,
    requester: "코인뱅크",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 10_220_000,
    requestedAt: "04-16 00:30:57",
    completedAt: "04-16 00:31:09",
    status: "승인",
  },
  {
    id: "f557c070-3338-11f1-ab8d-0b630cce95b9",
    topDistributor: "-",
    withdrawalBranch: "비비",
    currentBalance: 1_580_937,
    requester: "비비",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    requestAmount: 70_000_000,
    requestedAt: "04-08 19:51:55",
    completedAt: "04-08 19:53:34",
    status: "승인",
  },
  {
    id: "8a790a70-31c6-11f1-bd29-b92abfd653d9",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "국민은행",
    accountHolder: "ㅈ",
    accountNumber: "2",
    requestAmount: 1_500_000,
    requestedAt: "04-06 23:40:22",
    completedAt: "04-06 23:40:24",
    status: "승인",
  },
  {
    id: "f7729630-2d0e-11f1-9ffa-791b5e5154cb",
    topDistributor: "비비",
    withdrawalBranch: "에이원 오실장",
    currentBalance: 0,
    requester: "에이원 오실장",
    bankName: "국민은행",
    accountHolder: "ㄷ",
    accountNumber: "1",
    requestAmount: 1_250_000,
    requestedAt: "03-31 23:36:12",
    completedAt: "03-31 23:36:14",
    status: "승인",
  },
  {
    id: "99dca370-2c47-11f1-84dc-bfff992398e6",
    topDistributor: "댕댕이",
    withdrawalBranch: "수水",
    currentBalance: 242_794,
    requester: "수水",
    bankName: "국민은행",
    accountHolder: "ㄷ",
    accountNumber: "2",
    requestAmount: 1_000_000,
    requestedAt: "03-30 23:49:06",
    completedAt: "03-30 23:49:07",
    status: "승인",
  },
  {
    id: "55653e20-2c45-11f1-84dc-bfff992398e6",
    topDistributor: "비비",
    withdrawalBranch: "비랜드오실장",
    currentBalance: 0,
    requester: "비랜드 오실장",
    bankName: "우리은행",
    accountHolder: "4",
    accountNumber: "4",
    requestAmount: 500_000,
    requestedAt: "03-30 23:32:52",
    completedAt: "03-30 23:32:59",
    status: "승인",
  },
];

const rowsPerPage = 10;

function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")} 원`;
}

function getPendingWithdrawalSignature(rows: WithdrawalRow[]) {
  return rows
    .filter((row) => row.status === "승인중")
    .map((row) => row.id)
    .sort()
    .join(",");
}

export function DistributorWithdrawalHistoryBoard({
  initialRows = fallbackDistributorWithdrawals,
  canCreateWithdrawals = false,
  canProcessWithdrawals = false,
}: {
  initialRows?: WithdrawalRow[];
  canCreateWithdrawals?: boolean;
  canProcessWithdrawals?: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createModalMessage, setCreateModalMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const pendingSignatureRef = useRef(
    getPendingWithdrawalSignature(initialRows),
  );
  const refreshRowsPromiseRef = useRef<Promise<void> | null>(null);
  const needsRefreshRowsRef = useRef(false);
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const pageRows = useMemo(
    () => rows.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [rows, page],
  );

  const refreshRows = useCallback(async () => {
    if (refreshRowsPromiseRef.current) {
      needsRefreshRowsRef.current = true;
      return refreshRowsPromiseRef.current;
    }

    const refreshPromise = (async () => {
      do {
        needsRefreshRowsRef.current = false;
        const response = await fetch("/api/distributor-withdrawals", {
          cache: "no-store",
        });
        const data = (await response.json().catch(() => null)) as {
          rows?: WithdrawalRow[];
        } | null;

        if (response.ok && data?.rows) {
          pendingSignatureRef.current = getPendingWithdrawalSignature(data.rows);
          setRows(data.rows);
        }
      } while (needsRefreshRowsRef.current);
    })().finally(() => {
      refreshRowsPromiseRef.current = null;
    });

    refreshRowsPromiseRef.current = refreshPromise;
    return refreshPromise;
  }, []);

  useEffect(() => {
    function handleNotificationSync(event: Event) {
      const snapshot = (event as CustomEvent<RequestNotificationSyncDetail>)
        .detail;
      const pendingIds = snapshot?.pendingIds?.distributorWithdrawals;

      if (!Array.isArray(pendingIds)) {
        return;
      }

      const nextSignature = [...pendingIds].sort().join(",");

      if (nextSignature === pendingSignatureRef.current) {
        return;
      }

      pendingSignatureRef.current = nextSignature;
      snapshot.waitUntil(refreshRows());
    }

    window.addEventListener(
      requestNotificationSyncEventName,
      handleNotificationSync,
    );

    return () => {
      window.removeEventListener(
        requestNotificationSyncEventName,
        handleNotificationSync,
      );
    };
  }, [refreshRows]);

  async function createWithdrawal() {
    if (isSubmitting) {
      return;
    }

    const numericAmount = Number(amount.replaceAll(",", ""));

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setCreateModalMessage("환전금액을 확인해주세요.");
      return;
    }

    if (!bankName.trim() || !accountHolder.trim() || !accountNumber.trim()) {
      setCreateModalMessage("출금은행, 예금주, 계좌번호를 모두 입력해주세요.");
      return;
    }

    setIsSubmitting(true);
    setCreateModalMessage("");

    try {
      const response = await fetch("/api/distributor-withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount,
          bankName,
          accountHolder,
          accountNumber,
        }),
      });
      const data = (await response.json()) as {
        rows?: WithdrawalRow[];
        message?: string;
      };

      if (!response.ok) {
        setCreateModalMessage(data.message ?? "총판 환전 신청 중 오류가 발생했습니다.");
        return;
      }

      if (data.rows) {
        pendingSignatureRef.current = getPendingWithdrawalSignature(data.rows);
        setRows(data.rows);
      }
      window.dispatchEvent(new Event(requestNotifierRefreshEventName));

      setPage(1);
      setAmount("");
      setBankName("");
      setAccountHolder("");
      setAccountNumber("");
      setMessage(data.message ?? "총판 환전 신청이 생성되었습니다.");
      setIsCreateModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function processWithdrawal(id: string, action: "approve" | "reject" | "cancel") {
    if (
      action === "approve" &&
      !window.confirm("이 총판 환전 요청을 승인할까요? 승인하면 총판 보유금에서 요청금액이 차감됩니다.")
    ) {
      return;
    }

    if (
      action === "cancel" &&
      !window.confirm("이미 승인된 총판 환전 요청을 승인취소할까요? 차감했던 보유금이 다시 복구됩니다.")
    ) {
      return;
    }

    const response = await fetch("/api/distributor-withdrawals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = (await response.json()) as {
      rows?: WithdrawalRow[];
      message?: string;
    };

    if (!response.ok) {
      setMessage(data.message ?? "총판 환전 요청 처리 중 오류가 발생했습니다.");
      return;
    }

    if (data.rows) {
      pendingSignatureRef.current = getPendingWithdrawalSignature(data.rows);
      setRows(data.rows);
    }
    window.dispatchEvent(new Event(requestNotifierRefreshEventName));

    setMessage(
      data.message ??
        (action === "approve"
          ? "총판 환전 요청이 승인되었습니다."
          : action === "reject"
            ? "총판 환전 요청이 거절되었습니다."
            : "총판 환전 요청이 승인취소되었습니다."),
    );
  }

  return (
    <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,18,18,0.95)_0%,_rgba(14,14,16,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
          총판 환전내역
        </h2>
        {canCreateWithdrawals ? (
            <button
              type="button"
              onClick={() => {
                setCreateModalMessage("");
                setIsCreateModalOpen(true);
              }}
              className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400"
            >
            환전신청
          </button>
        ) : null}
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
          {message}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden border border-white/24 bg-black/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1580px] border-collapse text-sm">
            <thead className="bg-black/68 text-white">
              <tr>
                {[
                  "상위총판",
                  "환전신청 지점",
                  "보유액",
                  "신청자",
                  "출금은행",
                  "예금주",
                  "계좌번호",
                  "요청금액",
                  "요청일",
                  "승인/거절",
                  "완료일",
                ].map((head) => (
                  <th
                    key={head}
                    className="border border-white/24 px-4 py-4 text-center text-xs font-semibold text-white/90"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/16 bg-white/[0.035] text-white/86 last:border-b-0"
                >
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.topDistributor}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.withdrawalBranch}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-right">
                    {formatKoreanWon(row.currentBalance)}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.requester}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.bankName}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center font-semibold">
                    {row.accountHolder}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center font-semibold">
                    {row.accountNumber}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-right">
                    {formatKoreanWon(row.requestAmount)}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.requestedAt}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {canProcessWithdrawals && row.status === "승인중" ? (
                      <div className="flex flex-col items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void processWithdrawal(row.id, "approve")}
                          className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          onClick={() => void processWithdrawal(row.id, "reject")}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
                        >
                          거절
                        </button>
                      </div>
                    ) : canProcessWithdrawals && row.status === "승인" ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-white/70">{row.status}</span>
                        <button
                          type="button"
                          onClick={() => void processWithdrawal(row.id, "cancel")}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
                        >
                          승인취소
                        </button>
                      </div>
                    ) : (
                      <span className="text-white/70">{row.status}</span>
                    )}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.completedAt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-center gap-2 border-t border-white/18 px-4 py-5">
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={page === 1}
            className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
          >
            |‹
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
          >
            ‹
          </button>

          {Array.from({ length: Math.min(pageCount, 5) }, (_, index) => {
            const pageNumber = index + 1;

            return (
              <button
                key={pageNumber}
                type="button"
                onClick={() => setPage(pageNumber)}
                className={`h-10 min-w-10 rounded-xl px-3 text-lg font-semibold ${
                  page === pageNumber
                    ? "bg-white text-slate-950"
                    : "bg-black text-white"
                }`}
              >
                {pageNumber}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            disabled={page === pageCount}
            className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setPage(pageCount)}
            disabled={page === pageCount}
            className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
          >
            ›|
          </button>
        </div>
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[520px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-xl font-semibold tracking-[-0.03em]">
              총판 환전신청
            </h3>

            <div className="mt-7 space-y-4">
              <ModalFeedback message={createModalMessage} />
              <label className="block">
                <span className="sr-only">환전금액</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="환전금액"
                  inputMode="numeric"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">출금은행</span>
                <input
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  placeholder="출금은행"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">예금주</span>
                <input
                  value={accountHolder}
                  onChange={(event) => setAccountHolder(event.target.value)}
                  placeholder="예금주"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">계좌번호</span>
                <input
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  placeholder="계좌번호"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>
            </div>

            <div className="mt-10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void createWithdrawal()}
                disabled={isSubmitting}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSubmitting ? "신청 중" : "신청"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateModalMessage("");
                  setIsCreateModalOpen(false);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
