import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#080a0f] px-5 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/8 bg-[#0d1017] shadow-[0_30px_100px_rgba(0,0,0,0.34)] lg:grid-cols-[1fr_0.86fr]">
        <section className="hidden border-r border-white/8 bg-[linear-gradient(155deg,_#101827_0%,_#142637_44%,_#1f2b27_100%)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/70">
              LAYLOW
            </p>
            <h1 className="mt-5 max-w-sm text-4xl font-semibold leading-tight tracking-[-0.04em]">
              관리자 로그인
            </h1>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white/44">
            <span className="border-t border-white/12 pt-4">Charge</span>
            <span className="border-t border-white/12 pt-4">Exchange</span>
            <span className="border-t border-white/12 pt-4">Settlement</span>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-7 lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-cyan-200/70">
                LAYLOW
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                관리자 로그인
              </h1>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.24)] backdrop-blur sm:p-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200/70">
                  Admin Access
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  로그인
                </h2>
              </div>

              <LoginForm />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
