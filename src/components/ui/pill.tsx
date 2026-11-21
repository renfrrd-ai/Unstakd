import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "ok" | "warn" | "err" | "neutral" | "waiting" | "accent";

const tones: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  err: "bg-err-bg text-err",
  neutral: "bg-neutral-bg text-neutral",
  waiting: "border border-warn-dot text-warn",
  accent: "bg-accent-soft text-accent-strong",
};

export const dotClass: Record<Tone, string> = {
  ok: "bg-ok-dot",
  warn: "bg-warn-dot",
  err: "bg-err-dot",
  neutral: "bg-neutral-dot",
  waiting: "bg-warn-dot",
  accent: "bg-accent",
};

export function Dot({ tone, className, pulse }: { tone: Tone; className?: string; pulse?: boolean }) {
  return <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", dotClass[tone], pulse && "animate-pulse", className)} />;
}

// Status pill from the design: soft tinted background, optional leading dot.
export function Pill({ tone, children, className, dot = true }: { tone: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.75 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <Dot tone={tone} pulse={tone === "warn"} />}
      {children}
    </span>
  );
}
