import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppShell, { type NavItem } from "@/components/AppShell";
import { getLocale } from "@/lib/requestLocale";
import { getMessage } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePw) redirect("/change-password");
  const locale = await getLocale();

  const memberNav: NavItem[] = [
    { href: "/timesheet", label: getMessage(locale, "navTimesheet") },
    { href: "/summary", label: getMessage(locale, "navSummary") },
  ];

  const adminNav: NavItem[] = [
    { href: "/admin", label: getMessage(locale, "navDashboard") },
    { href: "/admin/approvals", label: getMessage(locale, "navApprovals") },
    { href: "/admin/budgets", label: getMessage(locale, "navBudget") },
    { href: "/admin/export", label: getMessage(locale, "navExport") },
    { href: "/admin/members", label: getMessage(locale, "navMembers") },
    { href: "/admin/masters", label: getMessage(locale, "navMasters") },
    { href: "/admin/settings", label: getMessage(locale, "navSettings") },
    { href: "/timesheet", label: getMessage(locale, "navMyTimesheet") },
  ];

  return (
    <AppShell
      user={user}
      nav={user.role === "ADMIN" ? adminNav : memberNav}
      locale={locale}
    >
      {children}
    </AppShell>
  );
}
