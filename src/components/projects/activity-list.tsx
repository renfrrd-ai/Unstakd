import { Dot } from "@/components/ui/pill";
import { EmptyState, Mono } from "@/components/ui/panel";
import type { AuditEvent } from "@/db/schema";
import { describeEvent, eventTone } from "@/lib/activity";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/format";

// Dot + sentence + time, from the design's Activity card. `bare` drops the surrounding card.
export function ActivityList({ events, bare, className }: { events: AuditEvent[]; bare?: boolean; className?: string }) {
  if (events.length === 0) {
    if (bare) return <p className="m-0 text-[13px] text-muted">Nothing yet. Deploys, backups and config changes show up here.</p>;
    return <EmptyState title="Nothing yet">Deploys, backups and config changes show up here.</EmptyState>;
  }
  return (
    <ol className={cn("m-0 flex list-none flex-col p-0", !bare && "rounded-[18px] border border-border bg-panel px-5", className)}>
      {events.map((e, i) => {
        const { text, detail } = describeEvent(e);
        return (
          <li key={e.id} className={cn("flex gap-3 py-2.5", i > 0 && "border-t border-border", !bare && "py-3.5")}>
            <Dot tone={eventTone(e.action)} className="mt-1.75 size-2" />
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <span className="min-w-0 text-[13px] break-words">{text}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                {detail && !bare && <Mono className="text-dim">{detail}</Mono>}
                <time dateTime={e.createdAt.toISOString()} title={e.createdAt.toLocaleString("en-CA")}>{timeAgo(e.createdAt)}</time>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
