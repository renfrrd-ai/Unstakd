import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { buttonClass } from "./button";

// Features from the design that Unstakd doesn't have yet are shown, but inactive.

export function SoonBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-panel-2 px-1.75 py-px text-[10px] font-semibold tracking-wide text-muted uppercase", className)}>
      Soon
    </span>
  );
}

export function SoonButton({ children, variant = "secondary", size = "md", className }: { children: ReactNode; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; className?: string }) {
  return (
    <button type="button" disabled aria-disabled="true" title="Coming soon" className={buttonClass(variant, size, cn("disabled:opacity-60", className))}>
      {children}
      <SoonBadge />
    </button>
  );
}

export function SoonLink({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span aria-disabled="true" title="Coming soon" className={cn("inline-flex cursor-not-allowed items-center gap-2 text-[13px] font-medium text-dim", className)}>
      {children}
      <SoonBadge />
    </span>
  );
}

// Wraps a whole card that isn't wired up yet: dimmed, not interactive, labelled.
export function Inactive({ children, className, label = "Coming soon" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div aria-disabled="true" title={label} className={cn("relative select-none", className)}>
      <div className="pointer-events-none h-full w-full opacity-55 saturate-50">{children}</div>
      <SoonBadge className="absolute top-3 right-3" />
    </div>
  );
}
