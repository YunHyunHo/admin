"use client";

import { useMemo, useState } from "react";

import { getKoreanNowStamp } from "@/lib/korean-time";
import { ModalFeedback } from "@/components/modal-feedback";

type FeeRateRow = {
  id: string;
  domainId?: string;
  distributorId?: string;
  vendorName: string;
  domainName: string;
  totalRate: number;
  companyName: string;
  companyRate: number;
  topDistributor: string;
  topDistributorRate: number;
  distributor: string;
  distributorRate: number;
  updatedAt: string;
};

type FeeRateSettingsBoardProps = {
  initialRows: FeeRateRow[];
  canManageFeeRates: boolean;
};

const rowsPerPage = 10;
const rateKeys = ["companyRate", "topDistributorRate", "distributorRate"] as const;

type RateKey = (typeof rateKeys)[number];
type DraftRates = Pick<FeeRateRow, RateKey>;
type EditTarget = "company" | "topDistributor" | "distributor";

type EditModalState = {
  rowId: string;
  target: EditTarget;
} | null;

function getNowStamp() {
  return getKoreanNowStamp();
}

function clampRate(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return Number(value.toFixed(2));
}

function getDraftRates(row: FeeRateRow): DraftRates {
  return {
    companyRate: row.companyRate,
    topDistributorRate: row.topDistributorRate,
    distributorRate: row.distributorRate,
  };
}

function hasDraftChanges(row: FeeRateRow, draft: DraftRates, key?: RateKey) {
  if (key) {
    return row[key] !== draft[key];
  }

  return rateKeys.some((candidate) => row[candidate] !== draft[candidate]);
}

export function FeeRateSettingsBoard({
  initialRows,
  canManageFeeRates,
}: FeeRateSettingsBoardProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initialRows);
  const [draftRates, setDraftRates] = useState<Record<string, DraftRates>>(() =>
    Object.fromEntries(
      initialRows.map((row) => [row.id, getDraftRates(row)]),
    ),
  );
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<EditModalState>(null);
  const [modalSelection, setModalSelection] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return rows;
    }

    return rows.filter((row) =>
      [row.vendorName, row.domainName, row.topDistributor, row.distributor]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const visibleRows = filteredRows.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage,
  );

  function updateDraftRate(id: string, key: RateKey, value: string) {
    const nextValue = clampRate(Number(value));

    setDraftRates((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? getDraftRates(rows.find((row) => row.id === id)!)),
        [key]: nextValue,
      },
    }));
  }

  function openEditModal(row: FeeRateRow, target: EditTarget) {
    const selected =
      target === "company"
        ? row.companyName
        : target === "topDistributor"
          ? row.topDistributor
          : row.distributor;

    setEditModal({ rowId: row.id, target });
    setModalSelection(selected === "-" ? "" : selected);
    setModalMessage("");
  }

  function closeEditModal() {
    setEditModal(null);
    setModalSelection("");
    setModalMessage("");
  }

  function submitEditModal() {
    if (!modalSelection) {
      setModalMessage("변경할 대상을 선택해주세요.");
      return;
    }

    setMessage("연결 대상 팝업을 확인했습니다. 비율 수정은 맨 끝 비율수정 버튼으로 저장됩니다.");
    closeEditModal();
  }

  async function saveRate(row: FeeRateRow, key?: RateKey) {
    if (!canManageFeeRates) {
      setMessage("수수료 수정은 마스터 계정만 가능합니다.");
      return;
    }

    const draft = draftRates[row.id] ?? getDraftRates(row);
    const nextDraft = {
      companyRate: key === "companyRate" ? draft.companyRate : row.companyRate,
      topDistributorRate:
        key === "topDistributorRate" ? draft.topDistributorRate : row.topDistributorRate,
      distributorRate:
        key === "distributorRate" ? draft.distributorRate : row.distributorRate,
    };

    setSavingId(row.id);
    setMessage("");

    try {
      const response = await fetch("/api/settings/fee-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          domainId: row.domainId,
          distributorId: row.distributorId,
          companyRate: nextDraft.companyRate,
          topDistributorRate: nextDraft.topDistributorRate,
          distributorRate: nextDraft.distributorRate,
        }),
      });
      const data = (await response.json()) as {
        message?: string;
        rows?: FeeRateRow[];
      };

      if (!response.ok) {
        throw new Error(data.message ?? "수수료 요율 저장에 실패했습니다.");
      }

      if (data.rows) {
        setRows(data.rows);
        setDraftRates(
          Object.fromEntries(data.rows.map((nextRow) => [nextRow.id, getDraftRates(nextRow)])),
        );
      } else {
        setRows((current) =>
            current.map((currentRow) =>
              currentRow.id === row.id
                ? {
                  ...currentRow,
                  ...nextDraft,
                  totalRate: Number(
                    (
                      nextDraft.companyRate +
                      nextDraft.topDistributorRate +
                      nextDraft.distributorRate
                    ).toFixed(2),
                  ),
                  updatedAt: getNowStamp(),
                }
              : currentRow,
          ),
        );
      }
      setMessage(`${row.domainName} 수수료가 수정되었습니다.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "수수료 요율 저장에 실패했습니다.",
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            Fee Rate Management
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            수수료 관리
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52">
            도메인 생성에서 만든 업체(도메인) 계정 기준으로 본사, 상위총판, 총판 수수료율을 각각 관리합니다.
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="space-y-4">
          {message ? (
            <p className="rounded-2xl border border-cyan-300/16 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-50/86">
              {message}
            </p>
          ) : null}

          <label className="block">
            <span className="sr-only">업체 검색</span>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="업체 또는 총판 검색"
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-cyan-300/40"
            />
          </label>

          <div className="overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
            <table className="w-full min-w-[1480px] border-collapse text-left text-sm">
              <thead className="bg-black/52 text-white/72">
                <tr>
                  {[
                    "업체(도메인)",
                    "업체 총 수수료",
                    "본사",
                    "상위총판",
                    "총판",
                    "수정일",
                  ].map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      className="border-b border-white/8 px-4 py-4 text-center font-semibold"
                    >
                      {header}
                    </th>
                  ))}
                  <th className="sticky right-0 border-b border-l border-white/8 bg-black/90 px-4 py-4 text-center font-semibold backdrop-blur">
                    비율수정
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const draft = draftRates[row.id] ?? getDraftRates(row);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-white/8 text-white/76 last:border-b-0 hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        {row.vendorName}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        {(
                          draft.companyRate +
                          draft.topDistributorRate +
                          draft.distributorRate
                        ).toFixed(2)}
                        %
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-white">{row.companyName}</span>
                          <RateInput
                            value={draft.companyRate}
                            disabled={!canManageFeeRates}
                            onChange={(value) =>
                              updateDraftRate(row.id, "companyRate", value)
                            }
                          />
                          <button
                            type="button"
                            onClick={() => openEditModal(row, "company")}
                            className="rounded-xl bg-white/14 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                          >
                            수정
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        {row.topDistributor === "-" ? (
                          "-"
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <span>{row.topDistributor}</span>
                            <RateInput
                              value={draft.topDistributorRate}
                              disabled={!canManageFeeRates}
                              onChange={(value) =>
                                updateDraftRate(row.id, "topDistributorRate", value)
                              }
                            />
                            <button
                              type="button"
                              onClick={() => openEditModal(row, "topDistributor")}
                              className="rounded-xl bg-white/14 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                            >
                              수정
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        {row.distributor === "-" ? (
                          "-"
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            <span>{row.distributor}</span>
                            <RateInput
                              value={draft.distributorRate}
                              disabled={!canManageFeeRates}
                              onChange={(value) =>
                                updateDraftRate(row.id, "distributorRate", value)
                              }
                            />
                            <button
                              type="button"
                              onClick={() => openEditModal(row, "distributor")}
                              className="rounded-xl bg-white/14 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
                            >
                              수정
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center text-white/52">
                        {row.updatedAt}
                      </td>
                      <td className="sticky right-0 border-l border-white/8 bg-[rgba(12,16,24,0.96)] px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => void saveRate(row)}
                          disabled={
                            !canManageFeeRates ||
                            !hasDraftChanges(row, draft) ||
                            savingId === row.id
                          }
                          className="rounded-xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
                        >
                          {savingId === row.id ? "저장 중" : "수정"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
      </div>

      {editModal ? (
        <EditTargetModal
          row={rows.find((row) => row.id === editModal.rowId) ?? null}
          target={editModal.target}
          selection={modalSelection}
          message={modalMessage}
          onSelectionChange={setModalSelection}
          onClose={closeEditModal}
          onSubmit={submitEditModal}
        />
      ) : null}
    </section>
  );
}

function RateInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-20 rounded-xl border border-white/10 bg-black/18 px-3 text-center text-sm font-semibold text-white outline-none focus:border-cyan-300/40 disabled:cursor-not-allowed disabled:text-white/40"
      />
      <span className="font-semibold text-white/64">%</span>
    </div>
  );
}

function EditTargetModal({
  row,
  target,
  selection,
  message,
  onSelectionChange,
  onClose,
  onSubmit,
}: {
  row: FeeRateRow | null;
  target: EditTarget;
  selection: string;
  message: string;
  onSelectionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!row) {
    return null;
  }

  const title =
    target === "company"
      ? "본사 변경"
      : target === "topDistributor"
        ? "상위총판 변경"
        : "총판 변경";

  const options = getTargetOptions(row, target);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[32px] bg-white px-10 py-11 shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
        <h3 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950">
          {title}
        </h3>
        <div className="mt-10 space-y-5">
          <label className="block">
            <span className="sr-only">{title}</span>
            <select
              value={selection}
              onChange={(event) => onSelectionChange(event.target.value)}
              className="h-24 w-full rounded-2xl border border-slate-300 px-6 text-2xl text-slate-950 outline-none transition focus:border-slate-500"
            >
              <option value="">선택</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <ModalFeedback message={message} />
        </div>
        <div className="mt-10 flex justify-end gap-4">
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-xl bg-blue-600 px-8 py-4 text-2xl font-semibold text-white transition hover:bg-blue-500"
          >
            변경
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-red-600 px-8 py-4 text-2xl font-semibold text-white transition hover:bg-red-500"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function getTargetOptions(row: FeeRateRow, target: EditTarget) {
  if (target === "company") {
    return ["본사"];
  }

  const value = target === "topDistributor" ? row.topDistributor : row.distributor;
  return value === "-" ? [] : [value];
}
