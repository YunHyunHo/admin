"use client";

import { useMemo, useState } from "react";

type FeeRateRow = {
  id: string;
  domainName: string;
  totalRate: number;
  topDistributor: string;
  topDistributorRate: number;
  distributor: string;
  distributorRate: number;
  updatedAt: string;
};

type FeeRateSettingsBoardProps = {
  companyName: string;
  initialFeeRate: number;
};

const baseRows: FeeRateRow[] = [
  {
    id: "FEE-ONEPAY",
    domainName: "원페이",
    totalRate: 0.4,
    topDistributor: "코인뱅크",
    topDistributorRate: 0.15,
    distributor: "원페이",
    distributorRate: 0.1,
    updatedAt: "05-02 10:00:00",
  },
  {
    id: "FEE-HOHOO",
    domainName: "호우 환전",
    totalRate: 0.45,
    topDistributor: "코인뱅크",
    topDistributorRate: 0.1,
    distributor: "비비",
    distributorRate: 0.1,
    updatedAt: "04-30 21:00:00",
  },
  {
    id: "FEE-BRAND",
    domainName: "비랜드 환전",
    totalRate: 0.5,
    topDistributor: "비비",
    topDistributorRate: 0.2,
    distributor: "에이원 오실장",
    distributorRate: 0.1,
    updatedAt: "04-28 23:31:18",
  },
  {
    id: "FEE-CRUBET",
    domainName: "크루벳",
    totalRate: 0.5,
    topDistributor: "비비",
    topDistributorRate: 0.1,
    distributor: "에이원 오실장",
    distributorRate: 0.1,
    updatedAt: "04-27 21:16:19",
  },
];

const rowsPerPage = 10;
const rateKeys = [
  "totalRate",
  "topDistributorRate",
  "distributorRate",
] as const;

type RateKey = (typeof rateKeys)[number];
type DraftRates = Pick<FeeRateRow, RateKey>;

function getNowStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${month}-${date} ${hours}:${minutes}:${seconds}`;
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
    totalRate: row.totalRate,
    topDistributorRate: row.topDistributorRate,
    distributorRate: row.distributorRate,
  };
}

function hasDraftChanges(row: FeeRateRow, draft: DraftRates) {
  return rateKeys.some((key) => row[key] !== draft[key]);
}

function getInitialRows(companyName: string, initialFeeRate: number) {
  return baseRows.map((row) =>
    row.domainName === companyName
      ? {
          ...row,
          totalRate: initialFeeRate,
        }
      : row,
  );
}

export function FeeRateSettingsBoard({
  companyName,
  initialFeeRate,
}: FeeRateSettingsBoardProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(() =>
    getInitialRows(companyName, initialFeeRate),
  );
  const [draftRates, setDraftRates] = useState<Record<string, DraftRates>>(() =>
    Object.fromEntries(
      getInitialRows(companyName, initialFeeRate).map((row) => [
        row.id,
        getDraftRates(row),
      ]),
    ),
  );
  const [selectedRowId, setSelectedRowId] = useState(rows[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const selectedRow = rows.find((row) => row.id === selectedRowId) ?? rows[0];

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
    const draft = draftRates[row.id] ?? getDraftRates(row);

    setSavingId(row.id);
    setMessage("");

    try {
      if (row.domainName === companyName) {
        const response = await fetch("/api/settings/fee-rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feeRate: draft.totalRate }),
        });
        const data = (await response.json()) as { message?: string };

        if (!response.ok) {
          throw new Error(data.message ?? "수수료 요율 저장에 실패했습니다.");
        }
      }

      setRows((current) =>
        current.map((currentRow) =>
          currentRow.id === row.id
            ? {
                ...currentRow,
                ...draft,
                updatedAt: getNowStamp(),
              }
            : currentRow,
        ),
      );
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
            본사와 대리점 단계는 제외하고, 업체별 총 수수료를 상위총판과 총판에 어떻게 배분할지 관리하는 화면입니다.
          </p>
        </div>

        <div className="rounded-2xl border border-cyan-400/18 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
          현재 업체 기본 요율: <strong>{initialFeeRate}%</strong>
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
              placeholder="업체(도메인), 상위총판, 총판 검색"
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 text-sm text-white outline-none transition placeholder:text-white/34 focus:border-cyan-300/40"
            />
          </label>

          <div className="overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-black/52 text-white/72">
                <tr>
                  {[
                    "업체(도메인)",
                    "업체 총 수수료",
                    "상위총판",
                    "상위총판 요율",
                    "총판",
                    "총판 요율",
                    "잔여",
                    "수정일",
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
                {visibleRows.map((row) => {
                  const draft = draftRates[row.id] ?? getDraftRates(row);
                  const remainder = clampRate(
                    draft.totalRate -
                      draft.topDistributorRate -
                      draft.distributorRate,
                  );
                  const isChanged = hasDraftChanges(row, draft);

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRowId(row.id)}
                      className={`cursor-pointer border-b border-white/8 text-white/76 last:border-b-0 ${
                        row.id === selectedRow?.id
                          ? "bg-cyan-400/[0.06]"
                          : "hover:bg-white/[0.025]"
                      }`}
                    >
                      <td className="px-4 py-4 text-center font-semibold text-white">
                        {row.domainName}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <RateInput
                          value={draft.totalRate}
                          onChange={(value) =>
                            updateDraftRate(row.id, "totalRate", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4 text-center">
                        {row.topDistributor}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <RateInput
                          value={draft.topDistributorRate}
                          onChange={(value) =>
                            updateDraftRate(row.id, "topDistributorRate", value)
                          }
                        />
                      </td>
                      <td className="px-4 py-4 text-center">{row.distributor}</td>
                      <td className="px-4 py-4 text-center">
                        <RateInput
                          value={draft.distributorRate}
                          onChange={(value) =>
                            updateDraftRate(row.id, "distributorRate", value)
                          }
                        />
                      </td>
                      <td
                        className={`px-4 py-4 text-center font-semibold ${
                          remainder < 0 ? "text-red-200" : "text-white"
                        }`}
                      >
                        {remainder}%
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
                          disabled={!isChanged || savingId === row.id}
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
}: {
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="number"
        min="0"
        max="100"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-20 rounded-xl border border-white/10 bg-black/18 px-3 text-center text-sm font-semibold text-white outline-none focus:border-cyan-300/40"
      />
      <span className="font-semibold text-white/64">%</span>
    </div>
  );
}
