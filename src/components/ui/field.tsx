import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const control = "h-10 rounded-[10px] border border-border-strong bg-panel px-3 text-[13px] text-text placeholder:text-dim";

export function Field({ label, error, children, className }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-xs font-medium text-muted", className)}>
      {label}
      {children}
      {error && <span className="text-err">{error}</span>}
    </label>
  );
}

export function Input({ mono, className, ...props }: ComponentProps<"input"> & { mono?: boolean }) {
  return <input className={cn(control, mono && "font-mono text-xs", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn("rounded-[12px] border border-border-strong bg-sunken p-3 font-mono text-xs leading-relaxed text-text placeholder:text-dim", className)} {...props} />;
}

export function SuffixInput({ suffix, className, ...props }: ComponentProps<"input"> & { suffix: string }) {
  return (
    <span className={cn("flex h-10 items-center overflow-hidden rounded-[10px] border border-border-strong bg-panel", className)}>
      <input className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 font-mono text-xs text-text outline-none" {...props} />
      <span className="px-3 font-mono text-xs text-muted">{suffix}</span>
    </span>
  );
}

export function Checkbox({ label, hint, className, ...props }: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" {...props} />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
