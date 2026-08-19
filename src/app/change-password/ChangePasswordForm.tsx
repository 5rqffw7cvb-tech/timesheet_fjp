"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type FormState } from "@/actions/auth";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full py-2" disabled={pending}>
      {pending ? "Đang lưu…" : "Lưu mật khẩu mới"}
    </button>
  );
}

export default function ChangePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">Mật khẩu hiện tại</label>
        <input id="current" name="current" type="password" className="input" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="next">Mật khẩu mới</label>
        <input id="next" name="next" type="password" className="input" required
               placeholder="Ít nhất 8 ký tự, có chữ và số" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Xác nhận mật khẩu mới</label>
        <input id="confirm" name="confirm" type="password" className="input" required />
      </div>
      {state.error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}
      <SubmitButton />
    </form>
  );
}
