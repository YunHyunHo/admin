"use client";

import { useMemo, useState } from "react";

type TransactionRow = {
  id: string;
  tradedAt: string;
  buyerWallet: string;
  coin: string;
  quantity: number;
  depositor: string;
  amount: number;
  status: "완료" | "대기";
  bankInfo: string;
};

const initialTransactions: TransactionRow[] = [
  {
    id: "TX-001",
    tradedAt: "02-08 23:30:12",
    buyerWallet: "0x3b3aa5b5c92fb72a7b9fff05541c44c8411b6668",
    coin: "WINPAY",
    quantity: 477,
    depositor: "함께만드는",
    amount: 4_778_560,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-002",
    tradedAt: "02-08 23:27:14",
    buyerWallet: "0xdbe56d313f0d61cd0e24c9c0a14378df81ad30be",
    coin: "WINPAY",
    quantity: 1,
    depositor: "박기순",
    amount: 10_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-003",
    tradedAt: "02-08 23:21:36",
    buyerWallet: "0xa35f3ee37636ed81291a2596bcb7a0da446ef281",
    coin: "WINPAY",
    quantity: 5,
    depositor: "곽정현",
    amount: 50_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-004",
    tradedAt: "02-08 23:20:00",
    buyerWallet: "0x11b5e921740cc638bec48c4ac0bd3e1bc6cf726d",
    coin: "WINPAY",
    quantity: 1,
    depositor: "김광연",
    amount: 10_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-005",
    tradedAt: "02-08 23:14:39",
    buyerWallet: "0xe5c24c6cac02d7ee051e6db5e5d0f8f9686d5993",
    coin: "WINPAY",
    quantity: 150,
    depositor: "권오준",
    amount: 1_500_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-006",
    tradedAt: "02-08 23:03:54",
    buyerWallet: "0x35bcd3e88a0dd090d09c25e05d21bbac58c574b4",
    coin: "WINPAY",
    quantity: 6,
    depositor: "최상민",
    amount: 60_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-007",
    tradedAt: "02-08 22:59:39",
    buyerWallet: "0x6d21caa7031bd108e766f9e1405b1f5762438dc9",
    coin: "WINPAY",
    quantity: 2,
    depositor: "박재혁",
    amount: 20_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-008",
    tradedAt: "02-08 22:57:19",
    buyerWallet: "0x26dc02b8d0df8b7c76aee02565fe2906418950ff",
    coin: "WINPAY",
    quantity: 2,
    depositor: "정인숙",
    amount: 20_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-009",
    tradedAt: "02-08 22:56:41",
    buyerWallet: "0xac863231878dad02b456f05194c9f93b3b91e938",
    coin: "WINPAY",
    quantity: 100,
    depositor: "전봉근",
    amount: 1_000_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-010",
    tradedAt: "02-08 22:55:09",
    buyerWallet: "0xc54009816f6989b8cad23e492a06d382ecfbe5a2",
    coin: "WINPAY",
    quantity: 29,
    depositor: "한성희",
    amount: 290_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-011",
    tradedAt: "02-08 22:55:11",
    buyerWallet: "0x05d4c229287c6808ec48d460ae0b9a519e9c75a7",
    coin: "WINPAY",
    quantity: 23,
    depositor: "최현",
    amount: 230_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-012",
    tradedAt: "02-08 22:53:14",
    buyerWallet: "0xc427a0adf10c78e6bea875a936a3ea7c6537b5f3",
    coin: "WINPAY",
    quantity: 2,
    depositor: "배은상",
    amount: 20_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-013",
    tradedAt: "02-08 22:53:13",
    buyerWallet: "0xf9ff20eaee73436129939509ac3073cf0da4d85a",
    coin: "WINPAY",
    quantity: 10,
    depositor: "공대혁",
    amount: 100_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-014",
    tradedAt: "02-08 22:50:57",
    buyerWallet: "0xf972b47203693a3e8f687b0db4866c5265d2a742",
    coin: "WINPAY",
    quantity: 1,
    depositor: "정현민",
    amount: 10_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
  {
    id: "TX-015",
    tradedAt: "02-08 22:46:04",
    buyerWallet: "0xc1fcf6ff3d8bdba34be45677c09278db84f92840",
    coin: "WINPAY",
    quantity: 10,
    depositor: "조현철",
    amount: 100_000,
    status: "완료",
    bankInfo: "농협은행 / 352-1942-2732-13 / 권기준 (오픈뱅킹.타명의.ATM 입금불가)",
  },
];

const rowsPerPage = 15;

function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")} 원`;
}

function dateToNumber(value: string) {
  const [month, day] = value.split("-").map(Number);

  return month * 100 + day;
}

export function TransactionCreateBoard() {
  const [depositor, setDepositor] = useState("");
  const [amount, setAmount] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [startDate, setStartDate] = useState("05-02");
  const [endDate, setEndDate] = useState("05-03");
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    return initialTransactions.filter((row) => {
      const matchesDepositor = row.depositor.includes(depositor.trim());
      const matchesAmount = amount
        ? String(row.amount).includes(amount.replace(/[^\d]/g, ""))
        : true;
      const matchesHolder = row.bankInfo.includes(accountHolder.trim());
      const tradedDate = dateToNumber(row.tradedAt.slice(0, 5));
      const matchesDate =
        tradedDate >= dateToNumber(startDate) && tradedDate <= dateToNumber(endDate);

      return matchesDepositor && matchesAmount && matchesHolder && matchesDate;
    });
  }, [accountHolder, amount, depositor, endDate, startDate]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const pageRows = filteredRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  function resetSearch() {
    setDepositor("");
    setAmount("");
    setAccountHolder("");
    setStartDate("05-02");
    setEndDate("05-03");
    setPage(1);
  }

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-5 xl:flex-row xl:items-center">
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-white">
          거래생성
        </h2>

        <div className="grid flex-1 gap-3 md:grid-cols-3 xl:grid-cols-[180px_180px_180px_105px_105px_68px_118px_118px]">
          <input
            value={depositor}
            onChange={(event) => setDepositor(event.target.value)}
            placeholder="입금자"
            className="h-12 rounded-xl border border-white/14 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-white/38 focus:border-cyan-300/40"
          />
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="신청금액"
            className="h-12 rounded-xl border border-white/14 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-white/38 focus:border-cyan-300/40"
          />
          <input
            value={accountHolder}
            onChange={(event) => setAccountHolder(event.target.value)}
            placeholder="통장명의"
            className="h-12 rounded-xl border border-white/14 bg-white/[0.035] px-4 text-sm text-white outline-none placeholder:text-white/38 focus:border-cyan-300/40"
          />
          <label className="text-xs text-white/42">
            시작일
            <input
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 h-8 w-full border-b border-white/36 bg-transparent text-base font-semibold text-white outline-none"
            />
          </label>
          <label className="text-xs text-white/42">
            종료일
            <input
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 h-8 w-full border-b border-white/36 bg-transparent text-base font-semibold text-white outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setPage(1)}
            className="h-12 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            검색
          </button>
          <button
            type="button"
            onClick={resetSearch}
            className="h-12 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-white transition hover:bg-teal-400"
          >
            검색 초기화
          </button>
          <button
            type="button"
            className="h-12 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            엑셀생성
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1420px] border-collapse text-left text-sm">
            <thead className="bg-black/52 text-white/72">
              <tr>
                {[
                  "거래일자",
                  "구매자지갑주소",
                  "코인",
                  "수량",
                  "입금자명",
                  "입금금액",
                  "상태",
                  "은행",
                ].map((header) => (
                  <th
                    key={header}
                    className="border-b border-white/8 px-4 py-5 text-center font-semibold"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/8 text-white/78 last:border-b-0"
                >
                  <td className="px-4 py-4 text-center">{row.tradedAt}</td>
                  <td className="px-4 py-4 text-center font-mono text-xs">
                    {row.buyerWallet}
                  </td>
                  <td className="px-4 py-4 text-center font-semibold">
                    {row.coin}
                  </td>
                  <td className="px-4 py-4 text-center">{row.quantity}</td>
                  <td className="px-4 py-4 text-center font-semibold text-white">
                    {row.depositor}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-white">
                    {formatKoreanWon(row.amount)}
                  </td>
                  <td className="px-4 py-4 text-center">{row.status}</td>
                  <td className="px-4 py-4 text-center">{row.bankInfo}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-center gap-2 border-t border-white/8 px-4 py-5">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
            >
              |‹
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
            >
              ‹
            </button>

            {Array.from({ length: Math.min(pageCount, 15) }, (_, index) => {
              const pageNumber = index + 1;

              return (
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
              );
            })}

            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              disabled={page === pageCount}
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setPage(pageCount)}
              disabled={page === pageCount}
              className="h-10 min-w-10 rounded-xl bg-black px-3 font-semibold text-white disabled:opacity-35"
            >
              ›|
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
