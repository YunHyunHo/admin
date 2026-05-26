"use client";

import { useMemo, useState } from "react";

import type { PublicAdminAccount } from "@/lib/admin-accounts";

type DomainAdminRow = {
  id: string;
  nickname: string;
  loginId: string;
  companyName: string;
  lastLoginAt: string | null;
  createdAt: string;
  status: "ACTIVE" | "SUSPENDED";
};

const rowsPerPage = 10;

type AdminPatchResponse =
  | { accounts: PublicAdminAccount[]; message?: string }
  | { message?: string };

function getVisibleDomainAdmins(accounts: PublicAdminAccount[]) {
  return accounts
    .filter((account) => account.role === "DOMAIN_ADMIN")
    .map((account) => ({
      id: account.id,
      nickname: account.nickname,
      loginId: account.loginId,
      companyName: account.managedCompanies[0] ?? account.companyName,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
      status: account.status,
    }));
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text) as AdminPatchResponse;
  } catch {
    return { message: text || "서버 응답을 읽지 못했습니다." };
  }
}

export function DomainAdminsBoard({
  initialAdmins,
  canManageAdmins,
}: {
  initialAdmins: PublicAdminAccount[];
  canManageAdmins: boolean;
}) {
  const [admins, setAdmins] = useState<DomainAdminRow[]>(
    getVisibleDomainAdmins(initialAdmins),
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [processingAdminId, setProcessingAdminId] = useState<string | null>(null);

  const filteredAdmins = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return admins;
    }

    return admins.filter(
      (admin) =>
        admin.nickname.toLowerCase().includes(keyword) ||
        admin.loginId.toLowerCase().includes(keyword) ||
        admin.companyName.toLowerCase().includes(keyword),
    );
  }, [admins, query]);

  const pageCount = Math.max(1, Math.ceil(filteredAdmins.length / rowsPerPage));
  const visibleAdmins = filteredAdmins.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  function applyResponseAccounts(accounts: PublicAdminAccount[]) {
    setAdmins(getVisibleDomainAdmins(accounts));
    setPage(1);
  }

  async function requestAdminPatch(body: Record<string, unknown>) {
    const response = await fetch("/api/admin-accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    const text = await response.text();
    const data = safeParseJson(text);

    if (!response.ok || !("accounts" in data)) {
      throw new Error(data.message || "도메인 어드민 계정 처리에 실패했습니다.");
    }

    const nextAccounts = data.accounts;
    applyResponseAccounts(nextAccounts);
    return data;
  }

  async function handleToggle(admin: DomainAdminRow) {
    if (!canManageAdmins) {
      setMessage("마스터 계정만 도메인 어드민을 수정할 수 있습니다.");
      return;
    }

    setProcessingAdminId(admin.id);

    try {
      const data = await requestAdminPatch({
        id: admin.id,
        action: "toggle-status",
      });
      setMessage(
        data.message ??
          (admin.status === "ACTIVE"
            ? `${admin.loginId} 계정을 사용중지했습니다.`
            : `${admin.loginId} 계정을 다시 사용 상태로 변경했습니다.`),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태 변경에 실패했습니다.");
    } finally {
      setProcessingAdminId(null);
    }
  }

  async function handleDelete(admin: DomainAdminRow) {
    if (!canManageAdmins) {
      setMessage("마스터 계정만 도메인 어드민을 삭제할 수 있습니다.");
      return;
    }

    if (!window.confirm(`${admin.loginId} 도메인 어드민 계정을 삭제할까요?`)) {
      return;
    }

    setProcessingAdminId(admin.id);

    try {
      const data = await requestAdminPatch({
        id: admin.id,
        action: "delete",
      });
      setMessage(data.message ?? `${admin.loginId} 계정이 삭제되었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setProcessingAdminId(null);
    }
  }

  async function handleHardDelete(admin: DomainAdminRow) {
    if (!canManageAdmins) {
      setMessage("마스터 계정만 도메인 어드민을 완전 삭제할 수 있습니다.");
      return;
    }

    if (
      !window.confirm(
        `${admin.loginId} 도메인 어드민 계정을 완전 삭제할까요?\n연결된 도메인 데이터와 기록이 함께 정리될 수 있으며 복구할 수 없습니다.`,
      )
    ) {
      return;
    }

    setProcessingAdminId(admin.id);

    try {
      const data = await requestAdminPatch({
        id: admin.id,
        action: "hard-delete",
      });
      setMessage(data.message ?? `${admin.loginId} 계정이 완전 삭제되었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "완전 삭제에 실패했습니다.");
    } finally {
      setProcessingAdminId(null);
    }
  }

  return (
    <section className="relative rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,18,18,0.95)_0%,_rgba(14,14,16,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
            도메인 어드민
          </h2>
          <p className="mt-2 text-sm text-white/52">
            도메인 전용 계정은 기존 어드민리스트와 분리되어 이 페이지에서만 관리합니다.
          </p>
        </div>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-cyan-300/16 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-50/86">
          {message}
        </p>
      ) : null}

      <label className="mt-4 flex h-12 items-center gap-3 border border-white/24 bg-white/[0.02] px-4 text-white/56">
        <span className="text-xl">⌕</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="닉네임 / 아이디 / 업체 검색"
          className="h-full flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
      </label>

      <div className="mt-4 overflow-hidden border border-white/24 bg-black/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead className="bg-black/72 text-white">
              <tr>
                {["닉네임", "아이디", "업체", "상태", "최근 로그인", "가입일", "삭제"].map(
                  (head) => (
                    <th
                      key={head}
                      className="border border-white/24 px-4 py-4 text-center text-sm font-semibold text-white/90"
                    >
                      {head}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visibleAdmins.map((admin) => (
                <tr
                  key={admin.id}
                  className="border-b border-white/16 bg-white/[0.035] text-white/88 last:border-b-0"
                >
                  <td className="border border-white/18 px-4 py-4 text-center font-semibold">
                    {admin.nickname}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center font-semibold">
                    {admin.loginId}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {admin.companyName}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    <span className="mr-2 font-semibold text-sky-400">
                      {admin.status === "ACTIVE" ? "사용중" : "중지"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggle(admin)}
                      disabled={!canManageAdmins || processingAdminId === admin.id}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                    >
                      {processingAdminId === admin.id
                        ? "처리중"
                        : admin.status === "ACTIVE"
                          ? "중지"
                          : "사용"}
                    </button>
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {admin.lastLoginAt ?? "-"}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {admin.createdAt}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(admin)}
                      disabled={!canManageAdmins || processingAdminId === admin.id}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                    >
                      {processingAdminId === admin.id ? "처리중" : "삭제"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHardDelete(admin)}
                      disabled={!canManageAdmins || processingAdminId === admin.id}
                      className="ml-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                    >
                      {processingAdminId === admin.id ? "처리중" : "완전 삭제"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAdmins.length > rowsPerPage ? (
          <div className="flex items-center justify-center gap-2 border-t border-white/18 px-4 py-5">
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
    </section>
  );
}
