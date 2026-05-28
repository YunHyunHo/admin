"use client";

import { useMemo, useState } from "react";

import { ModalFeedback } from "@/components/modal-feedback";
import type { AccountRow } from "@/lib/bank-accounts-types";
import type {
  DomainListOwnerOption,
  DomainListRow,
} from "@/lib/domain-list-repository";

const rowsPerPage = 10;
const bankOptions = [
  "국민은행",
  "신한은행",
  "농협은행",
  "카카오뱅크",
  "하나은행",
  "전북은행",
  "우리은행",
  "토스뱅크",
];

type DomainListBoardProps = {
  initialRows: DomainListRow[];
  ownerOptions: DomainListOwnerOption[];
};

type ApiResponse =
  | {
      rows: DomainListRow[];
      ownerOptions: DomainListOwnerOption[];
      message?: string;
    }
  | { message?: string };

function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text) as ApiResponse;
  } catch {
    return { message: text || "서버 응답을 읽지 못했습니다." };
  }
}

export function DomainListBoard({
  initialRows,
  ownerOptions,
}: DomainListBoardProps) {
  const [rows, setRows] = useState(initialRows);
  const [options, setOptions] = useState(ownerOptions);
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createModalMessage, setCreateModalMessage] = useState("");
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [url, setUrl] = useState("");
  const [domainName, setDomainName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [accountModalRow, setAccountModalRow] = useState<DomainListRow | null>(null);
  const [accountModalMessage, setAccountModalMessage] = useState("");
  const [availableAccounts, setAvailableAccounts] = useState<AccountRow[]>([]);
  const [selectedLinkAccountId, setSelectedLinkAccountId] = useState("");
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLinkingAccount, setIsLinkingAccount] = useState(false);

  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const visibleRows = useMemo(
    () => rows.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [page, rows],
  );

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateModalMessage("");
    setSelectedOwnerId("");
    setUrl("");
    setDomainName("");
    setLoginId("");
    setPassword("");
    setConfirmPassword("");
    setBankName("");
    setAccountHolder("");
    setAccountNumber("");
  }

  async function openAccountModal(row: DomainListRow) {
    setAccountModalMessage("");
    setAccountModalRow(row);
    setSelectedLinkAccountId("");
    setAvailableAccounts([]);
    setIsLoadingAccounts(true);

    try {
      const response = await fetch("/api/bank-accounts");
      const data = (await response.json()) as {
        accounts?: AccountRow[];
        message?: string;
      };

      if (!response.ok) {
        setAccountModalMessage(data.message ?? "계좌 목록을 불러오지 못했습니다.");
        return;
      }

      setAvailableAccounts((data.accounts ?? []).filter((account) => account.isActive));
    } catch {
      setAccountModalMessage("계좌 목록을 불러오지 못했습니다.");
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  function closeAccountModal() {
    setAccountModalRow(null);
    setAccountModalMessage("");
    setAvailableAccounts([]);
    setSelectedLinkAccountId("");
    setIsLoadingAccounts(false);
    setIsLinkingAccount(false);
  }

  function applyPayload(data: ApiResponse) {
    if ("rows" in data) {
      setRows(data.rows);
      setOptions(data.ownerOptions);
      setPage(1);
    }
  }

  async function handleCreate() {
    if (isCreating) {
      return;
    }

    if (
      !selectedOwnerId ||
      !domainName.trim() ||
      !loginId.trim() ||
      !password.trim() ||
      !confirmPassword.trim() ||
      !bankName.trim() ||
      !accountHolder.trim() ||
      !accountNumber.trim()
    ) {
      setCreateModalMessage("URL을 제외한 모든 항목을 입력해주세요.");
      return;
    }

    if (password !== confirmPassword) {
      setCreateModalMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setIsCreating(true);
    setCreateModalMessage("");

    try {
      const response = await fetch("/api/domain-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerDistributorId: selectedOwnerId,
          url,
          domainName,
          loginId,
          password,
          confirmPassword,
          bankName,
          accountHolder,
          accountNumber,
        }),
      });
      const text = await response.text();
      const data = safeParseJson(text);

      if (!response.ok || !("rows" in data)) {
        setCreateModalMessage(data.message ?? "도메인 생성에 실패했습니다.");
        return;
      }

      applyPayload(data);
      setMessage(data.message ?? "도메인이 생성되었습니다.");
      closeCreateModal();
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggle(row: DomainListRow) {
    if (processingId) {
      return;
    }

    setProcessingId(row.id);

    try {
      const response = await fetch("/api/domain-list", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action: "toggle-status",
          depositEnabled: !row.depositEnabled,
        }),
      });
      const text = await response.text();
      const data = safeParseJson(text);

      if (!response.ok || !("rows" in data)) {
        setMessage(data.message ?? "도메인 상태 변경에 실패했습니다.");
        return;
      }

      applyPayload(data);
      setMessage(data.message ?? "도메인 상태가 변경되었습니다.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDelete(row: DomainListRow) {
    if (!window.confirm(`${row.companyName} 도메인을 삭제할까요?`)) {
      return;
    }

    setProcessingId(row.id);

    try {
      const response = await fetch("/api/domain-list", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          action: "delete",
        }),
      });
      const text = await response.text();
      const data = safeParseJson(text);

      if (!response.ok || !("rows" in data)) {
        setMessage(data.message ?? "도메인 삭제에 실패했습니다.");
        return;
      }

      applyPayload(data);
      setMessage(data.message ?? "도메인이 삭제되었습니다.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleLinkAccount() {
    if (!accountModalRow || isLinkingAccount) {
      return;
    }

    if (!selectedLinkAccountId) {
      setAccountModalMessage("연결할 계좌를 선택해주세요.");
      return;
    }

    setIsLinkingAccount(true);
    setAccountModalMessage("");

    try {
      const response = await fetch("/api/domain-list", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: accountModalRow.id,
          action: "link-account",
          accountId: selectedLinkAccountId,
        }),
      });
      const text = await response.text();
      const data = safeParseJson(text);

      if (!response.ok || !("rows" in data)) {
        setAccountModalMessage(data.message ?? "계좌 연동에 실패했습니다.");
        return;
      }

      applyPayload(data);
      setMessage(data.message ?? "계좌가 연동되었습니다.");
      closeAccountModal();
    } finally {
      setIsLinkingAccount(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-3 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            Domain Management
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            도메인 리스트
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">
            도메인 운영 계정, 출금 계좌, 보유금, 충전거래 허용 상태를 한 화면에서 관리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateModalMessage("");
            setIsCreateModalOpen(true);
          }}
          className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          도메인 생성
        </button>
      </div>

      <div className="p-5 sm:p-6">
        {message ? (
          <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            {message}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[26px] border border-white/8 bg-black/18">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px] border-collapse text-sm">
              <thead className="bg-black/48 text-white/72">
              <tr>
                {[
                  "본사",
                  "상위총판",
                  "총판",
                  "대리점",
                  "로그인ID",
                  "비밀번호",
                  "업체명",
                  "URL",
                  "업체 출금은행 정보",
                  "보유금",
                  "충전거래 생성허용",
                  "생성일",
                  "관리",
                ].map((head) => (
                  <th
                    key={head}
                    className="border-b border-white/8 px-4 py-4 text-center text-sm font-semibold"
                  >
                    {head}
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
                  <td className="px-4 py-5 text-center">
                    {row.headquarters}
                  </td>
                  <td className="px-4 py-5 text-center">
                    {row.topDistributor}
                  </td>
                  <td className="px-4 py-5 text-center">
                    {row.distributor}
                  </td>
                  <td className="px-4 py-5 text-center">
                    {row.agency}
                  </td>
                  <td className="px-4 py-5 text-center">
                    {row.loginId}
                  </td>
                  <td className="px-4 py-5 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedPasswords((current) => ({
                          ...current,
                          [row.id]: !current[row.id],
                        }))
                      }
                      className="rounded-xl bg-cyan-500/18 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/28"
                    >
                      {revealedPasswords[row.id] ? row.visiblePassword : "비밀번호 확인"}
                    </button>
                  </td>
                  <td className="px-4 py-5 text-center font-semibold text-white">
                    {row.companyName}
                  </td>
                  <td className="px-4 py-5 text-center">
                    {row.url || "-"}
                  </td>
                  <td className="px-4 py-5">
                    <div className="mx-auto max-w-[260px] rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center text-xs leading-5 text-white/80">
                      <div>{row.bankName}</div>
                      <div>{row.accountNumber}</div>
                      <div>{row.accountHolder}</div>
                    </div>
                  </td>
                  <td className="px-4 py-5 text-center font-semibold text-white">
                    {formatKoreanWon(row.balance)}
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
                  <td className="px-4 py-5 text-center text-white/60">
                    {row.createdAt}
                  </td>
                  <td className="px-4 py-5 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggle(row)}
                        disabled={processingId === row.id}
                        className="rounded-xl bg-white/8 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:bg-white/6 disabled:text-white/34"
                      >
                        {processingId === row.id ? "처리중" : row.depositEnabled ? "중지" : "허용"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void openAccountModal(row);
                        }}
                        className="rounded-xl bg-cyan-500/18 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/28"
                      >
                        계좌관리
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={processingId === row.id}
                        className="rounded-xl bg-red-500/18 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/28 disabled:cursor-not-allowed disabled:bg-white/6 disabled:text-white/34"
                      >
                        {processingId === row.id ? "처리중" : "삭제"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>

          {rows.length > rowsPerPage ? (
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[490px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">도메인 생성</h3>

            <div className="mt-9 space-y-6">
              <ModalFeedback message={createModalMessage} />
              <select
                value={selectedOwnerId}
                onChange={(event) => setSelectedOwnerId(event.target.value)}
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none"
              >
                <option value="">소속 선택</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.role === "HEADQUARTERS"
                      ? "본사"
                      : option.role === "TOP_DISTRIBUTOR"
                        ? `상위총판 · ${option.name}`
                        : `총판 · ${option.name}`}
                  </option>
                ))}
              </select>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="URL (선택)"
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                value={domainName}
                onChange={(event) => setDomainName(event.target.value)}
                placeholder="도메인 이름"
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="로그인 아이디"
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="비밀번호 확인"
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <select
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none"
              >
                <option value="">은행 선택</option>
                {bankOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <input
                value={accountHolder}
                onChange={(event) => setAccountHolder(event.target.value)}
                placeholder="예금주"
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
                placeholder="계좌번호 [- 넣어서 입력]"
                className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="mt-12 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isCreating ? "생성 중" : "생성"}
              </button>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {accountModalRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[490px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">
              계좌관리
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {accountModalRow.companyName} 계정에 연결할 계좌를 선택한 뒤 연동할 수 있습니다.
            </p>

            <div className="mt-7 space-y-5">
              <ModalFeedback message={accountModalMessage} />
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                <select
                  value={selectedLinkAccountId}
                  onChange={(event) => setSelectedLinkAccountId(event.target.value)}
                  disabled={isLoadingAccounts}
                  className="h-14 w-full rounded-xl border border-slate-300 px-5 text-sm outline-none disabled:bg-slate-100"
                >
                  <option value="">
                    {isLoadingAccounts ? "계좌 불러오는 중" : "연결할 계좌를 선택"}
                  </option>
                  {availableAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {`${account.bankName} ${account.holder} ${account.accountNumber}`}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleLinkAccount}
                  disabled={isLoadingAccounts || isLinkingAccount}
                  className="h-14 rounded-xl bg-blue-700 px-6 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isLinkingAccount ? "연동 중" : "연동"}
                </button>
              </div>
            </div>

            <div className="mt-12 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeAccountModal}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
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
