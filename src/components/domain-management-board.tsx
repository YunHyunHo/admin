"use client";

import { useState } from "react";

import type {
  DomainDistributorOption,
  DomainRow,
} from "@/lib/domain-management-types";

export const fallbackDomainRows: DomainRow[] = [
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

type DomainManagementBoardProps = {
  initialRows?: DomainRow[];
  distributorOptions?: DomainDistributorOption[];
  canManageDomains?: boolean;
};

function normalizeDomainRows(rows: DomainRow[]) {
  return rows.map((row) => ({
    ...row,
    headquarters: row.distributor,
    users: row.users.map((user) => ({
      ...user,
      branch: user.distributor,
    })),
  }));
}

export function DomainManagementBoard({
  initialRows = fallbackDomainRows,
  distributorOptions = [],
  canManageDomains = true,
}: DomainManagementBoardProps) {
  const [domainRows, setDomainRows] = useState(initialRows);
  const rows = normalizeDomainRows(domainRows);
  const [selectedDomain, setSelectedDomain] = useState<DomainRow | null>(null);
  const [domainPage, setDomainPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [message, setMessage] = useState("");
  const [isDomainModalOpen, setIsDomainModalOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<DomainRow | null>(null);
  const [domainName, setDomainName] = useState("");
  const [distributorId, setDistributorId] = useState("");
  const [distributorName, setDistributorName] = useState("");

  const domainPageCount = Math.max(
    1,
    Math.ceil(rows.length / rowsPerPage),
  );
  const visibleDomainRows = rows.slice(
    (domainPage - 1) * rowsPerPage,
    domainPage * rowsPerPage,
  );
  const selectedUsers = selectedDomain?.users ?? [];
  const userPageCount = Math.max(1, Math.ceil(selectedUsers.length / rowsPerPage));
  const visibleSelectedUsers = selectedUsers.slice(
    (userPage - 1) * rowsPerPage,
    userPage * rowsPerPage,
  );

  function openCreateModal() {
    setEditingDomain(null);
    setDomainName("");
    setDistributorId("");
    setDistributorName("");
    setIsDomainModalOpen(true);
  }

  function openEditModal(row: DomainRow) {
    setEditingDomain(row);
    setDomainName(row.url);
    setDistributorId(row.distributorId ?? "");
    setDistributorName(row.distributor);
    setIsDomainModalOpen(true);
  }

  function closeDomainModal() {
    setIsDomainModalOpen(false);
    setEditingDomain(null);
    setDomainName("");
    setDistributorId("");
    setDistributorName("");
  }

  function applyDomainResponse(payload: {
    rows?: DomainRow[];
    row?: DomainRow;
    message?: string;
  }) {
    if (payload.rows) {
      setDomainRows(payload.rows);
    } else if (payload.row) {
      setDomainRows((current) => [payload.row!, ...current]);
    }

    if (payload.message) {
      setMessage(payload.message);
    }
  }

  async function saveDomain() {
    if (!domainName.trim() || (!distributorId && !distributorName)) {
      setMessage("도메인명과 하부계정을 입력해주세요.");
      return;
    }

    const selectedDistributor = distributorOptions.find(
      (option) => option.id === distributorId,
    );
    const response = await fetch("/api/domains", {
      method: editingDomain ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        editingDomain
          ? {
              id: editingDomain.id,
              action: "update",
              domainName,
              distributorId,
            }
          : {
              domainName,
              distributorId,
              distributorName: selectedDistributor?.name ?? distributorName,
            },
      ),
    });
    const data = (await response.json()) as {
      rows?: DomainRow[];
      row?: DomainRow;
      message?: string;
    };

    if (!response.ok) {
      setMessage(data.message ?? "도메인 저장 중 오류가 발생했습니다.");
      return;
    }

    if (!data.rows && editingDomain) {
      setDomainRows((current) =>
        current.map((row) =>
          row.id === editingDomain.id
            ? {
                ...row,
                url: domainName,
                companyName: domainName,
                distributor: selectedDistributor?.name ?? distributorName,
                headquarters: selectedDistributor?.name ?? distributorName,
                distributorId: distributorId || row.distributorId,
              }
            : row,
        ),
      );
    }

    applyDomainResponse(data);
    closeDomainModal();
  }

  async function toggleDomainStatus(row: DomainRow) {
    const nextEnabled = !row.depositEnabled;

    setDomainRows((current) =>
      current.map((domain) =>
        domain.id === row.id ? { ...domain, depositEnabled: nextEnabled } : domain,
      ),
    );

    const response = await fetch("/api/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: row.id,
        action: "toggle-status",
        depositEnabled: nextEnabled,
      }),
    });
    const data = (await response.json()) as { rows?: DomainRow[]; message?: string };

    if (!response.ok) {
      setMessage(data.message ?? "도메인 상태 변경 중 오류가 발생했습니다.");
      return;
    }

    applyDomainResponse(data);
  }

  async function deleteDomainRow(row: DomainRow) {
    setDomainRows((current) => current.filter((domain) => domain.id !== row.id));

    const response = await fetch("/api/domains", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, action: "delete" }),
    });
    const data = (await response.json()) as { rows?: DomainRow[]; message?: string };

    if (!response.ok) {
      setMessage(data.message ?? "도메인 삭제 중 오류가 발생했습니다.");
      return;
    }

    applyDomainResponse(data);
  }

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
          onClick={openCreateModal}
          disabled={!canManageDomains}
          className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          도메인 추가
        </button>
      </div>

      <div className="p-5 sm:p-6">
        {message ? (
          <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            {message}
          </div>
        ) : null}

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
                  <td className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-5 font-mono text-xs text-white/52">
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
                      {canManageDomains ? (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleDomainStatus(row)}
                            className="rounded-xl bg-white/8 px-3 py-2 text-xs font-semibold text-white/70"
                          >
                            {row.depositEnabled ? "중지" : "허용"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(row)}
                            className="rounded-xl bg-cyan-500/18 px-3 py-2 text-xs font-semibold text-cyan-100"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDomainRow(row)}
                            className="rounded-xl bg-red-500/18 px-3 py-2 text-xs font-semibold text-red-100"
                          >
                            삭제
                          </button>
                        </>
                      ) : (
                        <span className="text-white/34">-</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length > rowsPerPage ? (
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

        {!rows.length ? (
          <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-white/52">
            등록된 도메인이 없습니다.
          </div>
        ) : null}
      </div>

      {isDomainModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[460px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-xl font-semibold tracking-[-0.03em]">
              {editingDomain ? "도메인 수정" : "도메인 추가"}
            </h3>

            <div className="mt-7 space-y-4">
              <label className="block">
                <span className="sr-only">하부계정 선택</span>
                {distributorOptions.length ? (
                  <select
                    value={distributorId}
                    onChange={(event) => {
                      const selected = distributorOptions.find(
                        (option) => option.id === event.target.value,
                      );

                      setDistributorId(event.target.value);
                      setDistributorName(selected?.name ?? "");
                    }}
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-slate-500"
                  >
                    <option value="">하부계정 선택</option>
                    {distributorOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={distributorName}
                    onChange={(event) => setDistributorName(event.target.value)}
                    placeholder="하부계정 닉네임"
                    className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                  />
                )}
              </label>

              <label className="block">
                <span className="sr-only">도메인명</span>
                <input
                  value={domainName}
                  onChange={(event) => setDomainName(event.target.value)}
                  placeholder="도메인명 또는 URL"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>
            </div>

            <div className="mt-10 flex justify-end gap-2">
              <button
                type="button"
                onClick={saveDomain}
                disabled={!domainName || (!distributorId && !distributorName)}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                저장
              </button>
              <button
                type="button"
                onClick={closeDomainModal}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                      <td className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-5 font-mono text-xs text-white/50">
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
