import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { hotText, Meter, pctText } from "@/components/ui/meter";
import { Pill } from "@/components/ui/pill";
import { SoonBadge } from "@/components/ui/soon";
import { healthPill } from "@/lib/status";
import { vcpu } from "@/lib/usage";
import { Elapsed } from "./elapsed";
import { ProjectAction } from "./project-action";
import { RouteChain } from "./route-chain";
import type { ProjectView } from "./view";

export function ProjectCard({ p }: { p: ProjectView }) {
  const pill = healthPill[p.health];
  return (
    <article className="flex flex-col gap-4 rounded-[18px] border border-border bg-panel p-5 shadow-card">
      <div className="flex items-center justify-between gap-2.5">
        <h3 className="m-0 min-w-0 truncate text-[17px] font-semibold tracking-[-0.01em]">
          <Link href={`/projects/${p.slug}`} className="hover:text-accent-text">{p.name}</Link>
        </h3>
        <Pill tone={pill.tone}>
          {pill.label}
          {p.buildingSince && <>&nbsp;<Elapsed since={p.buildingSince} /></>}
        </Pill>
      </div>
      <RouteChain
        domain={p.host}
        app={`${p.stack} · ${p.deployed}`}
        data={p.db ?? undefined}
        addDataHref={p.isStatic ? undefined : `/databases/new?project=${p.slug}`}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-2 text-xs text-muted">
          <span>{p.isStatic ? "Static files · no container" : `CPU · ${vcpu(p.alloc)} allocated`}</span>
          {!p.isStatic && <span className={`font-semibold ${hotText(p.cpu)}`}>{pctText(p.cpu)}</span>}
        </div>
        <Meter percent={p.isStatic ? 0 : p.cpu} label={`${p.name} CPU of allocation`} />
      </div>
      <div className="mt-auto flex items-center gap-2">
        <span className="mr-auto inline-flex items-center gap-1.5 text-[13px] text-dim" title="Per-project cost is coming with Billing">
          Cost / mo <SoonBadge />
        </span>
        <ButtonLink href={`/projects?p=${p.slug}`} size="sm" className="h-8.5 px-3 text-[13px]">Logs</ButtonLink>
        <ProjectAction p={p} />
      </div>
    </article>
  );
}

export function ConnectRepoCard() {
  return (
    <Link
      href="/new"
      className="flex min-h-60 flex-col items-center justify-center gap-1.5 rounded-[18px] border-[1.5px] border-dashed border-border-dashed p-5 text-center text-text hover:bg-panel"
    >
      <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-panel-2 text-[22px]">+</span>
      <span className="mt-1.5 text-[15px] font-semibold">Connect a repo</span>
      <span className="text-[13px] text-muted">GitHub, Dockerfile or a static folder</span>
    </Link>
  );
}
