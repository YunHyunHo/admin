"use client";

import { useMemo, useState } from "react";

import { downloadExcelTable } from "@/lib/csv-export";
import type { LedgerRow } from "@/lib/transaction-ledger-types";

export const fallbackLedgerRows: LedgerRow[] = [
  {
    id: "338352730",
    branch: "본사",
    userId: "j10IROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "조용준",
    amount: 50_000,
    requestedAt: "05-03 17:42:21",
    completedAt: "05-03 17:42:42",
    status: "완료",
  },
  {
    id: "236564096",
    branch: "본사",
    userId: "uwjIROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "최경원",
    amount: 10_000,
    requestedAt: "05-03 17:39:37",
    completedAt: "05-03 17:40:09",
    status: "완료",
  },
  {
    id: "1a20b5a4-af94",
    branch: "본사",
    userId: "업체 환전",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "네이쳐블",
    amount: 7_100_000,
    requestedAt: "05-03 17:32:29",
    completedAt: "05-03 17:34:11",
    status: "완료",
  },
  {
    id: "537557798",
    branch: "본사",
    userId: "HellROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "고성권",
    amount: 3_000_000,
    requestedAt: "05-03 17:31:59",
    completedAt: "05-03 17:32:04",
    status: "완료",
  },
  {
    id: "648097421",
    branch: "본사",
    userId: "wlsIROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "박진오",
    amount: 600_000,
    requestedAt: "05-03 17:30:56",
    completedAt: "05-03 17:31:19",
    status: "완료",
  },
  {
    id: "937066067",
    branch: "본사",
    userId: "djalROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "염경동",
    amount: 1_000_000,
    requestedAt: "05-03 17:29:51",
    completedAt: "05-03 17:30:09",
    status: "완료",
  },
  {
    id: "903803275",
    branch: "본사",
    userId: "MnlIROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "함영철",
    amount: 10_000,
    requestedAt: "05-03 17:19:38",
    completedAt: "05-03 17:19:54",
    status: "완료",
  },
  {
    id: "888719028",
    branch: "본사",
    userId: "cwgIROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "최용건",
    amount: 10_000,
    requestedAt: "05-03 17:16:37",
    completedAt: "05-03 17:16:41",
    status: "완료",
  },
  {
    id: "549492544",
    branch: "본사",
    userId: "tealROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "임정민",
    amount: 10_000,
    requestedAt: "05-03 17:14:40",
    completedAt: "05-03 17:14:44",
    status: "완료",
  },
  {
    id: "491818749",
    branch: "본사",
    userId: "ksklROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "김성겸",
    amount: 10_000,
    requestedAt: "05-03 17:14:38",
    completedAt: "05-03 17:14:43",
    status: "완료",
  },
  {
    id: "129954054",
    branch: "본사",
    userId: "djalROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "염경동",
    amount: 1_000_000,
    requestedAt: "05-03 17:12:51",
    completedAt: "05-03 17:12:57",
    status: "완료",
  },
  {
    id: "506553381",
    branch: "본사",
    userId: "kisIROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "박기돈",
    amount: 100_000,
    requestedAt: "05-03 17:12:32",
    completedAt: "05-03 17:12:38",
    status: "완료",
  },
  {
    id: "429524801",
    branch: "본사",
    userId: "boolROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "박범일",
    amount: 10_000,
    requestedAt: "05-03 17:11:03",
    completedAt: "05-03 17:11:16",
    status: "완료",
  },
  {
    id: "975678778",
    branch: "본사",
    userId: "todIROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "남화평",
    amount: 60_000,
    requestedAt: "05-03 17:03:15",
    completedAt: "05-03 17:03:28",
    status: "완료",
  },
  {
    id: "836924537",
    branch: "본사",
    userId: "kimIROCKS",
    topDistributor: "댕댕이",
    distributor: "수水",
    domain: "아이락스",
    bankInfo: "신한은행 / 010-805521-6565 / 오승택 (오픈뱅킹.타명의.ATM 입금불가)",
    depositor: "김학모",
    amount: 100_000,
    requestedAt: "05-03 16:57:13",
    completedAt: "05-03 16:57:22",
    status: "완료",
  },
];

const rowsPerPage = 10;

type TransactionLedgerBoardProps = {
  initialRows?: LedgerRow[];
};

function normalizeLedgerRows(rows: LedgerRow[]) {
  return rows.map((row) => ({
    ...row,
    branch: row.distributor,
    transactionType:
      row.transactionType ?? (row.userId === "업체 환전" ? "환전" : "충전"),
    companyName: row.companyName ?? (row.domain === "-" ? row.distributor : row.domain),
    bankName: row.bankName ?? row.bankInfo.split(" / ")[0] ?? "-",
    accountNumber: row.accountNumber ?? row.bankInfo.split(" / ")[1] ?? "-",
    accountHolder: row.accountHolder ?? row.bankInfo.split(" / ")[2] ?? "-",
    fee: row.fee ?? 0,
  }));
}

function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")} 원`;
}

function dateToNumber(value: string) {
  const datePart = value.trim().split(" ")[0] ?? "";
  const parts = datePart.split("-");
  const [month, day] =
    parts.length === 3 ? parts.slice(1).map(Number) : parts.map(Number);

  return month * 100 + day;
}

export function TransactionLedgerBoard({
  initialRows = fallbackLedgerRows,
}: TransactionLedgerBoardProps) {
  const rows = normalizeLedgerRows(initialRows);
  const [company, setCompany] = useState("업체 전체");
  const [transactionType, setTransactionType] = useState("충/환전 전체");
  const [status, setStatus] = useState("상태 전체");
  const [depositor, setDepositor] = useState("");
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("01-01");
  const [endDate, setEndDate] = useState("12-31");
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const requestedDate = dateToNumber(row.requestedAt.slice(0, 5));
      const matchesDate =
        requestedDate >= dateToNumber(startDate) &&
        requestedDate <= dateToNumber(endDate);
      const matchesCompany = company === "업체 전체" || row.companyName === company;
      const matchesStatus =
        status === "상태 전체" || row.status === status;
      const matchesDepositor = row.depositor.includes(depositor.trim());
      const matchesAmount = amount
        ? String(row.amount).includes(amount.replace(/[^\d]/g, ""))
        : true;
      const matchesType =
        transactionType === "충/환전 전체" || row.transactionType === transactionType;

      return (
        matchesDate &&
        matchesCompany &&
        matchesStatus &&
        matchesDepositor &&
        matchesAmount &&
        matchesType
      );
    });
  }, [amount, company, depositor, endDate, rows, startDate, status, transactionType]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pageRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  function resetSearch() {
    setCompany("업체 전체");
    setTransactionType("충/환전 전체");
    setStatus("상태 전체");
    setDepositor("");
    setAmount("");
    setStartDate("01-01");
    setEndDate("12-31");
    setPage(1);
  }

  function exportRows() {
    downloadExcelTable(
      "transaction-ledger.xls",
      [
        "거래일자",
        "충/환전",
        "업체명",
        "금액",
        "수수료",
        "입금자명",
        "상태",
        "은행",
        "계좌번호",
        "통장명의",
      ],
      filteredRows.map((row) => [
        row.requestedAt,
        row.transactionType,
        row.companyName,
        row.amount,
        row.fee,
        row.depositor,
        row.status,
        row.bankName,
        row.accountNumber,
        row.accountHolder,
      ]),
    );
  }

  const companyOptions = Array.from(
    new Set(rows.map((row) => row.companyName).filter(Boolean)),
  ).sort();

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 2xl:flex-row 2xl:items-center">
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
          Transaction
        </h2>

        <div className="grid flex-1 gap-3 md:grid-cols-3 xl:grid-cols-[180px_180px_180px_180px_180px_105px_105px_68px_118px_118px]">
          <select
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            className="h-12 rounded-xl border border-white/14 bg-white/[0.82] px-3 text-sm font-semibold text-slate-900 outline-none"
          >
            <option>업체 전체</option>
            {companyOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <select
            value={transactionType}
            onChange={(event) => setTransactionType(event.target.value)}
            className="h-12 rounded-xl border border-white/14 bg-white/[0.82] px-3 text-sm font-semibold text-slate-900 outline-none"
          >
            <option>충/환전 전체</option>
            <option>충전</option>
            <option>환전</option>
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-12 rounded-xl border border-white/14 bg-white/[0.82] px-3 text-sm font-semibold text-slate-900 outline-none"
          >
            <option>상태 전체</option>
            <option>승인중</option>
            <option>완료</option>
            <option>승인취소</option>
          </select>
          <input
            value={depositor}
            onChange={(event) => setDepositor(event.target.value)}
            placeholder="입금자"
            className="h-12 rounded-xl border border-white/14 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-white/38 focus:border-cyan-300/40"
          />
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="신청금액"
            className="h-12 rounded-xl border border-white/14 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-white/38 focus:border-cyan-300/40"
          />
          <label className="text-xs text-white/42">
            시작일
            <input
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 h-8 w-full border-b border-white/36 bg-transparent text-base font-semibold text-white outline-none"
            />
          </label>
          <label className="text-xs text-white/42">
            종료일
            <input
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 h-8 w-full border-b border-white/36 bg-transparent text-base font-semibold text-white outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setPage(1)}
            className="h-12 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            검색
          </button>
          <button
            type="button"
            onClick={resetSearch}
            className="h-12 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-white transition hover:bg-teal-400"
          >
            검색 초기화
          </button>
          <button
            type="button"
            onClick={exportRows}
            disabled={!filteredRows.length}
            className="h-12 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            엑셀 다운로드
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="bg-black/52 text-white/72">
              <tr>
                {[
                  "거래일자",
                  "충/환전",
                  "업체명",
                  "금액",
                  "수수료",
                  "입금자명",
                  "상태",
                  "은행",
                  "계좌번호",
                  "통장명의",
                ].map((header) => (
                  <th
                    key={header}
                    className="border-b border-white/8 px-4 py-5 text-center font-semibold"
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
                    className="border-b border-white/8 text-white/78 last:border-b-0"
                  >
                    <td className="px-4 py-3 text-center">{row.requestedAt}</td>
                    <td className="px-4 py-3 text-center">{row.transactionType}</td>
                    <td className="px-4 py-3 text-center">{row.companyName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-white">
                      {formatKoreanWon(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-cyan-100">
                      {formatKoreanWon(row.fee)}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-white">
                      {row.depositor}
                    </td>
                    <td className="px-4 py-3 text-center">{row.status}</td>
                    <td className="px-4 py-3 text-center">{row.bankName}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {row.accountNumber}
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-center leading-relaxed">
                      {row.accountHolder}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-white/40">
                    조건에 맞는 거래 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-center gap-2 border-t border-white/8 px-4 py-5">
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

            {Array.from({ length: Math.min(pageCount, 10) }, (_, index) => {
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
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
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
      </div>
    </section>
  );
}
