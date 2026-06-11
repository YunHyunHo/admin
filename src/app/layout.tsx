import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WinPay Admin",
  description: "WinPay 관리자 로그인",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeScript = `
    try {
      var theme = window.localStorage.getItem("vendor-admin-theme") || "dark";
      document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
    } catch (_) {
      document.documentElement.dataset.theme = "dark";
    }
  `;

  return (
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
