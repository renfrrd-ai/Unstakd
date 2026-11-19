import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "ok" | "warn" | "err" | "neutral" | "waiting";

const tones: Record<Tone, string> = {
  ok: "bg-ok-bg text-accent-text",
  warn: "bg-warn-bg text-warn",
  err: "bg-err-bg text-err",
  neutral: "bg-panel-2 text-muted",
  waiting: "border border-warn text-warn",
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
