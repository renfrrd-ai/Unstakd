"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; exact?: boolean };

const styles = {
  pill: { base: "rounded-md px-3 py-2.5 text-muted hover:text-text", active: "bg-panel-2 font-semibold text-text" },
  tab: { base: "border-b-2 border-transparent px-3.5 py-3 text-muted hover:text-text", active: "border-accent font-semibold text-text" },
};

export function NavLinks({ items, label, variant }: { items: NavItem[]; label: string; variant: keyof typeof styles }) {
  const pathname = usePathname();
  const s = styles[variant];
  return (
    <nav aria-label={label} className="-mb-px flex flex-wrap gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn(s.base, active && s.active)}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
