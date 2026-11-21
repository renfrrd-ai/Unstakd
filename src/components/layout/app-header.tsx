import { Suspense, type ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand-mark";
import { ButtonLink } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NavLinks, type NavItem } from "./nav-links";

const mainNav: NavItem[] = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/projects", label: "Projects" },
  { href: "/map", label: "Map" },
  { href: "/databases", label: "Databases" },
  { href: "/domains", label: "Domains" },
  { href: "/billing", label: "Billing", soon: true },
  { href: "/activity", label: "Activity" },
  { href: "/server", label: "Server" },
];

export function AppHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-border bg-panel">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3.5 sm:px-12">
        <BrandMark />
        <div className="order-last w-full lg:order-none lg:w-auto lg:flex-1">
          {/* usePathname is request data: the fallback is the same nav with nothing highlighted. */}
          <Suspense fallback={<NavLinks items={mainNav} label="Main" variant="pill" pathname="" />}>
            <NavLinks items={mainNav} label="Main" variant="pill" />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <ButtonLink href="/new" variant="accent">New project</ButtonLink>
          <ThemeToggle />
          {children}
        </div>
      </div>
    </header>
  );
}

export { PageMain, PageTitle } from "./page";
