import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppShell, { type NavItem } from "@/components/AppShell";

const MEMBER_NAV: NavItem[] = [
  { href: "/timesheet", label: "Nhập timesheet" },
  { href: "/summary", label: "Tổng hợp tháng" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Theo dõi" },
  { href: "/admin/approvals", label: "Duyệt & chốt sổ" },
  { href: "/admin/budgets", label: "Budget" },
  { href: "/admin/export", label: "Xuất 週報" },
  { href: "/admin/members", label: "Thành viên" },
  { href: "/admin/masters", label: "PJ / 工種" },
  { href: "/admin/settings", label: "Cấu hình" },
  { href: "/timesheet", label: "Timesheet của tôi" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePw) redirect("/change-password");

  return (
    <AppShell
      user={user}
      nav={user.role === "ADMIN" ? ADMIN_NAV : MEMBER_NAV}
    >
      {children}
    </AppShell>
  );
}
