"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

const storageKey = "vendor-admin-theme";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(storageKey, theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "라이트 모드로 변경" : "다크 모드로 변경"}
      title={theme === "dark" ? "라이트 모드" : "다크 모드"}
      onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      className="theme-toggle inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-white/76 transition hover:bg-white/[0.08]"
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-xs">
        {theme === "dark" ? "☀" : "☾"}
      </span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
