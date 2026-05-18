"use client";

import { useMemo, useState } from "react";

import type { AdminAccountRecord } from "@/lib/admin-accounts";

type TopDistributorRow = {
  id: string;
  nickname: string;
  loginId: string;
  password: string;
  createdAt: string;
  status: "ACTIVE" | "SUSPENDED";
  distributorsCount: number;
};

type ApiResponse =
  | {
      detailedAccounts: AdminAccountRecord[];
      message?: string;
    }
  | { message?: string };

const rowsPerPage = 10;

function truncateId(value: string) {
  return value.length > 24 ? `${value.slice(0, 24)}...` : value;
}

function toRows(accounts: AdminAccountRecord[]): TopDistributorRow[] {
  return accounts
    .filter((account) => account.role === "TOP_DISTRIBUTOR")
    .map((account) => ({
      id: account.id,
      nickname: account.nickname,
      loginId: account.loginId,
      password: account.visiblePassword,
      createdAt: account.createdAt,
      status: account.status,
      distributorsCount: accounts.filter(
        (candidate) =>
          candidate.role === "ADMIN" && candidate.parentAdminId === account.id,
      ).length,
    }));
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return { message: text || "서버 응답을 읽지 못했습니다." };
  }
}

export function TopDistributorsBoard({
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
  const [message, setMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

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
      throw new Error(data.message || "상위총판 계정 처리에 실패했습니다.");
    }

    setAccounts(data.detailedAccounts);
    setPage(1);
    return data;
  }

  async function handleCreate() {
    setIsCreating(true);

    try {
      const data = await requestAccount("POST", {
        role: "TOP_DISTRIBUTOR",
        nickname,
        loginId,
        password,
      });
      setNickname("");
      setLoginId("");
      setPassword("");
      setIsCreateModalOpen(false);
      setMessage(data.message ?? `${loginId} 상위총판 계정이 생성되었습니다.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "상위총판 계정 생성에 실패했습니다.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggle(row: TopDistributorRow) {
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

  async function handleDelete(row: TopDistributorRow) {
    if (!window.confirm(`${row.loginId} 상위총판 계정을 삭제할까요?`)) {
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

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            Organization Management
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            상위총판 리스트
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/52">
            마스터 계정에서 상위총판 계정을 별도로 생성하고 관리합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400"
        >
          상위총판 생성
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
                {[
                  "ID",
                  "관리자/아이디",
                  "비밀번호",
                  "상위총판",
                  "연결 총판 수",
                  "상태",
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
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/8 text-white/76 last:border-b-0"
                >
                  <td className="px-4 py-4 text-center font-mono text-xs text-white/52">
                    {truncateId(row.id)}
                  </td>
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
                  <td className="px-4 py-4 text-center">
                    <span className="rounded-xl bg-fuchsia-500/78 px-3 py-2 text-xs font-semibold text-white">
                      {row.nickname}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.distributorsCount ? `${row.distributorsCount}개` : "-"}
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
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">
              상위총판 생성
            </h3>

            <div className="mt-9 space-y-6">
              <div className="flex h-14 items-center rounded border border-slate-300 bg-slate-50 px-5 text-sm font-semibold text-slate-600">
                상위총판 계정
              </div>
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
                placeholder="비밀번호 [6글자 이상, 영어 + 숫자]"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-12 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isCreating ? "생성 중" : "생성"}
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
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
