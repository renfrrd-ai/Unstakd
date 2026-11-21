import { Grow } from "@/components/motion/motion";
import { HOT, hotText, Meter, pctText } from "@/components/ui/meter";
import { Panel, CardHeader } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { vcpu } from "@/lib/usage";
import type { ProjectView } from "./view";

export const SERIES = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5"];
export const seriesOf = (i: number) => SERIES[i % SERIES.length];

// How the server's cores are split between apps (static sites take none), and how busy each app is.
export function AllocationCard({ projects, cores, hostname }: { projects: ProjectView[]; cores: number; hostname: string }) {
  const apps = projects.filter((p) => !p.isStatic);
  const allocated = apps.reduce((a, p) => a + p.alloc, 0);
  const scale = Math.max(cores, allocated);
  const hot = apps.filter((p) => p.cpu != null && p.cpu >= HOT).sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))[0];

  return (
    <Panel className="flex flex-col gap-3.5 p-5">
      <CardHeader title="CPU allocation" aside={`${hostname} · ${vcpu(cores)}`} />
      {apps.length === 0 ? (
        <p className="m-0 text-[13px] text-muted">No containers yet. Static sites don&apos;t take any CPU allocation.</p>
      ) : (
        <>
          <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-track">
            {apps.map((p, i) => (
              <Grow key={p.slug} className={seriesOf(i)} width={`${(100 * p.alloc) / scale}%`} delay={i * 0.06} />
            ))}
          </div>
          <p className="m-0 text-xs text-muted">
            {vcpu(allocated)} allocated of {vcpu(cores)}
            {allocated > cores ? " · overcommitted, apps share the spare time" : ""}
          </p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {apps.map((p, i) => (
              <li key={p.slug} className="flex flex-col gap-1.25">
                <div className="flex items-center gap-2 text-[13px]">
                  <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-[2px]", seriesOf(i))} />
                  <span className="min-w-0 truncate font-medium">{p.name}</span>
                  <span className="ml-auto shrink-0 text-muted">{vcpu(p.alloc)}</span>
                  <span className={cn("w-10 shrink-0 text-right font-semibold", hotText(p.cpu))}>{pctText(p.cpu)}</span>
                </div>
                <Meter percent={p.cpu} size="sm" label={`${p.name} CPU of allocation`} />
              </li>
            ))}
          </ul>
        </>
      )}
      {hot && (
        <p className="m-0 rounded-[10px] bg-warn-bg px-3 py-2 text-xs text-warn">
          {hot.name} is using {pctText(hot.cpu)} of its allocation{hot.health === "building" ? " while building" : ""}.
        </p>
      )}
    </Panel>
  );
}
