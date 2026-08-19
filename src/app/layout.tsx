import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Timesheet — Yokogawa Rep Portal",
  description: "Quản lý timesheet và xuất 週報 cho khách hàng",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
