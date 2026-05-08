"use client";

import { useMemo, useState } from "react";
import type {
  PendingRequest,
  ProcessedRequest,
} from "@/lib/charge-utils";

type ChargeRequestsBoardProps = {
  initialPendingRequests: PendingRequest[];
  initialApprovedRequests: ProcessedRequest[];
  initialRejectedRequests: ProcessedRequest[];
};

type ChargeRequestsResponse = {
  pending: PendingRequest[];
  approved: ProcessedRequest[];
  rejected: ProcessedRequest[];
};

const rowsPerPage = 10;

function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-300/55">
            Table View
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            {title}
          </h3>
        </div>
        <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-sm text-white/72">
          {count}건
        </div>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/8">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function PaginationControls({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2 border-x border-b border-white/8 px-4 py-5">
      {Array.from({ length: pageCount }, (_, index) => index + 1).map(
        (pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
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
  );
}

export function ChargeRequestsBoard({
  initialPendingRequests,
  initialApprovedRequests,
  initialRejectedRequests,
}: ChargeRequestsBoardProps) {
  const [pendingRequests, setPendingRequests] = useState(initialPendingRequests);
  const [approvedRequests, setApprovedRequests] = useState(initialApprovedRequests);
  const [rejectedRequests, setRejectedRequests] = useState(initialRejectedRequests);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [pendingPage, setPendingPage] = useState(1);
  const [approvedPage, setApprovedPage] = useState(1);
  const [rejectedPage, setRejectedPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [message, setMessage] = useState("임시 서버 API로 테스트 중입니다.");

  function applyServerData(data: ChargeRequestsResponse) {
    setPendingRequests(data.pending);
    setApprovedRequests(data.approved);
    setRejectedRequests(data.rejected);
    setPendingPage(1);
    setApprovedPage(1);
    setRejectedPage(1);
  }

  async function requestChargeData(body?: Record<string, string>) {
    const response = await fetch("/api/charge-requests", {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json()) as { message?: string };
      throw new Error(error.message ?? "임시 API 요청에 실패했습니다.");
    }

    return (await response.json()) as ChargeRequestsResponse;
  }

  async function refreshRequests() {
    setIsLoading(true);
    setMessage("임시 서버 API에서 최신 데이터를 불러오는 중입니다.");

    try {
      applyServerData(await requestChargeData());
      setMessage("임시 서버 API 데이터가 갱신되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "데이터 갱신에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function resetRequests() {
    setIsLoading(true);
    setMessage("임시 데이터를 초기화하는 중입니다.");

    try {
      applyServerData(await requestChargeData({ action: "reset" }));
      setMessage("임시 서버 데이터가 초기 상태로 복구되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초기화에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredPendingRequests = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    if (!keyword) {
      return pendingRequests;
    }

    return pendingRequests.filter(
      (row) =>
        row.depositor.toLowerCase().includes(keyword) ||
        row.userId.toLowerCase().includes(keyword) ||
        row.accountNumber.toLowerCase().includes(keyword),
    );
  }, [pendingRequests, searchKeyword]);
  const pendingPageCount = Math.max(
    1,
    Math.ceil(filteredPendingRequests.length / rowsPerPage),
  );
  const visiblePendingRequests = filteredPendingRequests.slice(
    (pendingPage - 1) * rowsPerPage,
    pendingPage * rowsPerPage,
  );
  const approvedPageCount = Math.max(
    1,
    Math.ceil(approvedRequests.length / rowsPerPage),
  );
  const visibleApprovedRequests = approvedRequests.slice(
    (approvedPage - 1) * rowsPerPage,
    approvedPage * rowsPerPage,
  );
  const rejectedPageCount = Math.max(
    1,
    Math.ceil(rejectedRequests.length / rowsPerPage),
  );
  const visibleRejectedRequests = rejectedRequests.slice(
    (rejectedPage - 1) * rowsPerPage,
    rejectedPage * rowsPerPage,
  );

  async function moveRequest(targetId: string, nextStatus: "승인" | "승인거절") {
    setProcessingId(targetId);
    setMessage(`${targetId} 요청을 ${nextStatus} 처리 중입니다.`);

    try {
      applyServerData(await requestChargeData({ id: targetId, status: nextStatus }));
      setMessage(`${targetId} 요청이 ${nextStatus} 처리되었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,_rgba(18,24,33,0.96)_0%,_rgba(12,16,23,0.96)_100%)] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
            <p className="text-xs uppercase tracking-[0.24em] text-white/36">
              Menu Path
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
              충전신청
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/58">
              임시 서버 API에서 업체별 충전신청을 받아오고 승인/거절 처리까지
              테스트합니다.
            </p>
          </section>

          <section className="rounded-[28px] border border-white/8 bg-white/[0.03] p-5">
            <p className="text-sm font-medium text-white/88">상태 흐름</p>
            <div className="mt-4 space-y-3 text-sm text-white/58">
              <div className="rounded-2xl border border-white/8 bg-black/16 px-4 py-3">
                대기: `pending`
              </div>
              <div className="rounded-2xl border border-emerald-400/14 bg-emerald-500/8 px-4 py-3 text-emerald-100/85">
                승인: `approved`
              </div>
              <div className="rounded-2xl border border-rose-400/14 bg-rose-500/8 px-4 py-3 text-rose-100/85">
                거절: `rejected`
              </div>
            </div>
          </section>
        </aside>

        <div className="space-y-5">
          <SectionCard title="충전신청" count={filteredPendingRequests.length}>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-white/52">
                {message}
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  value={searchKeyword}
                  onChange={(event) => {
                    setSearchKeyword(event.target.value);
                    setPendingPage(1);
                  }}
                  placeholder="입금자 / 유저ID / 계좌번호 검색"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none placeholder:text-white/28 lg:w-72"
                />
                <button
                  type="button"
                  className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                >
                  검색
                </button>
                <button
                  type="button"
                  onClick={refreshRequests}
                  disabled={isLoading}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  새로고침
                </button>
                <button
                  type="button"
                  onClick={resetRequests}
                  disabled={isLoading}
                  className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  임시데이터 초기화
                </button>
              </div>
            </div>

            <Table>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/30 text-white/58">
                  <tr>
                    {[
                      "ID",
                      "본사",
                      "유저ID",
                      "상위총판",
                      "총판",
                      "도메인",
                      "은행명",
                      "계좌번호",
                      "입금자",
                      "신청금액",
                      "신청시간",
                      "상태",
                    ].map((head) => (
                      <th
                        key={head}
                        className="border-b border-white/8 px-4 py-3 font-medium"
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPendingRequests.length ? (
                    visiblePendingRequests.map((row) => (
                      <tr key={row.id} className="border-t border-white/8 text-white/82">
                        <td className="px-4 py-4">{row.id}</td>
                        <td className="px-4 py-4">{row.branch}</td>
                        <td className="px-4 py-4">{row.userId}</td>
                        <td className="px-4 py-4">{row.topAgent}</td>
                        <td className="px-4 py-4">{row.subAgent}</td>
                        <td className="px-4 py-4">{row.domain}</td>
                        <td className="px-4 py-4">{row.bankName}</td>
                        <td className="px-4 py-4">{row.accountNumber}</td>
                        <td className="px-4 py-4">{row.depositor}</td>
                        <td className="px-4 py-4">{row.amount}</td>
                        <td className="px-4 py-4">{row.requestedAt}</td>
                        <td className="px-4 py-4">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => moveRequest(row.id, "승인")}
                              disabled={processingId === row.id}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              승인
                            </button>
                            <button
                              type="button"
                              onClick={() => moveRequest(row.id, "승인거절")}
                              disabled={processingId === row.id}
                              className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              거절
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-4 py-10 text-center text-sm text-white/40"
                      >
                        조건에 맞는 충전신청이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Table>
            {filteredPendingRequests.length > rowsPerPage ? (
              <PaginationControls
                page={pendingPage}
                pageCount={pendingPageCount}
                onPageChange={setPendingPage}
              />
            ) : null}
          </SectionCard>

          <div className="space-y-5">
            <SectionCard title="승인내역" count={approvedRequests.length}>
              <Table>
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-black/30 text-white/58">
                    <tr>
                      {[
                        "ID",
                        "유저ID",
                        "은행명",
                        "계좌번호",
                        "입금자",
                        "신청금액",
                        "신청시간",
                        "완료시간",
                        "상태",
                      ].map((head) => (
                        <th
                          key={head}
                          className="border-b border-white/8 px-4 py-3 font-medium"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleApprovedRequests.map((row) => (
                      <tr key={row.id} className="border-t border-white/8 text-white/82">
                        <td className="px-4 py-4">{row.id}</td>
                        <td className="px-4 py-4">{row.userId}</td>
                        <td className="px-4 py-4">{row.bankName}</td>
                        <td className="px-4 py-4">{row.accountNumber}</td>
                        <td className="px-4 py-4">{row.depositor}</td>
                        <td className="px-4 py-4">{row.amount}</td>
                        <td className="px-4 py-4">{row.requestedAt}</td>
                        <td className="px-4 py-4">{row.completedAt}</td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-emerald-500/12 px-3 py-1 text-xs font-medium text-emerald-200">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Table>
              {approvedRequests.length > rowsPerPage ? (
                <PaginationControls
                  page={approvedPage}
                  pageCount={approvedPageCount}
                  onPageChange={setApprovedPage}
                />
              ) : null}
            </SectionCard>

            <SectionCard title="승인거절내역" count={rejectedRequests.length}>
              <Table>
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-black/30 text-white/58">
                    <tr>
                      {[
                        "ID",
                        "유저ID",
                        "은행명",
                        "계좌번호",
                        "입금자",
                        "신청금액",
                        "신청시간",
                        "완료시간",
                        "상태",
                      ].map((head) => (
                        <th
                          key={head}
                          className="border-b border-white/8 px-4 py-3 font-medium"
                        >
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRejectedRequests.map((row) => (
                      <tr key={row.id} className="border-t border-white/8 text-white/82">
                        <td className="px-4 py-4">{row.id}</td>
                        <td className="px-4 py-4">{row.userId}</td>
                        <td className="px-4 py-4">{row.bankName}</td>
                        <td className="px-4 py-4">{row.accountNumber}</td>
                        <td className="px-4 py-4">{row.depositor}</td>
                        <td className="px-4 py-4">{row.amount}</td>
                        <td className="px-4 py-4">{row.requestedAt}</td>
                        <td className="px-4 py-4">{row.completedAt}</td>
                        <td className="px-4 py-4">
                          <span className="rounded-full bg-rose-500/12 px-3 py-1 text-xs font-medium text-rose-200">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Table>
              {rejectedRequests.length > rowsPerPage ? (
                <PaginationControls
                  page={rejectedPage}
                  pageCount={rejectedPageCount}
                  onPageChange={setRejectedPage}
                />
              ) : null}
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
