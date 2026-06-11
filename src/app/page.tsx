import { redirect } from "next/navigation";
import Image from "next/image";

import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#07070c] px-5 py-8 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/8 bg-[#0d0d15] shadow-[0_30px_100px_rgba(0,0,0,0.38)] lg:grid-cols-[1fr_0.86fr]">
        <section className="hidden border-r border-white/8 bg-[radial-gradient(circle_at_26%_20%,_rgba(255,45,104,0.28),_transparent_28%),linear-gradient(155deg,_#100b15_0%,_#151827_48%,_#25111a_100%)] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-white/12 bg-white shadow-[0_18px_50px_rgba(255,45,104,0.16)]">
                <Image
                  src="/winpay-logo.png"
                  alt="WinPay"
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-rose-200/70">
                  WinPay
                </p>
                <h1 className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                  Admin
                </h1>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
            <span className="border-t border-white/12 pt-4">Charge</span>
            <span className="border-t border-white/12 pt-4">Exchange</span>
            <span className="border-t border-white/12 pt-4">Settlement</span>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-7 flex items-center gap-3 lg:hidden">
              <div className="grid h-13 w-13 place-items-center overflow-hidden rounded-2xl bg-white">
                <Image
                  src="/winpay-logo.png"
                  alt="WinPay"
                  width={52}
                  height={52}
                  className="h-full w-full object-cover"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200/70">
                  WinPay
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">
                  Admin
                </h1>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur sm:p-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-rose-200/70">
                  WinPay Access
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
