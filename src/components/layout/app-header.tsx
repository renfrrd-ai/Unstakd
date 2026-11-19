import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { HeaderAction } from "./header-action";
import { NavLinks } from "./nav-links";

const mainNav = [
  { href: "/", label: "Projects", exact: true },
  { href: "/databases", label: "Databases" },
  { href: "/activity", label: "Activity" },
  { href: "/server", label: "Server" },
];

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
        <div className="flex flex-wrap items-center gap-7">
          <BrandMark />
          <NavLinks items={mainNav} label="Main" variant="pill" />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <HeaderAction />
          <ThemeToggle />
          {children}
        </div>
      </div>
    </header>
  );
}

export function PageMain({ children, className = "gap-7" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto flex max-w-300 flex-col px-4 py-8 sm:px-8 ${className}`}>{children}</main>;
}

export function PageTitle({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div>
      <h1 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em]">{title}</h1>
      {description && <p className="mt-1.5 mb-0 text-muted">{description}</p>}
    </div>
  );
}
