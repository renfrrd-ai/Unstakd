import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Card from the design: white panel, hairline border, 18px radius; `raised` adds the soft shadow.
export function Panel({ className, raised, ...props }: ComponentProps<"div"> & { raised?: boolean }) {
  return <div className={cn("rounded-[18px] border border-border bg-panel", raised && "shadow-card", className)} {...props} />;
}

export function List({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn("m-0 list-none overflow-hidden rounded-[18px] border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border", className)}
      {...props}
    />
  );
}

const rowClass = "flex flex-wrap items-center justify-between gap-3 px-5 py-3.5";

export function ListRow({ href, className, children }: { href?: string; className?: string; children: ReactNode }) {
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(rowClass, "text-text hover:bg-selected", className)}>
          {children}
        </Link>
      ) : (
        <div className={cn(rowClass, className)}>{children}</div>
      )}
    </li>
  );
}

export function SectionHeader({ id, title, description, action }: { id?: string; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="m-0 text-lg font-semibold">{title}</h2>
        {description && <p className="m-0 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// Small heading row inside a card: title left, note or link right.
export function CardHeader({ title, aside, as: H = "h2", id }: { title: ReactNode; aside?: ReactNode; as?: "h2" | "h3"; id?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <H id={id} className="m-0 text-base font-semibold">{title}</H>
      {aside && <span className="text-xs text-muted">{aside}</span>}
    </div>
  );
}

export function Mono({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("font-mono text-xs", className)} {...props} />;
}

export function EmptyState({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  return (
    <Panel className={cn("flex flex-col items-start gap-2 p-7", className)}>
      <p className="m-0 font-semibold">{title}</p>
      {children && <div className="flex flex-col items-start gap-3 text-muted">{children}</div>}
    </Panel>
  );
}

// Definition rows: muted label left, value right, hairline between.
export function KeyValues({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("m-0 flex flex-col [&>div+div]:border-t [&>div+div]:border-border", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex justify-between gap-3 py-2.25">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 min-w-0 text-right font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
