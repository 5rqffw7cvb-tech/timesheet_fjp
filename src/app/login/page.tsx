import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/timesheet");
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-brand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm">
            TS
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Timesheet</h1>
          <p className="mt-1 text-sm text-slate-500">
            Yokogawa Rep Portal — 週間進捗状況報告書
          </p>
        </div>
        <div className="card p-6">
          <LoginForm next={next ?? ""} />
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">
          Quên mật khẩu? Liên hệ quản trị viên để được cấp lại.
        </p>
      </div>
    </main>
  );
}
