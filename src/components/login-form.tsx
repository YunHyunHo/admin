"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { loginAction, type LoginFormState } from "@/app/actions/auth";

const initialState: LoginFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-13 w-full items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? "로그인 확인 중..." : "로그인"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">아이디</span>
        <input
          type="text"
          name="username"
          placeholder="아이디를 입력해주세요"
          className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition focus:border-cyan-700 focus:bg-white focus:ring-4 focus:ring-cyan-100"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-700">비밀번호</span>
        <input
          type="password"
          name="password"
          placeholder="비밀번호를 입력해주세요"
          className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition focus:border-cyan-700 focus:bg-white focus:ring-4 focus:ring-cyan-100"
        />
      </label>

      {state.error ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
