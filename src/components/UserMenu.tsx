"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logoutAction } from "@/actions/auth";
import { type Locale, getMessage } from "@/lib/i18n";

export default function UserMenu({
  user, locale,
}: {
  user: { fullName: string; username: string; role: string; roleTitle?: string | null };
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const roleLabel = user.role === "ADMIN"
    ? getMessage(locale, "adminRole")
    : user.roleTitle || getMessage(locale, "memberRole");
  const initials = user.fullName.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium text-slate-700">{user.fullName}</span>
          <span className="block text-xs text-slate-400">{roleLabel}</span>
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-2.5">
            <div className="truncate text-sm font-medium text-slate-800">{user.fullName}</div>
            <div className="truncate text-xs text-slate-400">@{user.username} · {roleLabel}</div>
          </div>

          <Link
            href="/change-password"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400">
              <path fillRule="evenodd" d="M8 7V5a4 4 0 1 1 8 0v2h.25A2.75 2.75 0 0 1 19 9.75v6.5A2.75 2.75 0 0 1 16.25 19H7.75A2.75 2.75 0 0 1 5 16.25v-6.5A2.75 2.75 0 0 1 7.75 7H8Zm2-3.5A2.5 2.5 0 0 0 7.5 6v1h5V6A2.5 2.5 0 0 0 10 3.5Z" clipRule="evenodd" />
            </svg>
            {getMessage(locale, "passwordMenu")}
          </Link>

          <form action={logoutAction} role="none">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
                <path fillRule="evenodd" d="M6 10a.75.75 0 0 1 .75-.75h9.19l-2.22-2.22a.75.75 0 1 1 1.06-1.06l3.5 3.5a.75.75 0 0 1 0 1.06l-3.5 3.5a.75.75 0 1 1-1.06-1.06l2.22-2.22H6.75A.75.75 0 0 1 6 10Z" clipRule="evenodd" />
              </svg>
              {getMessage(locale, "logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
