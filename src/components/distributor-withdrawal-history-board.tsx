"use client";

import { useMemo, useState } from "react";

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

function truncateId(value: string) {
  return value.length > 18 ? `${value.slice(0, 18)}...` : value;
}

export function DistributorWithdrawalHistoryBoard({
  initialRows = fallbackDistributorWithdrawals,
}: {
  initialRows?: WithdrawalRow[];
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(initialRows.length / rowsPerPage));
  const pageRows = useMemo(
    () => initialRows.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [initialRows, page],
  );

  return (
    <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,18,18,0.95)_0%,_rgba(14,14,16,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
      <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
        총판 환전내역
      </h2>

      <div className="mt-5 overflow-hidden border border-white/24 bg-black/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1580px] border-collapse text-sm">
            <thead className="bg-black/68 text-white">
              <tr>
                {[
                  "ID",
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
                  <td className="border border-white/18 px-3 py-4 text-center font-mono text-xs">
                    {truncateId(row.id)}
                  </td>
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
                    <button
                      type="button"
                      className="block w-full text-sm font-semibold text-sky-400 transition hover:text-sky-300"
                    >
                      승인
                    </button>
                    <button
                      type="button"
                      className="mt-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
                    >
                      승인취소
                    </button>
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
    </section>
  );
}
