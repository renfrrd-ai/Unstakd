import type { ReactNode } from "react";
import { Panel } from "./panel";

export function StatCard({ label, value, unit, percent, footnote }: { label: string; value: ReactNode; unit?: string; percent?: number; footnote?: string }) {
  return (
    <Panel className="p-4.5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-1 font-display text-4xl font-semibold">
        {value}
        {unit && <span className="text-lg text-muted">{unit}</span>}
      </div>
      {percent !== undefined && (
        <div className="mt-2.5 h-1.5 rounded-sm bg-track" role="meter" aria-label={label} aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-1.5 rounded-sm bg-accent" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      )}
      {footnote && <div className="mt-2.5 font-mono text-xs text-muted">{footnote}</div>}
    </Panel>
  );
}
