import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NavLinks } from "./nav-links";

export type Crumb = { label: string; href?: string };

export function ProjectHeader({ slug, crumbs, status, actions }: { slug: string; crumbs: Crumb[]; status?: ReactNode; actions?: ReactNode }) {
  const base = `/projects/${slug}`;
  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/deployments`, label: "Deployments" },
    { href: `${base}/logs`, label: "Logs" },
    { href: `${base}/environment`, label: "Environment" },
    { href: `${base}/domains`, label: "Domains" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-300 flex-col gap-2.5 px-4 pt-3.5 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-sm">
            <span aria-hidden="true" className="inline-block h-4.5 w-2.5 bg-accent" />
            <Link href="/" className="text-base font-bold text-text">unstakd</Link>
            {crumbs.map((c) => (
              <Fragment key={c.label}>
                <span className="text-dim">/</span>
                {c.href ? <Link href={c.href} className="text-soft hover:text-text">{c.label}</Link> : <span className="font-bold">{c.label}</span>}
              </Fragment>
            ))}
            {status}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {actions}
            <ThemeToggle />
          </div>
        </div>
        <NavLinks items={tabs} label="Project" variant="tab" />
      </div>
    </header>
  );
}
