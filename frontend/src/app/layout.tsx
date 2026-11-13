import type { Metadata } from "next";
import { BetaNotice } from "@/components/beta-notice";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifePath AI · 나의 재무계획",
  description:
    "현재의 자산과 월 현금흐름으로 확인하는 나의 주거자금 계획. 가정을 확인하고 미래를 계획하세요.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body><BetaNotice />{children}</body>
    </html>
  );
}
