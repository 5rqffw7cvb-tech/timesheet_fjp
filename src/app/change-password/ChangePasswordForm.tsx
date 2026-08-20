"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type FormState } from "@/actions/auth";
import { useLocale } from "@/components/LocaleProvider";

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useLocale();
  return (
    <button type="submit" className="btn-primary w-full py-2" disabled={pending}>
      {pending ? t("saving") : t("saveNewPassword")}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  const { t } = useLocale();
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">{t("currentPassword")}</label>
        <input id="current" name="current" type="password" className="input" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="next">{t("newPassword")}</label>
        <input id="next" name="next" type="password" className="input" required
               placeholder={t("newPasswordHint")} />
      </div>
      <div>
        <label className="label" htmlFor="confirm">{t("confirmPassword")}</label>
        <input id="confirm" name="confirm" type="password" className="input" required />
      </div>
      {state.error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
