import { Dot, type Tone } from "@/components/ui/pill";
import type { DeployStep } from "@/db/schema";
import { cn } from "@/lib/cn";
import { duration } from "@/lib/format";

const NAMES: Record<DeployStep["name"], string> = {
  clone: "Clone",
  build: "Build",
  push: "Push image",
  start: "Start",
  health: "Health check",
  switch: "Switch traffic",
};

const ORDER: DeployStep["name"][] = ["clone", "build", "push", "start", "health", "switch"];

const stepTone: Record<DeployStep["status"], Tone> = { done: "ok", running: "warn", failed: "err", pending: "neutral", skipped: "neutral" };

function ordered(steps: DeployStep[]) {
  return ORDER.map((name) => steps.find((s) => s.name === name) ?? { name, status: "pending" as const });
}

// Light cards on the deploy page.
export function StepTrack({ steps }: { steps: DeployStep[] }) {
  return (
    <ol aria-label="Deploy steps" className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
      {ordered(steps).map((step) => (
        <li
          key={step.name}
          className={cn(
            "flex flex-col gap-1 rounded-2xl border border-border bg-panel px-4 py-3",
            step.status === "failed" && "border-err-border bg-err-bg",
            step.status === "running" && "border-warn-dot",
          )}
        >
          <span className="flex items-center gap-2 text-[13px] font-semibold">
            <Dot tone={stepTone[step.status]} pulse={step.status === "running"} className="size-2" />
            {NAMES[step.name]}
          </span>
          <span className={cn("font-mono text-xs", step.status === "failed" ? "text-err" : "text-muted")}>
            {step.status === "done" && duration(step.durationMs)}
            {step.status === "running" && "running…"}
            {step.status === "failed" && (step.note ?? "failed")}
            {step.status === "skipped" && "skipped"}
            {step.status === "pending" && "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}

const chip: Record<DeployStep["status"], string> = {
  done: "bg-[color-mix(in_srgb,var(--log-ok)_14%,transparent)] text-log-ok",
  running: "bg-[color-mix(in_srgb,var(--log-warn)_14%,transparent)] text-log-warn",
  failed: "bg-[color-mix(in_srgb,var(--log-err)_14%,transparent)] text-log-err",
  pending: "bg-log-chip text-log-muted",
  skipped: "bg-log-chip text-log-dim",
};

// Compact chips inside the dark log panel (Projects page).
export function StepChips({ steps }: { steps: DeployStep[] }) {
  return (
    <>
      {ordered(steps).map((s) => (
        <span key={s.name} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs", chip[s.status])}>
          <span aria-hidden="true" className={cn("size-1.5 rounded-full bg-current", s.status === "running" && "animate-pulse", s.status === "pending" && "opacity-50")} />
          {NAMES[s.name]}
        </span>
      ))}
    </>
  );
}
