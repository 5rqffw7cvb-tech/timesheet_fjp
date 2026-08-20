"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type FormState } from "@/actions/auth";
import { useLocale } from "@/components/LocaleProvider";

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useLocale();
  return (
    <button type="submit" className="btn-primary w-full py-2" disabled={pending}>
      {pending ? t("loginLoading") : t("loginButton")}
    </button>
  );
}

export default function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  const { t } = useLocale();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="username">{t("loginUsername")}</label>
        <input
          id="username" name="username" className="input" autoComplete="username"
          autoFocus required placeholder={t("loginPlaceholder")}
        />
      </div>
      <div>
        <label className="label" htmlFor="password">{t("loginPassword")}</label>
        <input
          id="password" name="password" type="password" className="input"
          autoComplete="current-password" required
        />
      </div>
      {state.error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}
