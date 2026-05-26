"use client";

import { useMemo, useState } from "react";

import { ModalFeedback } from "@/components/modal-feedback";
import type { AdminRole, PublicAdminAccount } from "@/lib/admin-accounts";

type AdminRow = {
  id: string;
  nickname: string;
  loginId: string;
  role: AdminRole;
  createdAt: string;
  status: "ACTIVE" | "SUSPENDED";
  managedCompanies: string[];
  companyName: string;
  parentAdminId?: string | null;
  parentDistributorName?: string | null;
  lastLoginAt: string | null;
};

const rowsPerPage = 10;
const accountTypeOptions = [
  { value: "ADMIN", label: "총판" },
] as const;

function getVisibleAdmins(accounts: PublicAdminAccount[]) {
  return accounts.filter(
    (account) => account.role !== "MASTER" && account.role !== "DOMAIN_ADMIN",
  );
}

function getRoleLabel(role: AdminRole) {
  switch (role) {
    case "MASTER":
      return "마스터";
    case "TOP_DISTRIBUTOR":
      return "상위총판";
    case "ADMIN":
      return "총판";
    case "DOMAIN_ADMIN":
      return "업체";
    default:
      return role;
  }
}

type AdminsBoardProps = {
  initialAdmins: PublicAdminAccount[];
  managedCompanies: string[];
  canManageAdmins: boolean;
};

export function AdminsBoard({
  initialAdmins,
  managedCompanies,
  canManageAdmins,
}: AdminsBoardProps) {
  const [admins, setAdmins] = useState<AdminRow[]>(getVisibleAdmins(initialAdmins));
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountType] = useState<"ADMIN">("ADMIN");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([
    managedCompanies[0],
  ]);
  const [selectedTopDistributorId, setSelectedTopDistributorId] = useState("");
  const [nickname, setNickname] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [createModalMessage, setCreateModalMessage] = useState("");
  const [processingAdminId, setProcessingAdminId] = useState<string | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);

  const filteredAdmins = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) {
      return admins;
    }

    return admins.filter(
      (admin) =>
        admin.nickname.toLowerCase().includes(keyword) ||
        admin.loginId.toLowerCase().includes(keyword),
    );
  }, [admins, query]);
  const topDistributorOptions = useMemo(
    () =>
      admins
        .filter((admin) => admin.role === "TOP_DISTRIBUTOR")
        .map((admin) => ({
          id: admin.id,
          name: admin.nickname,
          company: admin.managedCompanies[0] ?? managedCompanies[0],
        })),
    [admins, managedCompanies],
  );
  const pageCount = Math.max(1, Math.ceil(filteredAdmins.length / rowsPerPage));
  const visibleAdmins = filteredAdmins.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  function applyAccountResponse(data: {
    accounts: PublicAdminAccount[];
    managedCompanies: string[];
  }) {
    setAdmins(getVisibleAdmins(data.accounts));
    setPage(1);
  }

  async function requestAdminAccount(
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
  ) {
    const response = await fetch("/api/admin-accounts", {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    const data = (responseText
      ? safeParseJson(responseText)
      : { message: "서버 응답이 비어 있습니다." }) as
      | {
          accounts: PublicAdminAccount[];
          managedCompanies: string[];
          message?: string;
        }
      | { message?: string };

    if (!response.ok || !("accounts" in data)) {
      throw new Error(
        "message" in data && data.message
          ? data.message
          : "어드민 계정 처리에 실패했습니다.",
      );
    }

    applyAccountResponse(data);
    return data;
  }

  function safeParseJson(text: string) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { message: text || "서버 응답을 읽지 못했습니다." };
    }
  }

  async function handleCreateAdmin() {
    if (!canManageAdmins) {
      setCreateModalMessage("마스터 계정만 하부계정을 생성할 수 있습니다.");
      return;
    }

    if (accountType === "ADMIN" && !selectedTopDistributorId) {
      setCreateModalMessage("총판 계정은 상위총판을 선택해주세요.");
      return;
    }

    setIsCreating(true);
    setCreateModalMessage("");

    try {
      const selectedTopDistributor = topDistributorOptions.find(
        (option) => option.id === selectedTopDistributorId,
      );
      const data = await requestAdminAccount("POST", {
        role: accountType,
        nickname,
        loginId,
        password,
        parentAdminId: selectedTopDistributorId,
        parentDistributorName: selectedTopDistributor?.name,
        managedCompanies: selectedCompanies,
      });
      setNickname("");
      setLoginId("");
      setPassword("");
      setSelectedTopDistributorId("");
      setSelectedCompanies([managedCompanies[0]]);
      setIsCreateModalOpen(false);
      setMessage(
        data.message ??
          `${loginId} 계정이 생성되었습니다. 이 아이디와 비밀번호를 전달하면 됩니다.`,
      );
    } catch (error) {
      setCreateModalMessage(
        error instanceof Error ? error.message : "계정 생성에 실패했습니다.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleStatus(admin: AdminRow) {
    if (!canManageAdmins) {
      setMessage("마스터 계정만 하부계정을 수정할 수 있습니다.");
      return;
    }

    if (admin.role === "MASTER") {
      setMessage("마스터 계정은 중지할 수 없습니다.");
      return;
    }

    setProcessingAdminId(admin.id);

    try {
      const data = await requestAdminAccount("PATCH", {
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

  async function handleDeleteAdmin(admin: AdminRow) {
    if (!canManageAdmins) {
      setMessage("마스터 계정만 하부계정을 삭제할 수 있습니다.");
      return;
    }

    if (admin.role === "MASTER") {
      setMessage("마스터 계정은 삭제할 수 없습니다.");
      return;
    }

    if (!window.confirm(`${admin.loginId} 계정을 삭제할까요?`)) {
      return;
    }

    setProcessingAdminId(admin.id);

    try {
      const data = await requestAdminAccount("PATCH", {
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

  async function handleHardDeleteAdmin(admin: AdminRow) {
    if (!canManageAdmins) {
      setMessage("마스터 계정만 하부계정을 완전 삭제할 수 있습니다.");
      return;
    }

    if (
      !window.confirm(
        `${admin.loginId} 계정을 완전 삭제할까요?\n연결된 업체/총판 데이터와 기록이 삭제되며 복구할 수 없습니다.`,
      )
    ) {
      return;
    }

    setProcessingAdminId(admin.id);

    try {
      const data = await requestAdminAccount("PATCH", {
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
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
          어드민 리스트
        </h2>
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          disabled={!canManageAdmins}
          className="h-12 rounded-xl bg-fuchsia-600 px-5 text-sm font-semibold text-white transition hover:bg-fuchsia-500"
        >
          계정 생성
        </button>
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
          placeholder="닉네임 검색"
          className="h-full flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
        />
      </label>

      <div className="mt-4 overflow-hidden border border-white/24 bg-black/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead className="bg-black/72 text-white">
              <tr>
                {[
                  "닉네임",
                  "아이디",
                  "분류",
                  "상위총판",
                  "업체",
                  "상태",
                  "최근 로그인",
                  "가입일",
                  "삭제",
                ].map((head) => (
                  <th
                    key={head}
                    className="border border-white/24 px-4 py-4 text-center text-sm font-semibold text-white/90"
                  >
                    {head}
                  </th>
                ))}
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
                    {getRoleLabel(admin.role)}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {admin.parentDistributorName ?? "-"}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {admin.managedCompanies.join(", ")}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    <span className="mr-2 font-semibold text-sky-400">
                      {admin.status === "ACTIVE" ? "사용중" : "중지"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(admin)}
                      disabled={
                        admin.role === "MASTER" ||
                        !canManageAdmins ||
                        processingAdminId === admin.id
                      }
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
                      onClick={() => handleDeleteAdmin(admin)}
                      disabled={
                        admin.role === "MASTER" ||
                        !canManageAdmins ||
                        processingAdminId === admin.id
                      }
                      className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white/80 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                    >
                      {processingAdminId === admin.id ? "처리중" : "삭제"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleHardDeleteAdmin(admin)}
                      disabled={
                        admin.role === "MASTER" ||
                        !canManageAdmins ||
                        processingAdminId === admin.id
                      }
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

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/72 px-4">
          <div className="w-full max-w-[490px] rounded-lg bg-white p-6 text-slate-950 shadow-2xl">
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">
              어드민 생성
            </h3>

            <div className="mt-9 space-y-6">
              <ModalFeedback message={createModalMessage} />
              <select
                value={accountType}
                disabled
                onChange={() => undefined}
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none"
              >
                {accountTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} 계정
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
              <select
                value={selectedTopDistributorId}
                onChange={(event) => setSelectedTopDistributorId(event.target.value)}
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none"
              >
                <option value="">상위총판 선택</option>
                {topDistributorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedCompanies[0] ?? ""}
                onChange={(event) => setSelectedCompanies([event.target.value])}
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none"
              >
                {managedCompanies.map((company) => (
                  <option key={company} value={company}>
                    {company}
                  </option>
                ))}
              </select>
              <p className="text-sm text-slate-500">
                총판 계정도 기본 업체 범위를 함께 저장합니다.
              </p>
            </div>

            <div className="mt-12 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCreateAdmin}
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

    </section>
  );
}
