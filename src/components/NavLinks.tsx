"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./AppShell";

export default function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
      {items.map((item) => {
        const on =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition ${
              on ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
