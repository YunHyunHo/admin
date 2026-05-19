"use client";

import { useMemo, useState } from "react";

import type { IntegrationChargeDomainOption } from "@/lib/charge-requests-repository";

type ApiChargeTestBoardProps = {
  domainOptions: IntegrationChargeDomainOption[];
};

type IntegrationResponse = {
  ok?: boolean;
  requestId?: string;
  status?: string;
  message?: string;
};

function makeExternalId() {
  return `TEST-${Date.now().toString(36).toUpperCase()}`;
}

export function ApiChargeTestBoard({ domainOptions }: ApiChargeTestBoardProps) {
  const [selectedDomainId, setSelectedDomainId] = useState(domainOptions[0]?.id ?? "");
  const [externalId, setExternalId] = useState(makeExternalId);
  const [depositorName, setDepositorName] = useState("테스트입금자");
  const [amount, setAmount] = useState("100000");
  const [bankName, setBankName] = useState("국민은행");
  const [accountNumber, setAccountNumber] = useState("000-0000-0000");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("연동 테스트 요청을 보낼 준비가 되었습니다.");
  const [lastResponse, setLastResponse] = useState<IntegrationResponse | null>(null);

  const selectedDomain = useMemo(
    () => domainOptions.find((domain) => domain.id === selectedDomainId),
    [domainOptions, selectedDomainId],
  );

  async function submitChargeRequest() {
    const numericAmount = Number(amount.replaceAll(",", ""));

    if (!selectedDomain?.name) {
      setMessage("먼저 연동 도메인을 선택해주세요.");
      return;
    }

    if (!depositorName.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      setMessage("입금자명과 신청금액을 확인해주세요.");
      return;
    }

    setIsSending(true);
    setMessage("외부 연동 API로 충전신청을 전송하는 중입니다.");
    setLastResponse(null);

    try {
      const response = await fetch("/api/integration/charge-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalId,
          domainName: selectedDomain?.name,
          depositorName,
          amount: numericAmount,
          bankName,
          accountNumber,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as IntegrationResponse;

      setLastResponse(data);

      if (!response.ok) {
        throw new Error(data.message ?? "연동 API 요청에 실패했습니다.");
      }

      setMessage("충전신청이 전송되었습니다. 관리자 충전신청 메뉴에서 확인해주세요.");
      setExternalId(makeExternalId());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "연동 API 요청에 실패했습니다.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#080a0f] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="border-b border-white/10 pb-6">
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/60">
            API Integration Test
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            충전신청 연동 테스트
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/56">
            외부 사이트가 충전신청 API를 호출하는 상황을 테스트합니다. 전송된 신청은 관리자
            충전신청 메뉴에 대기 상태로 들어갑니다.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-white/78">
                  연동 도메인
                </span>
                <select
                  value={selectedDomainId}
                  onChange={(event) => setSelectedDomainId(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/12 bg-black/45 px-4 text-sm text-white outline-none focus:border-cyan-300/50"
                >
                  <option value="">연동 도메인 선택</option>
                  {domainOptions.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name} / {domain.distributorName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/78">
                  입금자명
                </span>
                <input
                  value={depositorName}
                  onChange={(event) => setDepositorName(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/12 bg-black/45 px-4 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/78">
                  신청금액
                </span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="numeric"
                  className="h-12 w-full rounded-xl border border-white/12 bg-black/45 px-4 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/78">
                  은행명
                </span>
                <input
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/12 bg-black/45 px-4 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/78">
                  계좌번호
                </span>
                <input
                  value={accountNumber}
                  onChange={(event) => setAccountNumber(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/12 bg-black/45 px-4 text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-semibold text-white/78">
                  외부 요청 ID
                </span>
                <input
                  value={externalId}
                  onChange={(event) => setExternalId(event.target.value)}
                  className="h-12 w-full rounded-xl border border-white/12 bg-black/45 px-4 font-mono text-sm text-white outline-none focus:border-cyan-300/50"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void submitChargeRequest()}
                disabled={isSending || !selectedDomainId}
                className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-45"
              >
                API로 충전신청 보내기
              </button>
              <a
                href="/dashboard/transactions/charges"
                className="rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08]"
              >
                관리자 충전신청 확인
              </a>
            </div>
          </div>

          <aside className="rounded-[28px] border border-white/10 bg-black/24 p-5">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">
              전송 상태
            </h2>
            <p className="mt-3 rounded-2xl border border-cyan-300/18 bg-cyan-300/10 px-4 py-3 text-sm leading-6 text-cyan-50">
              {message}
            </p>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/36">
                API Response
              </p>
              <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-white/70">
                {lastResponse ? JSON.stringify(lastResponse, null, 2) : "{}"}
              </pre>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
