"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PendingRequest,
  ProcessedRequest,
} from "@/lib/charge-utils";
import type { DomainExchangeOption } from "@/lib/domain-exchanges-types";

type ChargeRequestsBoardProps = {
  initialPendingRequests: PendingRequest[];
  initialApprovedRequests: ProcessedRequest[];
  initialRejectedRequests: ProcessedRequest[];
  canProcessCharges?: boolean;
  isDatabaseBacked?: boolean;
  domainOptions?: DomainExchangeOption[];
};

type ChargeRequestsResponse = {
  pending: PendingRequest[];
  approved: ProcessedRequest[];
  rejected: ProcessedRequest[];
};

type ChargeRequestPayload = {
  action?: "create" | "reset";
  id?: string;
  status?: "승인" | "승인거절";
  userId?: string;
  amount?: number;
  depositor?: string;
  bankName?: string;
  accountNumber?: string;
  domainId?: string;
  domainName?: string;
};

const rowsPerPage = 10;
const chargeNoticeSoundPath = "/sounds/notice.mp3";

function getCurrentTimeLabel() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
}

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
  canProcessCharges = true,
  isDatabaseBacked = false,
  domainOptions = [],
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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createDomainId, setCreateDomainId] = useState(domainOptions[0]?.id ?? "");
  const [createDepositorName, setCreateDepositorName] = useState("");
  const [createAmount, setCreateAmount] = useState("");
  const [createBankName, setCreateBankName] = useState("");
  const [createAccountNumber, setCreateAccountNumber] = useState("");
  const [message, setMessage] = useState(
    isDatabaseBacked
      ? "Neon DB와 연결된 충전신청 데이터를 표시합니다."
      : "로컬 테스트 데이터로 충전신청을 표시합니다.",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState("");
  const [isSoundReady, setIsSoundReady] = useState(true);
  const [soundMessage, setSoundMessage] = useState("");
  const noticeAudioRef = useRef<HTMLAudioElement | null>(null);
  const knownPendingIdsRef = useRef(
    new Set(initialPendingRequests.map((request) => request.id)),
  );

  const playNoticeSound = useCallback(async () => {
    if (!noticeAudioRef.current) {
      noticeAudioRef.current = new Audio(chargeNoticeSoundPath);
      noticeAudioRef.current.preload = "auto";
    }

    noticeAudioRef.current.currentTime = 0;
    await noticeAudioRef.current.play();
    setIsSoundReady(true);
    setSoundMessage("");
  }, []);

  const applyServerData = useCallback(
    (
      data: ChargeRequestsResponse,
      options: { notifyNewPending?: boolean; resetPages?: boolean } = {},
    ) => {
      const shouldResetPages = options.resetPages ?? true;
      const newPendingCount = data.pending.filter(
        (request) => !knownPendingIdsRef.current.has(request.id),
      ).length;

      knownPendingIdsRef.current = new Set(
        data.pending.map((request) => request.id),
      );

      setPendingRequests(data.pending);
      setApprovedRequests(data.approved);
      setRejectedRequests(data.rejected);

      if (shouldResetPages) {
        setPendingPage(1);
        setApprovedPage(1);
        setRejectedPage(1);
      }

      if (options.notifyNewPending && newPendingCount > 0) {
        setMessage(`${newPendingCount}건의 신규 충전신청이 도착했습니다.`);
        void playNoticeSound().catch(() => {
          setIsSoundReady(false);
          setSoundMessage("브라우저가 알림음을 차단했습니다. 알림음 켜짐 버튼을 눌러주세요.");
        });
      }
    },
    [playNoticeSound],
  );

  const requestChargeData = useCallback(async (body?: ChargeRequestPayload) => {
    const response = await fetch("/api/charge-requests", {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(error.message ?? "API 요청에 실패했습니다.");
    }

    return (await response.json()) as ChargeRequestsResponse;
  }, []);

  useEffect(() => {
    if (!isDatabaseBacked) {
      return;
    }

    if (!noticeAudioRef.current) {
      noticeAudioRef.current = new Audio(chargeNoticeSoundPath);
      noticeAudioRef.current.preload = "auto";
    }

    let isCancelled = false;

    async function syncRequests() {
      try {
        const data = await requestChargeData();

        if (isCancelled) {
          return;
        }

        applyServerData(data, { notifyNewPending: true, resetPages: false });
        setLastSyncedAt(getCurrentTimeLabel());
      } catch {
        if (!isCancelled) {
          setLastSyncedAt("자동 갱신 실패");
        }
      }
    }

    void syncRequests();

    const intervalId = window.setInterval(() => {
      void syncRequests();
    }, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyServerData, isDatabaseBacked, requestChargeData]);

  async function activateNoticeSound() {
    try {
      await playNoticeSound();
      setSoundMessage("충전신청 알림음이 활성화되었습니다.");
    } catch {
      setIsSoundReady(false);
      setSoundMessage("브라우저에서 소리 재생이 차단되었습니다. 다시 눌러주세요.");
    }
  }

  async function refreshRequests() {
    setIsLoading(true);
    setMessage("최신 충전신청 데이터를 불러오는 중입니다.");

    try {
      applyServerData(await requestChargeData());
      setMessage("충전신청 데이터가 갱신되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "데이터 갱신에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function resetRequests() {
    setIsLoading(true);
    setMessage("로컬 테스트 데이터를 초기화하는 중입니다.");

    try {
      applyServerData(await requestChargeData({ action: "reset" }));
      setMessage("로컬 테스트 데이터가 초기 상태로 복구되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "초기화에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function createChargeRequest() {
    const amount = Number(createAmount.replaceAll(",", ""));
    const depositorName = createDepositorName.trim();
    const domainId = createDomainId.trim();
    const domainName =
      domainOptions.find((domain) => domain.id === domainId)?.name ?? "";

    if (!depositorName || !Number.isFinite(amount) || amount <= 0) {
      setMessage("입금자명과 신청금액을 확인해주세요.");
      return;
    }

    setIsLoading(true);
    setMessage("테스트 충전신청을 생성하는 중입니다.");

    try {
      applyServerData(
        await requestChargeData({
          action: "create",
          userId: depositorName,
          amount,
          depositor: depositorName,
          bankName: createBankName,
          accountNumber: createAccountNumber,
          domainId,
          domainName,
        }),
      );
      setCreateDepositorName("");
      setCreateAmount("");
      setCreateBankName("");
      setCreateAccountNumber("");
      setIsCreateModalOpen(false);
      setMessage("테스트 충전신청이 생성되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "충전신청 생성에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  const filteredPendingRequests = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const source = [...pendingRequests].sort((left, right) =>
      left.requestedAt.localeCompare(right.requestedAt),
    );

    if (!keyword) {
      return source;
    }

    return source.filter(
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
    const actionLabel = nextStatus === "승인" ? "승인" : "거절";

    if (!window.confirm(`${targetId} 요청을 ${actionLabel}할까요?`)) {
      return;
    }

    setProcessingId(targetId);
    setMessage(`${targetId} 요청을 ${actionLabel} 처리 중입니다.`);

    try {
      applyServerData(await requestChargeData({ id: targetId, status: nextStatus }));
      setMessage(`${targetId} 요청이 ${actionLabel} 처리되었습니다.`);
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
              업체별 충전신청을 확인하고 승인 또는 거절 상태로 처리합니다.
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
                {isDatabaseBacked ? (
                  <span className="ml-2 inline-flex rounded-full border border-cyan-300/15 bg-cyan-400/8 px-2.5 py-1 text-xs font-medium text-cyan-100/72">
                    자동 갱신 중{lastSyncedAt ? ` · ${lastSyncedAt}` : ""}
                  </span>
                ) : null}
                {soundMessage ? (
                  <span className="ml-2 inline-flex rounded-full border border-amber-300/15 bg-amber-400/8 px-2.5 py-1 text-xs font-medium text-amber-100/78">
                    {soundMessage}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <input
                  value={searchKeyword}
                  onChange={(event) => {
                    setSearchKeyword(event.target.value);
                    setPendingPage(1);
                  }}
                  placeholder="입금자명 / 계좌번호 검색"
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 text-sm text-white outline-none placeholder:text-white/28 lg:w-72"
                />
                <button
                  type="button"
                  className="rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
                >
                  검색
                </button>
                {isDatabaseBacked && canProcessCharges ? (
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    disabled={isLoading}
                    className="rounded-2xl bg-fuchsia-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    충전신청 생성
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={refreshRequests}
                  disabled={isLoading}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  새로고침
                </button>
                {isDatabaseBacked ? (
                  <button
                    type="button"
                    onClick={activateNoticeSound}
                    className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${
                      isSoundReady
                        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                        : "border-amber-300/20 bg-amber-400/10 text-amber-100"
                    }`}
                  >
                    {isSoundReady ? "알림음 켜짐" : "알림음 다시 켜기"}
                  </button>
                ) : null}
                {!isDatabaseBacked ? (
                  <button
                    type="button"
                    onClick={resetRequests}
                    disabled={isLoading}
                    className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    테스트 데이터 초기화
                  </button>
                ) : null}
              </div>
            </div>

            <Table>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-black/30 text-white/58">
                  <tr>
                    {[
                      "ID",
                      "본사",
                      "입금자명",
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
                        <td className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-4 font-mono text-xs">
                          {row.id}
                        </td>
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
                          {canProcessCharges ? (
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
                          ) : (
                            <span className="text-white/34">-</span>
                          )}
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
                        "입금자명",
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
                        <td className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-4 font-mono text-xs">
                          {row.id}
                        </td>
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
                        "입금자명",
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
                        <td className="max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap px-4 py-4 font-mono text-xs">
                          {row.id}
                        </td>
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

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-xl font-semibold tracking-[-0.03em]">
              테스트 충전신청 생성
            </h3>

            <div className="mt-7 space-y-4">
              <label className="block">
                <span className="sr-only">도메인 선택</span>
                <select
                  value={createDomainId}
                  onChange={(event) => setCreateDomainId(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-slate-500"
                >
                  <option value="">수기 입력(도메인 없음)</option>
                  {domainOptions.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="sr-only">입금자명</span>
                <input
                  value={createDepositorName}
                  onChange={(event) => setCreateDepositorName(event.target.value)}
                  placeholder="입금자명"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">신청금액</span>
                <input
                  value={createAmount}
                  onChange={(event) => setCreateAmount(event.target.value)}
                  placeholder="신청금액"
                  inputMode="numeric"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">은행명</span>
                <input
                  value={createBankName}
                  onChange={(event) => setCreateBankName(event.target.value)}
                  placeholder="은행명"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">계좌번호</span>
                <input
                  value={createAccountNumber}
                  onChange={(event) => setCreateAccountNumber(event.target.value)}
                  placeholder="계좌번호"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>
            </div>

            <div className="mt-10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void createChargeRequest()}
                disabled={isLoading || !createDepositorName || !createAmount}
                className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                생성
              </button>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
