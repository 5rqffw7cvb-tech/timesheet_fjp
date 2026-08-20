import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import NavLinks from "./NavLinks";
import LocaleSwitcher from "./LocaleSwitcher";
import { type Locale, getMessage } from "@/lib/i18n";

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
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight text-slate-700">{user.fullName}</div>
              <div className="text-xs leading-tight text-slate-400">
                {user.role === "ADMIN" ? getMessage(locale, "adminRole") : user.roleTitle || getMessage(locale, "memberRole")}
              </div>
            </div>
            <Link href="/change-password" className="btn-ghost btn-sm" title={getMessage(locale, "passwordMenu")}>
              {getMessage(locale, "passwordMenu")}
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn-secondary btn-sm">{getMessage(locale, "logout")}</button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5">{children}</main>
    </div>
  );
}
