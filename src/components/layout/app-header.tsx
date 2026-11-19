import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NavLinks } from "./nav-links";

const mainNav = [
  { href: "/", label: "Overview", exact: true },
  { href: "/projects", label: "Projects" },
  { href: "/databases", label: "Databases" },
  { href: "/domains", label: "Domains" },
  { href: "/activity", label: "Activity" },
];

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
        <div className="flex flex-wrap items-center gap-7">
          <BrandMark />
          <NavLinks items={mainNav} label="Main" variant="pill" />
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function PageMain({ children, className = "gap-7" }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto flex max-w-300 flex-col px-4 py-8 sm:px-8 ${className}`}>{children}</main>;
}
