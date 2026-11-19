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

export function StepTrack({ steps }: { steps: DeployStep[] }) {
  return (
    <ol aria-label="Deploy steps" className="m-0 grid list-none grid-cols-2 gap-2 p-0 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
      {ORDER.map((name) => {
        const step = steps.find((s) => s.name === name) ?? { name, status: "pending" as const };
        return (
          <li
            key={name}
            className={cn(
              "rounded-md border-t-3 bg-panel p-3",
              step.status === "done" && "border-accent",
              step.status === "running" && "animate-pulse border-warn",
              step.status === "failed" && "border-err bg-err-bg",
              (step.status === "pending" || step.status === "skipped") && "border-border-strong text-muted",
            )}
          >
            <div className="font-semibold">{NAMES[name]}</div>
            <div className={cn("mt-1 font-mono text-xs", step.status === "failed" ? "text-err" : "text-muted")}>
              {step.status === "done" && duration(step.durationMs)}
              {step.status === "running" && "running…"}
              {step.status === "failed" && (step.note ?? "failed")}
              {step.status === "skipped" && "skipped"}
              {step.status === "pending" && "—"}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
