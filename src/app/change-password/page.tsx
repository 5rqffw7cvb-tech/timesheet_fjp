import { requireUser } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { getLocale } from "@/lib/requestLocale";
import { getMessage } from "@/lib/i18n";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  const locale = await getLocale();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <LocaleSwitcher />
        </div>
        <div className="card p-6">
          <h1 className="text-base font-semibold text-slate-800">{getMessage(locale, "changePasswordTitle")}</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            {user.mustChangePw
              ? (locale === "ja"
                ? "初回ログインです。ご自身のパスワードを設定してください。"
                : "This is your first sign-in. Please set your own password.")
              : `${locale === "ja" ? "アカウント" : "Account"}: ${user.username}`}
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
