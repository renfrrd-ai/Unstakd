import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function Panel({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-border bg-panel", className)} {...props} />;
}

export function List({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn("m-0 list-none overflow-hidden rounded-xl border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border", className)}
      {...props}
    />
  );
}

const rowClass = "flex flex-wrap items-center justify-between gap-3 px-5 py-4";

export function ListRow({ href, className, children }: { href?: string; className?: string; children: ReactNode }) {
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(rowClass, "text-text hover:bg-panel-2/40", className)}>
          {children}
        </Link>
      ) : (
        <div className={cn(rowClass, className)}>{children}</div>
      )}
    </li>
  );
}

export function SectionHeader({ id, title, description, action }: { id?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="m-0 text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Mono({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("font-mono text-[13px]", className)} {...props} />;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Panel className="flex flex-col items-start gap-2 p-7">
      <p className="m-0 font-semibold">{title}</p>
      {children && <div className="text-muted">{children}</div>}
    </Panel>
  );
}
