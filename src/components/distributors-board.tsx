"use client";

import { useMemo, useState } from "react";

import { ModalFeedback } from "@/components/modal-feedback";
import type { AdminAccountRecord } from "@/lib/admin-accounts";

type DistributorRow = {
  id: string;
  nickname: string;
  loginId: string;
  password: string;
  managedAccountNames: string[];
  topDistributor: string;
  topDistributorId: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  status: "ACTIVE" | "SUSPENDED";
};

type ApiResponse =
  | {
      detailedAccounts: AdminAccountRecord[];
      message?: string;
    }
  | { message?: string };

const rowsPerPage = 10;

function toRows(accounts: AdminAccountRecord[]): DistributorRow[] {
  return accounts
    .filter((account) => account.role === "ADMIN")
    .map((account) => ({
      id: account.id,
      nickname: account.nickname,
      loginId: account.loginId,
      password: account.visiblePassword,
      managedAccountNames: accounts
        .filter(
          (candidate) =>
            candidate.role === "DOMAIN_ADMIN" && candidate.parentAdminId === account.id,
        )
        .map((candidate) => `${candidate.nickname} / ${candidate.loginId}`),
      topDistributor: account.parentDistributorName ?? "-",
      topDistributorId: account.parentAdminId ?? null,
      lastLoginAt: account.lastLoginAt,
      createdAt: account.createdAt,
      status: account.status,
    }));
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return { message: text || "서버 응답을 읽지 못했습니다." };
  }
}

export function DistributorsBoard({
  adminAccounts,
}: {
  adminAccounts: AdminAccountRecord[];
}) {
  const [accounts, setAccounts] = useState(adminAccounts);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [nickname, setNickname] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [parentAdminId, setParentAdminId] = useState("");
  const [message, setMessage] = useState("");
  const [createModalMessage, setCreateModalMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [managedCompaniesRow, setManagedCompaniesRow] = useState<DistributorRow | null>(null);

  const topDistributorOptions = useMemo(
    () =>
      accounts
        .filter((account) => account.role === "TOP_DISTRIBUTOR")
        .map((account) => ({ id: account.id, name: account.nickname })),
    [accounts],
  );
  const rows = useMemo(() => toRows(accounts), [accounts]);
  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return rows;
    }

    return rows.filter(
      (row) =>
        row.nickname.toLowerCase().includes(keyword) ||
        row.loginId.toLowerCase().includes(keyword),
    );
  }, [rows, query]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const visibleRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  async function requestAccount(method: "POST" | "PATCH", body: Record<string, unknown>) {
    const response = await fetch("/api/admin-accounts", {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const data = safeParseJson(text);

    if (!response.ok || !("detailedAccounts" in data)) {
      throw new Error(data.message || "총판 계정 처리에 실패했습니다.");
    }

    setAccounts(data.detailedAccounts);
    setPage(1);
    return data;
  }

  async function handleCreate() {
    if (!nickname.trim() || !loginId.trim() || !password.trim()) {
      setCreateModalMessage("닉네임, 아이디, 비밀번호를 모두 입력해주세요.");
      return;
    }

    if (!parentAdminId) {
      setCreateModalMessage("상위총판을 선택해주세요.");
      return;
    }

    setIsCreating(true);
    setCreateModalMessage("");

    try {
      const data = await requestAccount("POST", {
        role: "ADMIN",
        nickname,
        loginId,
        password,
        parentAdminId,
      });
      setNickname("");
      setLoginId("");
      setPassword("");
      setParentAdminId("");
      setIsCreateModalOpen(false);
      setMessage(data.message ?? `${loginId} 총판 계정이 생성되었습니다.`);
    } catch (error) {
      setCreateModalMessage(
        error instanceof Error ? error.message : "총판 계정 생성에 실패했습니다.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggle(row: DistributorRow) {
    setProcessingId(row.id);

    try {
      const data = await requestAccount("PATCH", {
        id: row.id,
        action: "toggle-status",
      });
      setMessage(
        data.message ??
          (row.status === "ACTIVE"
            ? `${row.loginId} 계정을 사용중지했습니다.`
            : `${row.loginId} 계정을 다시 사용 상태로 변경했습니다.`),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "상태 변경에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDelete(row: DistributorRow) {
    if (!window.confirm(`${row.loginId} 총판 계정을 삭제할까요?`)) {
      return;
    }

    setProcessingId(row.id);

    try {
      const data = await requestAccount("PATCH", {
        id: row.id,
        action: "delete",
      });
      setMessage(data.message ?? `${row.loginId} 계정이 삭제되었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleHardDelete(row: DistributorRow) {
    if (
      !window.confirm(
        `${row.loginId} 총판 계정을 완전 삭제할까요?\n연결된 도메인, 충전/환전, 수수료 기록까지 삭제되며 복구할 수 없습니다.`,
      )
    ) {
      return;
    }

    setProcessingId(row.id);

    try {
      const data = await requestAccount("PATCH", {
        id: row.id,
        action: "hard-delete",
      });
      setMessage(data.message ?? `${row.loginId} 계정이 완전 삭제되었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "완전 삭제에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  }

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
            마스터 계정에서 총판을 생성하고 상위총판에 연결합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setCreateModalMessage("");
            setIsCreateModalOpen(true);
          }}
          className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400"
        >
          총판 생성
        </button>
      </div>

      <div className="p-5 sm:p-6">
        {message ? (
          <p className="mb-4 rounded-2xl border border-cyan-300/16 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-50/86">
            {message}
          </p>
        ) : null}

        <label className="mb-4 flex h-12 items-center gap-3 border border-white/24 bg-white/[0.02] px-4 text-white/56">
          <span className="text-xl">⌕</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="닉네임 검색"
            className="h-full flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
        </label>

        <div className="min-h-[620px] overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="bg-black/52 text-white/72">
              <tr>
                {["관리자/아이디", "비밀번호", "상위총판", "총판", "관리 업체", "상태", "최근 로그인", "생성일", "삭제"].map(
                  (header) => (
                    <th
                      key={header}
                      className="border-b border-white/8 px-4 py-4 text-center font-semibold"
                    >
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/8 text-white/76 last:border-b-0"
                >
                  <td className="px-4 py-4 text-center">
                    <span className="font-semibold text-white">{row.nickname}</span>
                    <span className="text-white/34"> / </span>
                    <span>{row.loginId}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-block rounded-xl border border-teal-300/25 bg-teal-300/10 px-3 py-2 text-xs font-semibold text-teal-100">
                      {row.password}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">{row.topDistributor}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="rounded-xl bg-fuchsia-500/78 px-3 py-2 text-xs font-semibold text-white">
                      {row.nickname}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => setManagedCompaniesRow(row)}
                      className="rounded-xl border border-cyan-300/24 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
                    >
                      {row.managedAccountNames.length}개
                    </button>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="mr-2 font-semibold text-sky-400">
                      {row.status === "ACTIVE" ? "사용중" : "중지"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggle(row)}
                      disabled={processingId === row.id}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                    >
                      {processingId === row.id
                        ? "처리중"
                        : row.status === "ACTIVE"
                          ? "중지"
                          : "사용"}
                    </button>
                  </td>
                  <td className="px-4 py-4 text-center text-white/62">
                    {row.lastLoginAt ?? "-"}
                  </td>
                  <td className="px-4 py-4 text-center text-white/62">{row.createdAt}</td>
                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      disabled={processingId === row.id}
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                    >
                      {processingId === row.id ? "처리중" : "삭제"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHardDelete(row)}
                      disabled={processingId === row.id}
                      className="ml-2 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                    >
                      {processingId === row.id ? "처리중" : "완전 삭제"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRows.length > rowsPerPage ? (
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

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/72 px-4">
          <div className="w-full max-w-[490px] rounded-lg bg-white p-6 text-slate-950 shadow-2xl">
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">총판 생성</h3>

            <div className="mt-9 space-y-6">
              <ModalFeedback message={createModalMessage} />
              <select
                value={parentAdminId}
                onChange={(event) => setParentAdminId(event.target.value)}
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none"
              >
                <option value="">상위총판 선택</option>
                {topDistributorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                placeholder="닉네임 [2글자 이상]"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="아이디 [4글자 이상, 영어 시작]"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호 [4글자 이상]"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              {!topDistributorOptions.length ? (
                <p className="text-sm font-medium text-rose-600">
                  먼저 상위총판 계정을 생성해야 총판을 만들 수 있습니다.
                </p>
              ) : null}
            </div>

            <div className="mt-12 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating || !topDistributorOptions.length}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isCreating ? "생성 중" : "생성"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreateModalMessage("");
                  setIsCreateModalOpen(false);
                }}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {managedCompaniesRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[460px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">
              관리 업체
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {managedCompaniesRow.nickname} 계정 하위에 연결된 계정 목록입니다.
            </p>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-semibold text-slate-700">
                <span>총 계정 수</span>
                <span>{managedCompaniesRow.managedAccountNames.length}개</span>
              </div>
              <div className="max-h-[260px] space-y-2 overflow-y-auto">
                {managedCompaniesRow.managedAccountNames.map((accountName) => (
                  <div
                    key={accountName}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    {accountName}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setManagedCompaniesRow(null)}
                className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
