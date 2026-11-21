import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { NavLinks } from "./nav-links";

// Sits under the top bar on every project page: breadcrumb, name + status, actions, tabs.
export function ProjectHeader({ slug, name, meta, status, actions }: { slug: string; name: string; meta?: ReactNode; status?: ReactNode; actions?: ReactNode }) {
  const base = `/projects/${slug}`;
  const tabs = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/deployments`, label: "Deployments" },
    { href: `${base}/logs`, label: "Logs" },
    { href: `${base}/environment`, label: "Environment" },
    { href: `${base}/domains`, label: "Domains" },
    { href: `${base}/databases`, label: "Databases" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-320 flex-col gap-5 px-4 pt-8 sm:px-12 sm:pt-11">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
        <Link href="/projects" className="hover:text-text">Projects</Link>
        <span className="px-2 text-dim">/</span>
        <span className="font-medium text-text">{name}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.03em] break-all sm:text-[32px]">{name}</h1>
            {status}
          </div>
          {meta && <p className="m-0 text-sm text-muted">{meta}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      <Suspense fallback={<NavLinks items={tabs} label="Project" variant="tab" pathname="" />}>
        <NavLinks items={tabs} label="Project" variant="tab" />
      </Suspense>
    </div>
  );
}
