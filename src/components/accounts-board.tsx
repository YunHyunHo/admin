"use client";

import { useState } from "react";

import { getKoreanNowStamp } from "@/lib/korean-time";
import type { AccountRow } from "@/lib/bank-accounts-types";
import { ModalFeedback } from "@/components/modal-feedback";

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

const fallbackAccounts: AccountRow[] = [
  {
    id: "ACC-001",
    branchName: "본사",
    creator: "총관리자",
    bankName: "신한은행",
    holder: "오승택(오픈뱅킹,타명의,ATM 입금불가)",
    accountNumber: "010-805521-6565",
    createdAt: "03-19 22:46:48",
    isActive: true,
    linkedDomains: [
      {
        id: "25920d80-0cb8-10e6-974c-001",
        name: "원페이",
        address: "onepay.laylow.me",
        userCount: 2,
      },
    ],
  },
  {
    id: "ACC-002",
    branchName: "본사",
    creator: "총관리자",
    bankName: "농협은행",
    holder: "이예진",
    accountNumber: "356-1125-3128-39",
    createdAt: "03-16 16:54:15",
    isActive: true,
    linkedDomains: [],
  },
  {
    id: "ACC-003",
    branchName: "본사",
    creator: "한컴퍼니",
    bankName: "카카오뱅크",
    holder: "김수용",
    accountNumber: "3333-14516-8010",
    createdAt: "03-13 21:46:19",
    isActive: true,
    linkedDomains: [],
  },
  {
    id: "ACC-004",
    branchName: "본사",
    creator: "총관리자",
    bankName: "카카오뱅크",
    holder: "이준희(오픈뱅킹,타명의,ATM 입금불가)",
    accountNumber: "3333-17-5930161",
    createdAt: "02-26 11:47:43",
    isActive: true,
    linkedDomains: [],
  },
  {
    id: "ACC-005",
    branchName: "본사",
    creator: "총관리자",
    bankName: "전북은행",
    holder: "이준희(오픈뱅킹,타명의,ATM 입금불가)",
    accountNumber: "3333-17-5930161",
    createdAt: "02-20 18:55:30",
    isActive: true,
    linkedDomains: [],
  },
  {
    id: "ACC-006",
    branchName: "본사",
    creator: "총관리자",
    bankName: "농협은행",
    holder: "홍예빈",
    accountNumber: "010-2321-8415-09",
    createdAt: "02-11 22:50:43",
    isActive: true,
    linkedDomains: [],
  },
  {
    id: "ACC-007",
    branchName: "본사",
    creator: "총관리자",
    bankName: "농협은행",
    holder: "권기준",
    accountNumber: "352-1942-2732-13",
    createdAt: "02-06 15:01:49",
    isActive: true,
    linkedDomains: [],
  },
  {
    id: "ACC-008",
    branchName: "본사",
    creator: "총관리자",
    bankName: "하나은행",
    holder: "이정민",
    accountNumber: "546-910138-56607",
    createdAt: "02-05 05:46:24",
    isActive: true,
    linkedDomains: [],
  },
  {
    id: "ACC-009",
    branchName: "본사",
    creator: "총관리자",
    bankName: "우체국은행",
    holder: "정희섭",
    accountNumber: "702910-02-171289",
    createdAt: "01-24 17:38:54",
    isActive: false,
    linkedDomains: [],
  },
];

const rowsPerPage = 10;

type AccountsBoardProps = {
  initialAccounts?: AccountRow[];
  canCreateAccounts?: boolean;
  canManageAccounts?: boolean;
};

function getNowStamp() {
  return getKoreanNowStamp();
}

export function AccountsBoard({
  initialAccounts = fallbackAccounts,
  canCreateAccounts = true,
  canManageAccounts = true,
}: AccountsBoardProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createModalMessage, setCreateModalMessage] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );
  const [linkedDomainPage, setLinkedDomainPage] = useState(1);
  const [editingField, setEditingField] = useState<{
    accountId: string;
    field: "bankName" | "holder" | "accountNumber";
  } | null>(null);
  const [bankName, setBankName] = useState("");
  const [holder, setHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [message, setMessage] = useState("");
  const pageCount = Math.max(1, Math.ceil(accounts.length / rowsPerPage));
  const visibleAccounts = accounts.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );
  const selectedAccount = accounts.find(
    (account) => account.id === selectedAccountId,
  );
  const linkedDomainPageCount = Math.max(
    1,
    Math.ceil((selectedAccount?.linkedDomains.length ?? 0) / rowsPerPage),
  );
  const visibleLinkedDomains =
    selectedAccount?.linkedDomains.slice(
      (linkedDomainPage - 1) * rowsPerPage,
      linkedDomainPage * rowsPerPage,
    ) ?? [];

  function updateAccount(
    id: string,
    key: "bankName" | "holder" | "accountNumber",
    value: string,
  ) {
    setAccounts((current) =>
      current.map((account) =>
        account.id === id ? { ...account, [key]: value } : account,
      ),
    );
  }

  function applyAccountsResponse(payload: { accounts?: AccountRow[]; message?: string }) {
    if (payload.accounts) {
      setAccounts(payload.accounts);
    }

    if (payload.message) {
      setMessage(payload.message);
    }
  }

  async function persistAccountPatch(payload: {
    id: string;
    action: "update" | "toggle-active" | "delete";
    bankName?: string;
    holder?: string;
    accountNumber?: string;
    isActive?: boolean;
  }) {
    const response = await fetch("/api/bank-accounts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as {
      accounts?: AccountRow[];
      message?: string;
    };

    if (!response.ok) {
      setMessage(data.message ?? "계좌 수정 중 오류가 발생했습니다.");
      return;
    }

    applyAccountsResponse(data);
  }

  function toggleActive(id: string) {
    const nextAccount = accounts.find((account) => account.id === id);

    if (!nextAccount) {
      return;
    }

    setAccounts((current) =>
      current.map((account) =>
        account.id === id
          ? { ...account, isActive: !account.isActive }
          : account,
      ),
    );
    void persistAccountPatch({
      id,
      action: "toggle-active",
      isActive: !nextAccount.isActive,
    });
  }

  function handleDelete(id: string) {
    setAccounts((current) => current.filter((account) => account.id !== id));
    setPage(1);
    void persistAccountPatch({ id, action: "delete" });
  }

  function unlinkDomain(accountId: string, domainId: string) {
    setAccounts((current) =>
      current.map((account) =>
        account.id === accountId
          ? {
              ...account,
              linkedDomains: account.linkedDomains.filter(
                (domain) => domain.id !== domainId,
              ),
            }
          : account,
      ),
    );
  }

  function saveAccount(id: string) {
    const account = accounts.find((current) => current.id === id);

    if (!account) {
      return;
    }

    if (
      !account.bankName.trim() ||
      !account.holder.trim() ||
      !account.accountNumber.trim()
    ) {
      setMessage("은행, 예금주, 계좌번호를 모두 입력해주세요.");
      return;
    }

    void persistAccountPatch({
      id,
      action: "update",
      bankName: account.bankName,
      holder: account.holder,
      accountNumber: account.accountNumber,
    });
  }

  async function handleCreate() {
    if (isCreating) {
      return;
    }

    if (!bankName || !holder || !accountNumber) {
      setCreateModalMessage("은행, 예금주, 계좌번호를 모두 입력해주세요.");
      return;
    }

    setIsCreating(true);
    setCreateModalMessage("");

    try {
      const response = await fetch("/api/bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankName,
          holder,
          accountNumber,
        }),
      });
      const data = (await response.json()) as {
        accounts?: AccountRow[];
        account?: AccountRow;
        message?: string;
      };

      if (!response.ok) {
        setCreateModalMessage(data.message ?? "계좌 생성 중 오류가 발생했습니다.");
        return;
      }

      if (data.accounts) {
        setAccounts(data.accounts);
      } else if (data.account) {
        setAccounts((current) => [data.account!, ...current]);
      } else {
        const nextAccount: AccountRow = {
          id: `ACC-${Date.now().toString().slice(-6)}`,
          branchName: "본사",
          creator: "총관리자",
          bankName,
          holder,
          accountNumber,
          createdAt: getNowStamp(),
          isActive: true,
          linkedDomains: [],
        };

        setAccounts((current) => [nextAccount, ...current]);
      }

      setPage(1);
      setBankName("");
      setHolder("");
      setAccountNumber("");
      setMessage(data.message ?? "계좌가 생성되었습니다.");
      setIsCreateModalOpen(false);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            Account Management
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            계좌관리
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/52">
            충전 신청 입금 확인에 사용할 입금 계좌를 관리하는 화면입니다.
          </p>
        </div>

        {canCreateAccounts ? (
          <button
            type="button"
            onClick={() => {
              setCreateModalMessage("");
              setIsCreateModalOpen(true);
            }}
            className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400"
          >
            계좌생성
          </button>
        ) : null}
      </div>

      <div className="p-5 sm:p-6">
        {message ? (
          <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
            {message}
          </div>
        ) : null}

        <div className="min-h-[680px] overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
            <thead className="bg-black/52 text-white/72">
              <tr>
                {[
                  "본사명",
                  "생성자",
                  "은행명",
                  "예금주",
                  "계좌번호",
                  "생성일",
                  "사용여부",
                  "연결된 도메인",
                  ...(canManageAccounts ? ["삭제"] : []),
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
              {visibleAccounts.map((account) => (
                <tr
                  key={account.id}
                  className="border-b border-white/8 text-white/76 last:border-b-0"
                >
                  <td className="px-4 py-4 text-center">{account.branchName}</td>
                  <td className="px-4 py-4 text-center">{account.creator}</td>
                  <td className="px-4 py-4">
                    <EditableField
                      accountId={account.id}
                      field="bankName"
                      value={account.bankName}
                      onChange={(value) =>
                        updateAccount(account.id, "bankName", value)
                      }
                      onCommit={() => saveAccount(account.id)}
                      canEdit={canManageAccounts}
                      editingField={editingField}
                      setEditingField={setEditingField}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <EditableField
                      accountId={account.id}
                      field="holder"
                      value={account.holder}
                      onChange={(value) =>
                        updateAccount(account.id, "holder", value)
                      }
                      onCommit={() => saveAccount(account.id)}
                      canEdit={canManageAccounts}
                      editingField={editingField}
                      setEditingField={setEditingField}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <EditableField
                      accountId={account.id}
                      field="accountNumber"
                      value={account.accountNumber}
                      onChange={(value) =>
                        updateAccount(account.id, "accountNumber", value)
                      }
                      onCommit={() => saveAccount(account.id)}
                      canEdit={canManageAccounts}
                      editingField={editingField}
                      setEditingField={setEditingField}
                    />
                  </td>
                  <td className="px-4 py-4 text-center text-white/60">
                    {account.createdAt}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className={
                          account.isActive ? "text-blue-300" : "text-white/38"
                        }
                      >
                        {account.isActive ? "사용중" : "중지됨"}
                      </span>
                      {canManageAccounts ? (
                        <button
                          type="button"
                          onClick={() => toggleActive(account.id)}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold text-white transition ${
                            account.isActive
                              ? "bg-red-600 hover:bg-red-500"
                              : "bg-blue-600 hover:bg-blue-500"
                          }`}
                        >
                          {account.isActive ? "중지하기" : "사용하기"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span>{account.linkedDomains.length}개</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAccountId(account.id);
                          setLinkedDomainPage(1);
                        }}
                        className="rounded-xl bg-teal-400/80 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-teal-300"
                      >
                        보기
                      </button>
                    </div>
                  </td>
                  {canManageAccounts ? (
                    <td className="px-4 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(account.id)}
                        className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-600"
                      >
                        삭제
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>

          {accounts.length > rowsPerPage ? (
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
          <div className="w-full max-w-[440px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-xl font-semibold tracking-[-0.03em]">
              계좌 생성
            </h3>

            <div className="mt-7 space-y-4">
              <ModalFeedback message={createModalMessage} />
              <label className="block">
                <span className="sr-only">은행 선택</span>
                <select
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-slate-500"
                >
                  <option value="">은행 선택</option>
                  {bankOptions.map((bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">예금주</span>
                <input
                  value={holder}
                  onChange={(event) => setHolder(event.target.value)}
                  placeholder="예금주"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">계좌번호</span>
                <input
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  placeholder="계좌번호 [- 넣어서 입력]"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>
            </div>

            <div className="mt-10 flex justify-end gap-2">
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
                onClick={() => {
                  setCreateModalMessage("");
                  setIsCreateModalOpen(false);
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedAccountId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,_rgba(14,18,26,0.98)_0%,_rgba(9,12,18,0.99)_100%)] p-6 text-white shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/55">
                  Linked Domains
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                  연결된 도메인
                </h3>
                <p className="mt-2 text-sm text-white/48">
                  선택한 계좌로 입금 확인에 사용하는 도메인명과 도메인 주소를 확인합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAccountId(null)}
                className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
              >
                닫기
              </button>
            </div>

            <div className="mt-8 overflow-x-auto">
              <div className="overflow-hidden rounded-[26px] border border-white/8 bg-black/18">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-black/52 text-white/72">
                  <tr>
                    {[
                      "도메인명",
                      "도메인주소",
                      "사용자수",
                      ...(canManageAccounts ? ["관리"] : []),
                    ].map((header) => (
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
                  {visibleLinkedDomains.map((domain) => (
                      <tr key={domain.id} className="border-b border-white/8 text-white/86 last:border-b-0">
                        <td className="px-4 py-4 text-center font-semibold">
                          {domain.name}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {domain.address}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {domain.userCount}
                        </td>
                        {canManageAccounts ? (
                          <td className="px-4 py-4 text-center">
                            <button
                              type="button"
                              onClick={() =>
                                unlinkDomain(selectedAccountId, domain.id)
                              }
                              className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
                            >
                              연동해제
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                </tbody>
              </table>
              </div>

              {(selectedAccount?.linkedDomains.length ?? 0) > rowsPerPage ? (
                <div className="flex items-center justify-center gap-2 px-4 py-5">
                  {Array.from(
                    { length: linkedDomainPageCount },
                    (_, index) => index + 1,
                  ).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => setLinkedDomainPage(pageNumber)}
                      className={`h-10 min-w-10 rounded-xl px-3 text-lg font-semibold ${
                        linkedDomainPage === pageNumber
                          ? "bg-white text-slate-950"
                          : "bg-black text-white"
                      }`}
                    >
                      {pageNumber}
                    </button>
                  ))}
                </div>
              ) : null}

              {!selectedAccount?.linkedDomains.length ? (
                <p className="rounded-[26px] border border-white/8 bg-black/18 px-4 py-8 text-center text-sm text-white/48">
                  연결된 도메인이 없습니다.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EditableField({
  accountId,
  field,
  value,
  onChange,
  onCommit,
  canEdit,
  editingField,
  setEditingField,
}: {
  accountId: string;
  field: "bankName" | "holder" | "accountNumber";
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  canEdit: boolean;
  editingField: {
    accountId: string;
    field: "bankName" | "holder" | "accountNumber";
  } | null;
  setEditingField: (
    value: {
      accountId: string;
      field: "bankName" | "holder" | "accountNumber";
    } | null,
  ) => void;
}) {
  const isEditing =
    editingField?.accountId === accountId && editingField.field === field;

  if (!canEdit) {
    return <span className="block text-center text-white/76">{value}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={!isEditing}
        className={`h-10 min-w-[210px] flex-1 rounded-xl border bg-white px-3 text-sm text-slate-950 outline-none transition ${
          isEditing ? "border-cyan-300" : "border-white/8"
        }`}
      />
      <button
        type="button"
        onClick={() => {
          if (isEditing) {
            onCommit();
          }

          setEditingField(isEditing ? null : { accountId, field });
        }}
        className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-semibold text-white"
      >
        수정
      </button>
    </div>
  );
}
