import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control = "h-11.5 rounded-lg border border-border-strong bg-panel px-3.5 text-sm text-text placeholder:text-dim";

export function Field({ label, error, children, className }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-2 text-[13px] text-muted", className)}>
      {label}
      {children}
      {error && <span className="text-err">{error}</span>}
    </label>
  );
}

export function Input({ mono, className, ...props }: ComponentProps<"input"> & { mono?: boolean }) {
  return <input className={cn(control, mono && "font-mono", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, className)} {...props} />;
}

export function SuffixInput({ suffix, className, ...props }: ComponentProps<"input"> & { suffix: string }) {
  return (
    <span className={cn("flex h-11.5 items-center overflow-hidden rounded-lg border border-border-strong bg-panel", className)}>
      <input className="h-full min-w-0 flex-1 border-0 bg-transparent px-3.5 font-mono text-sm text-text outline-none" {...props} />
      <span className="px-3.5 font-mono text-[13px] text-muted">{suffix}</span>
    </span>
  );
}
