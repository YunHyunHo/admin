"use client";

import { useMemo, useState } from "react";

import { ModalFeedback } from "@/components/modal-feedback";
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

function truncateId(value: string) {
  return value.length > 12 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
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
      !url.trim() ||
      !domainName.trim() ||
      !loginId.trim() ||
      !password.trim() ||
      !confirmPassword.trim() ||
      !bankName.trim() ||
      !accountHolder.trim() ||
      !accountNumber.trim()
    ) {
      setCreateModalMessage("모든 항목을 입력해주세요.");
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

  return (
    <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,18,18,0.95)_0%,_rgba(14,14,16,0.98)_100%)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
          도메인 리스트
        </h2>
        <button
          type="button"
          onClick={() => {
            setCreateModalMessage("");
            setIsCreateModalOpen(true);
          }}
          className="h-12 rounded-xl bg-fuchsia-600 px-5 text-sm font-semibold text-white transition hover:bg-fuchsia-500"
        >
          도메인 추가
        </button>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-cyan-300/16 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-50/86">
          {message}
        </p>
      ) : null}

      <div className="mt-4 overflow-hidden border border-white/24 bg-black/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1700px] border-collapse text-sm">
            <thead className="bg-black/72 text-white">
              <tr>
                {[
                  "ID",
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
                  "텔레알림",
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
              {visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/16 bg-white/[0.035] text-white/88 last:border-b-0"
                >
                  <td className="border border-white/18 px-4 py-4 text-center font-semibold">
                    {truncateId(row.id)}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.headquarters}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.topDistributor}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.distributor}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.agency}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.loginId}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedPasswords((current) => ({
                          ...current,
                          [row.id]: !current[row.id],
                        }))
                      }
                      className="rounded-lg bg-teal-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-300"
                    >
                      {revealedPasswords[row.id] ? row.visiblePassword : "비밀번호 확인"}
                    </button>
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center font-semibold">
                    {row.companyName}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.url}
                  </td>
                  <td className="border border-white/18 px-4 py-4">
                    <div className="space-y-1 text-center text-sm">
                      <div>{row.bankName}</div>
                      <div>{row.accountHolder}</div>
                      <div>{row.accountNumber}</div>
                    </div>
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center font-semibold">
                    {formatKoreanWon(row.balance)}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleToggle(row)}
                      disabled={processingId === row.id}
                      className={`h-8 w-16 rounded-full px-1 transition ${
                        row.depositEnabled ? "bg-white/90" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`block h-6 w-6 rounded-full bg-white shadow transition ${
                          row.depositEnabled
                            ? "translate-x-8 bg-cyan-400"
                            : "translate-x-0 bg-white/80"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    {row.createdAt}
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = "/dashboard/accounts";
                        }}
                        className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-600"
                      >
                        계좌관리
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={processingId === row.id}
                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                      >
                        {processingId === row.id ? "처리중" : "삭제"}
                      </button>
                    </div>
                  </td>
                  <td className="border border-white/18 px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => setMessage("텔레알림 관리는 다음 단계에서 연결할게요.")}
                      className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-600"
                    >
                      알림관리
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length > rowsPerPage ? (
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
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">도메인 생성</h3>

            <div className="mt-9 space-y-6">
              <ModalFeedback message={createModalMessage} />
              <select
                value={selectedOwnerId}
                onChange={(event) => setSelectedOwnerId(event.target.value)}
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none"
              >
                <option value="">총판 선택</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="URL"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                value={domainName}
                onChange={(event) => setDomainName(event.target.value)}
                placeholder="도메인 이름"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="로그인 아이디"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="비밀번호 확인"
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <select
                value={bankName}
                onChange={(event) => setBankName(event.target.value)}
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none"
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
                className="h-14 w-full rounded border border-slate-300 px-5 text-sm outline-none placeholder:text-slate-400"
              />
              <input
                value={accountNumber}
                onChange={(event) => setAccountNumber(event.target.value)}
                placeholder="계좌번호 [- 넣어서 입력]"
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
                onClick={closeCreateModal}
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
