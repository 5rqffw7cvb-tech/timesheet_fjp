import { NextResponse, type NextRequest } from "next/server";
import { verifySession } from "@/lib/jwt";

const PUBLIC_PATHS = ["/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("ts_session")?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Các màn hình theo dõi mà PM/DM cũng vào được. Session token không mang
  // managerLevel (đổi quyền là có hiệu lực ngay, không cần đăng nhập lại) nên
  // ở đây chỉ mở đường; requireAdminView() trong từng page mới quyết định
  // được vào hay không và giới hạn dữ liệu theo project.
  const MANAGER_PATHS = ["/admin", "/admin/approvals", "/admin/budgets", "/admin/export"];
  const managerArea = MANAGER_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (pathname.startsWith("/admin") && session.role !== "ADMIN" && !managerArea) {
    const url = req.nextUrl.clone();
    url.pathname = "/timesheet";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
