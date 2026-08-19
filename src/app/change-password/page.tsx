import { requireUser } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await requireUser();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm">
        <div className="card p-6">
          <h1 className="text-base font-semibold text-slate-800">Đổi mật khẩu</h1>
          <p className="mt-1 mb-5 text-sm text-slate-500">
            {user.mustChangePw
              ? "Đây là lần đăng nhập đầu tiên, vui lòng đặt mật khẩu riêng của bạn."
              : `Tài khoản ${user.username}`}
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
