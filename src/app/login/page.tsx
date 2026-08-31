import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { getLocale } from "@/lib/requestLocale";
import { getMessage } from "@/lib/i18n";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/timesheet");
  const { next } = await searchParams;
  const locale = await getLocale();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-12">
      {/* nền tối giản — 1 quầng sáng mờ phía sau card, không hoa văn rườm rà */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-400/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="absolute right-4 top-4">
        <LocaleSwitcher />
      </div>

      <div className="relative w-full max-w-[23rem]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white shadow-sm shadow-brand-600/30">
            TS
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {getMessage(locale, "loginTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Yokogawa Rep Portal</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.16)]">
          <LoginForm next={next ?? ""} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {locale === "ja"
            ? "パスワードを忘れた場合は管理者に連絡してください。"
            : "Forgot your password? Contact an administrator for a reset."}
        </p>
      </div>
    </main>
  );
}
