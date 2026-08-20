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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-brand-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <LocaleSwitcher />
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white shadow-sm">
            TS
          </div>
          <h1 className="text-lg font-semibold text-slate-800">{getMessage(locale, "loginTitle")}</h1>
          <p className="mt-1 text-sm text-slate-500">Yokogawa Rep Portal</p>
        </div>
        <div className="card p-6">
          <LoginForm next={next ?? ""} />
        </div>
        <p className="mt-5 text-center text-xs text-slate-400">
          {locale === "ja"
            ? "パスワードを忘れた場合は管理者に連絡してください。"
            : "Forgot your password? Contact an administrator for a reset."}
        </p>
      </div>
    </main>
  );
}
