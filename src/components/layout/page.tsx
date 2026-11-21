import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/motion";
import { cn } from "@/lib/cn";

export function PageMain({ children, className = "gap-8" }: { children: ReactNode; className?: string }) {
  return <main className={cn("mx-auto flex w-full max-w-320 flex-col px-4 pt-8 pb-18 sm:px-12 sm:pt-11", className)}>{children}</main>;
}

export function PageTitle({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <Reveal as="section" className="flex flex-wrap items-end justify-between gap-5">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="m-0 text-[28px] leading-[1.15] font-bold tracking-[-0.03em] sm:text-[32px]">{title}</h1>
        {description && <p className="m-0 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </Reveal>
  );
}

// Project tab pages sit under ProjectHeader, so they start closer to it.
export function ProjectMain({ children, className }: { children: ReactNode; className?: string }) {
  return <PageMain className={cn("gap-6 pt-7 sm:pt-8", className)}>{children}</PageMain>;
}
