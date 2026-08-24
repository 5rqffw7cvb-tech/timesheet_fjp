import Link from "next/link";
import NavLinks from "./NavLinks";
import LocaleSwitcher from "./LocaleSwitcher";
import UserMenu from "./UserMenu";
import type { Locale } from "@/lib/i18n";

export interface NavItem { href: string; label: string; }

export default function AppShell({
  user, nav, locale, children,
}: {
  user: { fullName: string; username: string; role: string; roleTitle?: string | null };
  nav: NavItem[];
  locale: Locale;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
              TS
            </span>
            <span className="text-sm font-semibold text-slate-800">Timesheet</span>
          </Link>

          <NavLinks items={nav} />

          <div className="flex shrink-0 items-center gap-3">
            <LocaleSwitcher />
            <UserMenu user={user} locale={locale} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5">{children}</main>
    </div>
  );
}
