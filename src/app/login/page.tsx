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

  const features = [
    getMessage(locale, "loginFeature1"),
    getMessage(locale, "loginFeature2"),
    getMessage(locale, "loginFeature3"),
  ];

  return (
    <main className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/* ── panel thương hiệu — ẩn trên màn hình nhỏ ── */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 md:flex md:flex-col md:justify-between md:p-12 lg:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-400/20 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white backdrop-blur-sm">
            TS
          </div>
          <span className="text-sm font-semibold tracking-wide text-white/90">
            Yokogawa Rep Portal
          </span>
        </div>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-semibold leading-tight text-white lg:text-4xl">
            {getMessage(locale, "loginTagline")}
          </h2>
          <ul className="mt-8 space-y-3.5">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-white/85">
                <svg
                  viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-white/70"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} FPTジャパン
        </p>
      </div>

      {/* ── panel đăng nhập ── */}
      <div className="flex items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between md:justify-end">
            <div className="flex items-center gap-2 md:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                TS
              </div>
              <span className="text-sm font-semibold text-slate-700">Yokogawa Rep Portal</span>
            </div>
            <LocaleSwitcher />
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {getMessage(locale, "loginTitle")}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {locale === "ja"
                ? "アカウント情報を入力してください。"
                : "Enter your account details to continue."}
            </p>
          </div>

          <div className="card p-6 shadow-sm">
            <LoginForm next={next ?? ""} />
          </div>

          <p className="mt-5 text-center text-xs text-slate-400">
            {locale === "ja"
              ? "パスワードを忘れた場合は管理者に連絡してください。"
              : "Forgot your password? Contact an administrator for a reset."}
          </p>
        </div>
      </div>
    </main>
  );
}
