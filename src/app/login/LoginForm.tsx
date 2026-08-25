"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type FormState } from "@/actions/auth";
import { useLocale } from "@/components/LocaleProvider";

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useLocale();
  return (
    <button type="submit" className="btn-primary w-full py-2" disabled={pending}>
      {pending && (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4Z" />
        </svg>
      )}
      {pending ? t("loginLoading") : t("loginButton")}
    </button>
  );
}

export default function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  const { t } = useLocale();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="username">{t("loginUsername")}</label>
        <div className="relative">
          <svg
            viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2.5 17.5a7.5 7.5 0 0 1 15 0 .75.75 0 0 1-.75.75h-13.5a.75.75 0 0 1-.75-.75Z" />
          </svg>
          <input
            id="username" name="username" className="input pl-8" autoComplete="username"
            autoFocus required placeholder={t("loginPlaceholder")}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="password">{t("loginPassword")}</label>
        <div className="relative">
          <svg
            viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 0 0-4.5 4.5V8H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 7V5.5a3 3 0 1 0-6 0V8h6Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            id="password" name="password" type={showPassword ? "text" : "password"}
            className="input pl-8 pr-9"
            autoComplete="current-password" required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t("loginHidePassword") : t("loginShowPassword")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            {showPassword ? (
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                <path d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.86-1.86c1.44-1.09 2.6-2.6 3.34-4.02a1.87 1.87 0 0 0 0-1.68C17.7 5.9 14.3 3 10 3a9.1 9.1 0 0 0-3.44.68L3.28 2.22Zm5.68 5.68a2.5 2.5 0 0 0 3.14 3.14l-3.14-3.14ZM10 6a4 4 0 0 1 3.96 4.6l-1.55-1.55A2.5 2.5 0 0 0 9.95 7.6L8.4 6.04A4 4 0 0 1 10 6Z" />
                <path d="M2.7 6.4c-.9.94-1.66 2.02-2.19 3.02a1.87 1.87 0 0 0 0 1.68C1.94 13.7 5.34 16.6 9.64 16.6c1.15 0 2.24-.2 3.25-.57l-1.6-1.6a4 4 0 0 1-4.9-4.9L2.7 6.4Z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
                <path d="M.98 10.32C1.86 6.44 5.44 3.5 10 3.5s8.14 2.94 9.02 6.82a1.87 1.87 0 0 1 0 .36C18.14 14.56 14.56 17.5 10 17.5s-8.14-2.94-9.02-6.82a1.87 1.87 0 0 1 0-.36ZM10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {state.error && (
        <p className="flex items-start gap-1.5 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0">
            <path
              fillRule="evenodd"
              d="M8.48 2.5c.66-1.15 2.38-1.15 3.04 0l6.54 11.37c.66 1.15-.2 2.58-1.52 2.58H3.46c-1.32 0-2.18-1.43-1.52-2.58L8.48 2.5ZM10 6.75a.75.75 0 0 1 .75.75v3.25a.75.75 0 0 1-1.5 0V7.5A.75.75 0 0 1 10 6.75Zm0 7.25a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"
              clipRule="evenodd"
            />
          </svg>
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
