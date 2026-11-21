import type { ReactNode } from "react";
import { Meter } from "./meter";
import { Panel } from "./panel";

export function StatCard({ label, value, unit, percent, footnote }: { label: string; value: ReactNode; unit?: string; percent?: number; footnote?: ReactNode }) {
  return (
    <Panel className="flex flex-col gap-1.5 rounded-2xl p-5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-[28px] leading-tight font-bold tracking-[-0.02em]">
        {value}
        {unit && <span className="text-base font-semibold text-muted">{unit}</span>}
      </span>
      {percent !== undefined && <Meter percent={percent} label={label} />}
      {footnote && <span className="text-xs text-muted">{footnote}</span>}
    </Panel>
  );
}
