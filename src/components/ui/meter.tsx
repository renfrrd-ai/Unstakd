import { Grow } from "@/components/motion/motion";
import { cn } from "@/lib/cn";

export const HOT = 80;

// Thin usage bar. Turns amber at HOT% so a busy app stands out the same way everywhere.
export function Meter({ percent, label, size = "md", className }: { percent: number | null; label: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const h = size === "sm" ? "h-1" : size === "lg" ? "h-2" : "h-1.5";
  const pct = percent == null ? null : Math.min(100, Math.max(0, percent));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-track", h, className)}
      role="meter"
      aria-label={label}
      aria-valuenow={pct == null ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {pct != null && <Grow className={cn("rounded-full transition-colors", h, pct >= HOT ? "bg-warn-dot" : "bg-accent")} width={`${Math.max(pct, pct > 0 ? 2 : 0)}%`} />}
    </div>
  );
}

export function pctText(p: number | null) {
  return p == null ? "—" : `${Math.round(p)}%`;
}

export function hotText(p: number | null) {
  return p != null && p >= HOT ? "text-warn" : "text-text";
}
