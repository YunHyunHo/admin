"use client";

import { useState } from "react";

type DomainRow = {
  id: string;
  headquarters: string;
  topDistributor: string;
  distributor: string;
  loginId: string;
  companyName: string;
  url: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  depositEnabled: boolean;
  createdAt: string;
  users: DomainUserRow[];
};

type DomainUserRow = {
  id: string;
  branch: string;
  topDistributor: string;
  distributor: string;
  wallet: string;
  totalDeposit: string;
  domain: string;
  username: string;
  createdAt: string;
};

const domainRows: DomainRow[] = [
  {
    id: "DOM-ONE-001",
    headquarters: "본사",
    topDistributor: "코인뱅크",
    distributor: "원페이",
    loginId: "onepay_admin",
    companyName: "원페이",
    url: "onepay.laylow.me",
    bankName: "국민은행",
    accountNumber: "100-0001-0001",
    accountHolder: "원페이",
    depositEnabled: true,
    createdAt: "05-02 10:00:00",
    users: [
      {
        id: "USR-ONE-001",
        branch: "본사",
        topDistributor: "코인뱅크",
        distributor: "원페이",
        wallet: "-",
        totalDeposit: "100,000 원",
        domain: "원페이",
        username: "one_user_01",
        createdAt: "05-02 10:04:11",
      },
      {
        id: "USR-ONE-002",
        branch: "본사",
        topDistributor: "코인뱅크",
        distributor: "원페이",
        wallet: "-",
        totalDeposit: "0 원",
        domain: "원페이",
        username: "one_user_02",
        createdAt: "05-02 10:08:29",
      },
    ],
  },
];

const rowsPerPage = 10;

export function DomainManagementBoard() {
  const [selectedDomain, setSelectedDomain] = useState<DomainRow | null>(null);
  const [domainPage, setDomainPage] = useState(1);
  const [userPage, setUserPage] = useState(1);

  const domainPageCount = Math.max(1, Math.ceil(domainRows.length / rowsPerPage));
  const visibleDomainRows = domainRows.slice(
    (domainPage - 1) * rowsPerPage,
    domainPage * rowsPerPage,
  );
  const selectedUsers = selectedDomain?.users ?? [];
  const userPageCount = Math.max(1, Math.ceil(selectedUsers.length / rowsPerPage));
  const visibleSelectedUsers = selectedUsers.slice(
    (userPage - 1) * rowsPerPage,
    userPage * rowsPerPage,
  );

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            Domain Workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            도메인 리스트
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">
            도메인과 도메인 유저를 한 화면에서 관리하도록 합쳤습니다. 각 행의 유저 보기 버튼으로 연결 유저를 팝업에서 확인할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          도메인 추가
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <div className="overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-black/48 text-white/72">
              <tr>
                {[
                  "ID",
                  "본사",
                  "상위총판",
                  "총판",
                  "로그인ID",
                  "업체명",
                  "URL",
                  "출금은행 정보",
                  "충전거래 허용",
                  "유저",
                  "생성일",
                  "관리",
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
              {visibleDomainRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/8 text-white/76 last:border-b-0"
                >
                  <td className="px-4 py-5 font-mono text-xs text-white/52">
                    {row.id}
                  </td>
                  <td className="px-4 py-5 text-center">{row.headquarters}</td>
                  <td className="px-4 py-5 text-center">{row.topDistributor}</td>
                  <td className="px-4 py-5 text-center">{row.distributor}</td>
                  <td className="px-4 py-5 text-center">{row.loginId}</td>
                  <td className="px-4 py-5 text-center font-semibold text-white">
                    {row.companyName}
                  </td>
                  <td className="px-4 py-5 text-center">{row.url}</td>
                  <td className="px-4 py-5">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-3 text-xs leading-5 text-white/68">
                      <p>{row.bankName}</p>
                      <p>{row.accountNumber}</p>
                      <p>{row.accountHolder}</p>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        row.depositEnabled
                          ? "bg-emerald-400/12 text-emerald-200"
                          : "bg-white/8 text-white/48"
                      }`}
                    >
                      {row.depositEnabled ? "허용" : "중지"}
                    </span>
                  </td>
                  <td className="px-4 py-5 text-center">
                      <button
                        type="button"
                      onClick={() => {
                        setSelectedDomain(row);
                        setUserPage(1);
                      }}
                      className="rounded-xl bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-400"
                    >
                      유저 보기 {row.users.length}
                    </button>
                  </td>
                  <td className="px-4 py-5 text-center text-white/60">
                    {row.createdAt}
                  </td>
                  <td className="px-4 py-5">
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl bg-cyan-500/18 px-3 py-2 text-xs font-semibold text-cyan-100"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-red-500/18 px-3 py-2 text-xs font-semibold text-red-100"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {domainRows.length > rowsPerPage ? (
            <div className="flex items-center justify-center gap-2 border-t border-white/8 px-4 py-5">
              {Array.from({ length: domainPageCount }, (_, index) => index + 1).map(
                (pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setDomainPage(pageNumber)}
                    className={`h-10 min-w-10 rounded-xl px-3 text-lg font-semibold ${
                      domainPage === pageNumber
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

        <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/52">
          DB 연결 후에는 이 도메인 리스트에서 `도메인`, `도메인유저`, `계좌관리`, `알림관리`를 이어서 처리하는 구조로 확장하면 됩니다.
        </div>
      </div>

      {selectedDomain ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-6xl overflow-hidden rounded-[30px] border border-white/10 bg-[#0d1017] shadow-[0_24px_120px_rgba(0,0,0,0.62)]">
            <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
                  Domain Users
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {selectedDomain.companyName} 유저 리스트
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDomain(null)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/78 transition hover:bg-white/[0.08]"
              >
                닫기
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto p-5">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="bg-black/48 text-white/72">
                  <tr>
                    {[
                      "ID",
                      "본사",
                      "상위총판",
                      "총판",
                      "유저키",
                      "총입금금액",
                      "도메인",
                      "유저명",
                      "생성일",
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
                  {visibleSelectedUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-white/8 text-white/72 last:border-b-0"
                    >
                      <td className="px-4 py-5 font-mono text-xs text-white/50">
                        {user.id}
                      </td>
                      <td className="px-4 py-5 text-center">{user.branch}</td>
                      <td className="px-4 py-5 text-center">
                        {user.topDistributor}
                      </td>
                      <td className="px-4 py-5 text-center">{user.distributor}</td>
                      <td className="px-4 py-5 text-center">{user.wallet}</td>
                      <td className="px-4 py-5 text-right font-semibold text-white">
                        {user.totalDeposit}
                      </td>
                      <td className="px-4 py-5 text-center">{user.domain}</td>
                      <td className="px-4 py-5 text-center">{user.username}</td>
                      <td className="px-4 py-5 text-center text-white/56">
                        {user.createdAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedUsers.length > rowsPerPage ? (
                <div className="flex items-center justify-center gap-2 border-x border-b border-white/8 px-4 py-5">
                  {Array.from({ length: userPageCount }, (_, index) => index + 1).map(
                    (pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setUserPage(pageNumber)}
                        className={`h-10 min-w-10 rounded-xl px-3 text-lg font-semibold ${
                          userPage === pageNumber
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
        </div>
      ) : null}
    </section>
  );
}
