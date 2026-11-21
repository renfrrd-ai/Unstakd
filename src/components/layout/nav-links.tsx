"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SoonBadge } from "@/components/ui/soon";
import { cn } from "@/lib/cn";

// `soon` items are in the design but not built yet: shown, never linked.
export type NavItem = { href: string; label: string; exact?: boolean; soon?: boolean; also?: string[] };

const styles = {
  pill: {
    nav: "flex gap-1",
    base: "rounded-full px-3.5 py-2 font-medium text-muted hover:text-text",
    active: "bg-panel-2 font-semibold text-text",
  },
  tab: {
    nav: "flex gap-1 rounded-xl bg-panel-2 p-1",
    base: "rounded-[9px] px-3 py-1.75 text-[13px] font-medium text-muted hover:text-text",
    active: "bg-panel font-semibold text-text shadow-soft",
  },
};

export function isActive(pathname: string, item: Pick<NavItem, "href" | "exact" | "also">) {
  const hit = (href: string) => (item.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return hit(item.href) || (item.also ?? []).some(hit);
}

export function NavLinks({ items, label, variant, className, pathname }: { items: NavItem[]; label: string; variant: keyof typeof styles; className?: string; pathname?: string }) {
  return <Links items={items} label={label} variant={variant} className={className} pathname={pathname} />;
}

function Links({ pathname, ...rest }: { items: NavItem[]; label: string; variant: keyof typeof styles; className?: string; pathname?: string }) {
  return pathname === undefined ? <LiveLinks {...rest} /> : <StaticLinks {...rest} pathname={pathname} />;
}

function LiveLinks(props: { items: NavItem[]; label: string; variant: keyof typeof styles; className?: string }) {
  return <StaticLinks {...props} pathname={usePathname()} />;
}

function StaticLinks({ items, label, variant, className, pathname }: { items: NavItem[]; label: string; variant: keyof typeof styles; className?: string; pathname: string }) {
  const s = styles[variant];
  return (
    <nav aria-label={label} className={cn("max-w-full overflow-x-auto [scrollbar-width:none]", className)}>
      <ul className={cn("m-0 w-max list-none p-0", s.nav)}>
        {items.map((item) => {
          if (item.soon) {
            return (
              <li key={item.href}>
                <span aria-disabled="true" title="Coming soon" className={cn(s.base, "inline-flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap text-dim hover:text-dim")}>
                  {item.label}
                  <SoonBadge />
                </span>
              </li>
            );
          }
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(s.base, "inline-block whitespace-nowrap", active && s.active)}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
