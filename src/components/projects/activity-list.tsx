import { EmptyState, Mono } from "@/components/ui/panel";
import type { AuditEvent } from "@/db/schema";
import { describeEvent } from "@/lib/activity";
import { timeAgo } from "@/lib/format";

export function ActivityList({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) return <EmptyState title="Nothing yet">Deploys, backups and config changes show up here.</EmptyState>;
  return (
    <ol className="m-0 list-none rounded-xl border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
      {events.map((e) => {
        const { text, detail } = describeEvent(e);
        return (
          <li key={e.id} className="flex flex-wrap justify-between gap-3 px-5 py-3.5">
            <span>{text}</span>
            <Mono className="text-muted">{[detail, timeAgo(e.createdAt)].filter(Boolean).join(" · ")}</Mono>
          </li>
        );
      })}
    </ol>
  );
}
