"use client";

import { useMemo, useState } from "react";

import type { DomainExchangeRow } from "@/lib/domain-exchanges-types";

export const fallbackDomainExchanges: DomainExchangeRow[] = [
  {
    id: "d8db523e-6114-45e7-8c38-718295f001",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 3_000_000,
    requestedAt: "05-03 16:28:45",
    completedAt: "05-03 16:29:59",
    status: "승인",
  },
  {
    id: "9a41e5f7-6e15-4daa-8a41-6cb07c2e002",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 3_600_000,
    requestedAt: "05-03 15:03:21",
    completedAt: "05-03 15:08:15",
    status: "승인",
  },
  {
    id: "1251afb8-961f-460e-8d0a-356cb76a003",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 7_900_000,
    requestedAt: "05-03 13:30:31",
    completedAt: "05-03 13:31:13",
    status: "승인",
  },
  {
    id: "f740d8a7-ff4d-4eb6-a6d0-f004",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 3_700_000,
    requestedAt: "05-03 12:46:28",
    completedAt: "05-03 12:48:36",
    status: "승인",
  },
  {
    id: "6de33401-8bf0-41cf-ac2d-25ff5074f005",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 3_300_000,
    requestedAt: "05-03 10:46:10",
    completedAt: "05-03 10:52:01",
    status: "승인",
  },
  {
    id: "81c12f10-73f6-4596-b384-2f9eb1ce006",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 4_000_000,
    requestedAt: "05-03 10:16:06",
    completedAt: "05-03 10:16:51",
    status: "승인",
  },
  {
    id: "ecca89f1-043b-44ff-9e2f-bb81cc98d007",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 3_500_000,
    requestedAt: "05-03 09:15:33",
    completedAt: "05-03 09:16:26",
    status: "승인",
  },
  {
    id: "599b930a-18f9-45d2-9378-1670213008",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 3_700_000,
    requestedAt: "05-03 08:34:09",
    completedAt: "05-03 08:35:04",
    status: "승인",
  },
  {
    id: "524ca3d6-3c1b-4a58-8511-d1744fe1009",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 4_300_000,
    requestedAt: "05-03 07:07:24",
    completedAt: "05-03 07:09:16",
    status: "승인",
  },
  {
    id: "c8270372-595e-4a92-91d3-ad3c4f6010",
    branch: "본사",
    topDistributor: "댕댕이",
    distributor: "수水",
    loginId: "ess1234",
    domain: "아이락스",
    bankName: "신한은행",
    accountHolder: "네이쳐블",
    accountNumber: "1400-1577-6715",
    amount: 3_300_000,
    requestedAt: "05-03 05:15:57",
    completedAt: "05-03 05:16:53",
    status: "승인",
  },
  {
    id: "67254170-2f3e-48e6-8a9c-320cad4011",
    branch: "본사",
    topDistributor: "코인뱅크",
    distributor: "시라소니",
    loginId: "kks1515",
    domain: "브이오",
    bankName: "국민은행",
    accountHolder: "1",
    accountNumber: "1",
    amount: 74_666_790,
    requestedAt: "05-03 00:00:52",
    completedAt: "05-03 00:00:57",
    status: "승인",
  },
  {
    id: "8423bdde-c6e4-4674-8245-2b69c4a0012",
    branch: "본사",
    topDistributor: "코인뱅크",
    distributor: "비비",
    loginId: "join1234",
    domain: "조인벳",
    bankName: "기업은행",
    accountHolder: "(주)한국중증장애인연합회",
    accountNumber: "296-116658-01-023",
    amount: 36_516_500,
    requestedAt: "05-03 00:00:48",
    completedAt: "05-03 00:00:58",
    status: "승인",
  },
];

const rowsPerPage = 10;

type DomainExchangesBoardProps = {
  initialRows?: DomainExchangeRow[];
  eyebrow?: string;
  title?: string;
  description?: string;
  canProcessExchanges?: boolean;
};

function normalizeExchangeRow(row: DomainExchangeRow): DomainExchangeRow {
  return {
    ...row,
    branch: row.distributor,
  };
}

function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")} 원`;
}

function getNowStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${month}-${date} ${hours}:${minutes}:${seconds}`;
}

export function DomainExchangesBoard({
  initialRows = fallbackDomainExchanges,
  eyebrow = "Domain Exchange",
  title = "도메인 환전",
  description = "도메인에서 들어온 환전 요청을 확인하고 승인/삭제 처리하는 화면입니다.",
  canProcessExchanges = true,
}: DomainExchangesBoardProps) {
  const [rows, setRows] = useState(initialRows.map(normalizeExchangeRow));
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const pageRows = useMemo(
    () => rows.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [rows, page],
  );

  async function persistExchangePatch(id: string, action: "approve" | "delete") {
    const response = await fetch("/api/domain-exchanges", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    const data = (await response.json()) as {
      rows?: DomainExchangeRow[];
      message?: string;
    };

    if (!response.ok) {
      setMessage(data.message ?? "환전 요청 처리 중 오류가 발생했습니다.");
      return;
    }

    if (data.rows) {
      setRows(data.rows.map(normalizeExchangeRow));
    }

    if (data.message) {
      setMessage(data.message);
    }
  }

  function approveRow(id: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              status: "승인",
              completedAt: row.completedAt || getNowStamp(),
            }
          : row,
      ),
    );
    void persistExchangePatch(id, "approve");
  }

  function deleteRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setPage((currentPage) => Math.min(currentPage, pageCount));
    void persistExchangePatch(id, "delete");
  }

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="border-b border-white/8 px-5 py-6 sm:px-6">
        <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-white/52">
          {description}
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {message ? (
          <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            {message}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
            <thead className="bg-black/52 text-white/72">
              <tr>
                {[
                  "ID",
                  "본사",
                  "상위총판",
                  "총판",
                  "로그인 ID",
                  "도메인",
                  "출금은행",
                  "예금주",
                  "계좌번호",
                  "요청금액",
                  "요청일",
                  "승인/거절",
                  "완료일",
                ].map((header) => (
                  <th
                    key={header}
                    className="border-b border-white/8 px-4 py-4 text-center font-semibold"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.length ? (
                pageRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/8 text-white/76 last:border-b-0"
                  >
                    <td className="max-w-[150px] px-4 py-4 font-mono text-xs text-white/56">
                      {row.id}
                    </td>
                    <td className="px-4 py-4 text-center">{row.branch}</td>
                    <td className="px-4 py-4 text-center">{row.topDistributor}</td>
                    <td className="px-4 py-4 text-center">{row.distributor}</td>
                    <td className="px-4 py-4 text-center">{row.loginId}</td>
                    <td className="px-4 py-4 text-center">{row.domain}</td>
                    <td className="px-4 py-4 text-center">{row.bankName}</td>
                    <td className="px-4 py-4 text-center">{row.accountHolder}</td>
                    <td className="px-4 py-4 text-center">{row.accountNumber}</td>
                    <td className="px-4 py-4 text-right font-semibold text-white">
                      {formatKoreanWon(row.amount)}
                    </td>
                    <td className="px-4 py-4 text-center">{row.requestedAt}</td>
                    <td className="px-4 py-4 text-center">
                      {canProcessExchanges ? (
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => approveRow(row.id)}
                            className="text-sm font-semibold text-blue-300 transition hover:text-blue-200"
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            className="rounded-lg bg-white px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-red-100"
                          >
                            삭제
                          </button>
                        </div>
                      ) : (
                        <span className="text-white/34">-</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">{row.completedAt || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-sm text-white/40">
                    조건에 맞는 환전 요청이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-center gap-2 border-t border-white/8 px-4 py-5">
            <button
              type="button"
              onClick={() => setPage(1)}
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
              disabled={page === 1}
            >
              |‹
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
              disabled={page === 1}
            >
              ‹
            </button>

            {Array.from({ length: Math.min(pageCount, 11) }, (_, index) => {
              const pageNumber = index + 1;

              return (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setPage(pageNumber)}
                  className={`h-10 min-w-10 rounded-xl px-3 font-semibold ${
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
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
              disabled={page === pageCount}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setPage(pageCount)}
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
              disabled={page === pageCount}
            >
              ›|
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
