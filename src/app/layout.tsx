import type { Metadata } from "next";
import "./globals.css";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getLocale } from "@/lib/requestLocale";

export const metadata: Metadata = {
  title: "Timesheet — Yokogawa Rep Portal",
  description: "Timesheet management and weekly report export",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
