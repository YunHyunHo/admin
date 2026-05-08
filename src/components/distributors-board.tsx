"use client";

import { useMemo, useState } from "react";

import type { AdminAccountRecord } from "@/lib/admin-accounts";

type Distributor = {
  id: string;
  manager: string;
  loginId: string;
  branch: string;
  topDistributor: string;
  name: string;
  agenciesCount: number;
  childDistributorsCount: number;
  managedCompaniesCount: number;
  balance: number;
  createdAt: string;
  password: string;
};

const rowsPerPage = 10;

function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")} 원`;
}

type DistributorsBoardProps = {
  adminAccounts: AdminAccountRecord[];
};

function toDistributorRows(accounts: AdminAccountRecord[]): Distributor[] {
  const masterAccount = accounts.find((account) => account.role === "MASTER");
  const topDistributor = masterAccount?.companyName ?? "전체관리";

  return accounts
    .filter((account) => account.role !== "MASTER")
    .map((account) => ({
      id: account.id,
      manager: account.nickname,
      loginId: account.loginId,
      branch: "본사",
      topDistributor,
      name: account.nickname,
      agenciesCount: 0,
      childDistributorsCount: 0,
      managedCompaniesCount: account.managedCompanies.length,
      balance: 0,
      createdAt: account.createdAt,
      password: account.password,
    }));
}

export function DistributorsBoard({ adminAccounts }: DistributorsBoardProps) {
  const distributors = useMemo(
    () => toDistributorRows(adminAccounts),
    [adminAccounts],
  );
  const [page, setPage] = useState(1);
  const [visiblePasswordId, setVisiblePasswordId] = useState<string | null>(
    null,
  );

  const pageCount = Math.max(1, Math.ceil(distributors.length / rowsPerPage));
  const visibleDistributors = distributors.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            Organization Management
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            총판 리스트
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/52">
            총판 계정, 연결 상위총판, 하위총판, 관련 업체, 보유액을 확인하고 관리하는 화면입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            window.location.href = "/dashboard/admins";
          }}
          className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400"
        >
          어드민에서 하부계정 생성
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <div className="min-h-[620px] overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
            <thead className="bg-black/52 text-white/72">
              <tr>
                {[
                  "ID",
                  "관리자/아이디",
                  "비밀번호",
                  "본사",
                  "상위총판",
                  "총판",
                  "대리점",
                  "하위총판",
                  "관리업체",
                  "보유액",
                  "생성일",
                  "삭제",
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
              {visibleDistributors.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/8 text-white/76 last:border-b-0"
                >
                  <td className="max-w-[110px] px-4 py-4 font-mono text-xs text-white/52">
                    {row.id}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="font-semibold text-white">{row.manager}</span>
                    <span className="text-white/34"> / </span>
                    <span>{row.loginId}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {visiblePasswordId === row.id ? (
                      <span className="rounded-xl border border-teal-300/25 bg-teal-300/10 px-3 py-2 font-mono text-xs font-semibold text-teal-100">
                        {row.password}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setVisiblePasswordId(row.id)}
                        className="rounded-xl bg-teal-400/80 px-3 py-2 text-xs font-semibold text-slate-950"
                      >
                        비밀번호 확인
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">{row.branch}</td>
                  <td className="px-4 py-4 text-center">{row.topDistributor}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="rounded-xl bg-fuchsia-500/78 px-3 py-2 text-xs font-semibold text-white">
                      {row.name}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.agenciesCount ? `${row.agenciesCount}개` : "-"}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.childDistributorsCount}개
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.managedCompaniesCount}개
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-white">
                    {formatKoreanWon(row.balance)}
                  </td>
                  <td className="px-4 py-4 text-center text-white/62">
                    {row.createdAt}
                  </td>
                  <td className="px-4 py-4 text-center text-white/38">
                    -
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {distributors.length > rowsPerPage ? (
            <div className="flex items-center justify-center gap-2 border-t border-white/8 px-4 py-5">
              {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                (pageNumber) => (
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
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>

    </section>
  );
}
