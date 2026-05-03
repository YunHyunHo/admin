"use client";

import { useState } from "react";

type TopDistributor = {
  id: string;
  manager: string;
  loginId: string;
  branch: string;
  name: string;
  distributorsCount: number;
  agenciesCount: number;
  childTopDistributorsCount: number;
  managedCompaniesCount: number;
  balance: number;
  createdAt: string;
  memo?: string;
  phone?: string;
};

const initialTopDistributors: TopDistributor[] = [
  {
    id: "TD-CHL-001",
    manager: "칠성파",
    loginId: "gungjj78",
    branch: "본사",
    name: "칠성파",
    distributorsCount: 0,
    agenciesCount: 0,
    childTopDistributorsCount: 0,
    managedCompaniesCount: 1,
    balance: 5_477_879,
    createdAt: "03-04 17:19:06",
  },
  {
    id: "TD-COIN-001",
    manager: "코인뱅크",
    loginId: "coinbank",
    branch: "본사",
    name: "코인뱅크",
    distributorsCount: 0,
    agenciesCount: 0,
    childTopDistributorsCount: 1,
    managedCompaniesCount: 9,
    balance: 8_759_463,
    createdAt: "01-05 21:44:32",
  },
  {
    id: "TD-BIBI-001",
    manager: "비비",
    loginId: "kings",
    branch: "본사",
    name: "비비",
    distributorsCount: 0,
    agenciesCount: 0,
    childTopDistributorsCount: 3,
    managedCompaniesCount: 11,
    balance: 1_580_937,
    createdAt: "12-24 16:02:14",
  },
  {
    id: "TD-DANG-001",
    manager: "댕댕이",
    loginId: "asd123",
    branch: "본사",
    name: "댕댕이",
    distributorsCount: 0,
    agenciesCount: 0,
    childTopDistributorsCount: 1,
    managedCompaniesCount: 3,
    balance: 21_386_778,
    createdAt: "05-29 13:11:31",
  },
  {
    id: "TD-DEV-B",
    manager: "추가",
    loginId: "dev_top_b",
    branch: "본사 개발자테스트",
    name: "개발테스트 상위총판B",
    distributorsCount: 0,
    agenciesCount: 0,
    childTopDistributorsCount: 0,
    managedCompaniesCount: 1,
    balance: 0,
    createdAt: "05-28 19:51:36",
  },
  {
    id: "TD-DEV-A",
    manager: "테스트 상위총판A",
    loginId: "bonsa_test_a_withdraw",
    branch: "본사 개발자테스트",
    name: "개발테스트 상위총판A",
    distributorsCount: 0,
    agenciesCount: 0,
    childTopDistributorsCount: 0,
    managedCompaniesCount: 0,
    balance: 0,
    createdAt: "05-28 19:50:34",
  },
];

function formatKoreanWon(value: number) {
  return `${value.toLocaleString("ko-KR")} 원`;
}

function getNowStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${month}-${date} ${hours}:${minutes}:${seconds}`;
}

export function TopDistributorsBoard() {
  const [topDistributors, setTopDistributors] = useState(
    initialTopDistributors,
  );
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [branch, setBranch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [memo, setMemo] = useState("");

  function handleCreate() {
    if (!branch || !name) {
      return;
    }

    const newTopDistributor: TopDistributor = {
      id: `TD-${Date.now().toString().slice(-6)}`,
      manager: name,
      loginId: name.toLowerCase().replace(/\s+/g, "_"),
      branch,
      name,
      distributorsCount: 0,
      agenciesCount: 0,
      childTopDistributorsCount: 0,
      managedCompaniesCount: 0,
      balance: 0,
      createdAt: getNowStamp(),
      phone,
      memo,
    };

    setTopDistributors((current) => [newTopDistributor, ...current]);
    setBranch("");
    setName("");
    setPhone("");
    setMemo("");
    setIsCreateModalOpen(false);
  }

  function handleDelete(id: string) {
    setTopDistributors((current) => current.filter((row) => row.id !== id));
  }

  return (
    <section className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,_rgba(14,18,26,0.94)_0%,_rgba(10,12,18,0.98)_100%)] shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
      <div className="flex flex-col gap-4 border-b border-white/8 px-5 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/55">
            Organization Management
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">
            상위총판 리스트
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/52">
            상위총판 계정, 하위총판 수, 관련 업체, 보유액을 확인하고 관리하는 화면입니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="rounded-2xl bg-fuchsia-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-fuchsia-400"
        >
          상위총판 생성
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <div className="min-h-[620px] overflow-x-auto rounded-[26px] border border-white/8 bg-black/18">
          <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
            <thead className="bg-black/52 text-white/72">
              <tr>
                {[
                  "ID",
                  "관리자/아이디",
                  "비밀번호",
                  "본사",
                  "상위총판",
                  "총판",
                  "대리점",
                  "하위총판",
                  "관리업체",
                  "보유액",
                  "생성일",
                  "삭제",
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
              {topDistributors.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-white/8 text-white/76 last:border-b-0"
                >
                  <td className="max-w-[110px] px-4 py-4 font-mono text-xs text-white/52">
                    {row.id}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="font-semibold text-white">{row.manager}</span>
                    <span className="text-white/34"> / </span>
                    <span>{row.loginId}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      className="rounded-xl bg-teal-400/80 px-3 py-2 text-xs font-semibold text-slate-950"
                    >
                      비밀번호 확인
                    </button>
                  </td>
                  <td className="px-4 py-4 text-center">{row.branch}</td>
                  <td className="px-4 py-4 text-center">
                    <span className="rounded-xl bg-fuchsia-500/78 px-3 py-2 text-xs font-semibold text-white">
                      {row.name}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.distributorsCount ? `${row.distributorsCount}개` : "-"}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.agenciesCount ? `${row.agenciesCount}개` : "-"}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.childTopDistributorsCount}개
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.managedCompaniesCount}개
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-white">
                    {formatKoreanWon(row.balance)}
                  </td>
                  <td className="px-4 py-4 text-center text-white/62">
                    {row.createdAt}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      className="rounded-xl border border-red-300/20 bg-red-500/12 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isCreateModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
          <div className="w-full max-w-[440px] rounded-[28px] border border-white/10 bg-white p-6 text-slate-950 shadow-[0_28px_120px_rgba(0,0,0,0.58)]">
            <h3 className="text-xl font-semibold tracking-[-0.03em]">
              상위총판 생성
            </h3>

            <div className="mt-7 space-y-4">
              <label className="block">
                <span className="sr-only">본사 선택</span>
                <select
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 outline-none transition focus:border-slate-500"
                >
                  <option value="">본사 선택</option>
                  <option value="본사">본사</option>
                  <option value="본사 개발자테스트">본사 개발자테스트</option>
                </select>
              </label>

              <label className="block">
                <span className="sr-only">상위총판명</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="상위총판명"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">핸드폰번호</span>
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="핸드폰번호 [필수 X]"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>

              <label className="block">
                <span className="sr-only">메모</span>
                <input
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="메모 [필수 X]"
                  className="h-12 w-full rounded-xl border border-slate-200 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </label>
            </div>

            <div className="mt-10 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!branch || !name}
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
    </section>
  );
}
