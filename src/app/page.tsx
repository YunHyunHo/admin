import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSessionUser, getTestAccounts } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  const accounts = getTestAccounts();

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(244,180,0,0.2),_transparent_30%),linear-gradient(135deg,_#f8f6ef_0%,_#e8edf3_55%,_#d5dfeb_100%)] px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/50 bg-white/65 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur">
        <section className="hidden w-full max-w-2xl flex-col justify-between bg-[linear-gradient(160deg,_rgba(15,23,42,0.96)_0%,_rgba(21,94,117,0.9)_52%,_rgba(217,119,6,0.9)_100%)] p-10 text-white lg:flex">
          <div className="space-y-6">
            <span className="inline-flex w-fit rounded-full border border-white/20 bg-white/10 px-4 py-1 text-sm tracking-[0.2em] text-white/80 uppercase">
              Vendor Admin
            </span>
            <div className="space-y-4">
              <h1 className="max-w-lg text-4xl font-semibold leading-tight">
                업체별 데이터와 외부 API를 안전하게 관리하는 관리자 페이지
              </h1>
              <p className="max-w-xl text-base leading-7 text-white/72">
                각 업체 계정은 서로 다른 데이터와 연동 정보를 사용합니다.
                로그인 이후에는 계정에 연결된 업체 기준으로 화면, 데이터,
                API 호출이 모두 분리됩니다.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-3xl border border-white/15 bg-black/15 p-5">
              <p className="text-sm text-white/64">운영 포인트</p>
              <p className="mt-2 text-lg font-medium">
                회원가입 없이 사전 발급 계정으로만 접속
              </p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-black/15 p-5">
              <p className="text-sm text-white/64">데이터 정책</p>
              <p className="mt-2 text-lg font-medium">
                로그인한 업체의 데이터만 조회 가능
              </p>
            </div>
          </div>
        </section>

        <section className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-3 lg:hidden">
              <span className="inline-flex rounded-full bg-slate-900 px-4 py-1 text-sm tracking-[0.2em] text-white uppercase">
                Vendor Admin
              </span>
              <h1 className="text-3xl font-semibold leading-tight text-slate-950">
                관리자 로그인
              </h1>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8">
              <div className="space-y-2">
                <p className="text-sm font-semibold tracking-[0.18em] text-cyan-800 uppercase">
                  Secure Access
                </p>
                <h2 className="text-3xl font-semibold text-slate-950">
                  로그인
                </h2>
                <p className="text-sm leading-6 text-slate-500">
                  전달받은 업체 계정으로 로그인해주세요. 회원가입은 제공되지
                  않습니다.
                </p>
              </div>

              <LoginForm />

              <div className="mt-6 rounded-2xl bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
                <p className="font-semibold">테스트 계정</p>
                <ul className="mt-2 space-y-1">
                  {accounts.map((account) => (
                    <li key={account.username}>
                      {account.username} / {account.passwordHint} /{" "}
                      {account.companyName}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
