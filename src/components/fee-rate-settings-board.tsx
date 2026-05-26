"use client";

import { useMemo, useState } from "react";

import { getKoreanNowStamp } from "@/lib/korean-time";

type FeeRateRow = {
  id: string;
  domainId?: string;
  distributorId?: string;
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
  companyName: string;
  initialFeeRate: number;
  initialRows: FeeRateRow[];
  canManageFeeRates: boolean;
};

const rowsPerPage = 10;
const rateKeys = ["companyRate", "topDistributorRate", "distributorRate"] as const;

type RateKey = (typeof rateKeys)[number];
type DraftRates = Pick<FeeRateRow, RateKey>;

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

function hasDraftChanges(row: FeeRateRow, draft: DraftRates) {
  return rateKeys.some((key) => row[key] !== draft[key]);
}

export function FeeRateSettingsBoard({
  initialFeeRate,
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

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return rows;
    }

    return rows.filter((row) =>
      [row.domainName, row.topDistributor, row.distributor]
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

  async function saveRate(row: FeeRateRow) {
    if (!canManageFeeRates) {
      setMessage("수수료 수정은 마스터 계정만 가능합니다.");
      return;
    }

    const draft = draftRates[row.id] ?? getDraftRates(row);

    setSavingId(row.id);
    setMessage("");

    try {
      const response = await fetch("/api/settings/fee-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          domainId: row.domainId ?? row.id,
          distributorId: row.distributorId,
          companyRate: draft.companyRate,
          topDistributorRate: draft.topDistributorRate,
          distributorRate: draft.distributorRate,
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
                  ...draft,
                  totalRate: Number(
                    (
                      draft.companyRate +
                      draft.topDistributorRate +
                      draft.distributorRate
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

        <div className="rounded-2xl border border-cyan-400/18 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
          현재 기본 요율: <strong>{initialFeeRate}%</strong>
          {!canManageFeeRates ? (
            <span className="ml-2 text-cyan-100/70">읽기 전용</span>
          ) : null}
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
              placeholder="도메인 또는 총판 검색"
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
                    "비율수정",
                  ].map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      className="border-b border-white/8 px-4 py-4 text-center font-semibold"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const draft = draftRates[row.id] ?? getDraftRates(row);
                  const isChanged = hasDraftChanges(row, draft);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-white/8 text-white/76 last:border-b-0 hover:bg-white/[0.025]"
                    >
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        {row.domainName}
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
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        <div className="flex items-center justify-center gap-2">
                          <span>{row.topDistributor}</span>
                          <RateInput
                            value={draft.topDistributorRate}
                            disabled={!canManageFeeRates}
                            onChange={(value) =>
                              updateDraftRate(row.id, "topDistributorRate", value)
                            }
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        <div className="flex items-center justify-center gap-2">
                          <span>{row.distributor}</span>
                          <RateInput
                            value={draft.distributorRate}
                            disabled={!canManageFeeRates}
                            onChange={(value) =>
                              updateDraftRate(row.id, "distributorRate", value)
                            }
                          />
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-white/52">
                        {row.updatedAt}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void saveRate(row);
                          }}
                          disabled={!canManageFeeRates || !isChanged || savingId === row.id}
                          className="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-white/12 disabled:text-white/34"
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
