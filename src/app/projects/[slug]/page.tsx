import Link from "next/link";
import { Suspense } from "react";
import { LineChart } from "@/components/charts/line-chart";
import { DeploymentList } from "@/components/deployments/deployment-list";
import { DomainList } from "@/components/domains/domain-list";
import { ProjectMain } from "@/components/layout/page";
import { RouteChain } from "@/components/projects/route-chain";
import { stackLabel } from "@/components/projects/view";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { defaultHost, publicUrl } from "@/lib/domains";
import { env } from "@/lib/env";
import { bytes, shortSha, timeAgo } from "@/lib/format";
import { healthPill } from "@/lib/status";
import { vcpu } from "@/lib/usage";
import { loadProject } from "@/server/load-project";
import { appMetrics, linkedDatabases, listDeployments, listDomains } from "@/server/queries";

type Params = PageProps<"/projects/[slug]">["params"];

export default function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  return (
    <ProjectMain className="gap-8">
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Summary params={params} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Resources params={params} />
      </Suspense>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-8">
          <Suspense fallback={<Skeleton className="h-40" />}>
            <Recent params={params} />
          </Suspense>
        </div>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-8">
          <Suspense fallback={<Skeleton className="h-48" />}>
            <Domains params={params} />
          </Suspense>
        </div>
      </div>
    </ProjectMain>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="m-0 min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

async function Summary({ params }: { params: Params }) {
  const p = await loadProject(params);
  const dbs = await linkedDatabases(p.id);
  const current = p.live ?? p.latest;
  const pill = healthPill[p.health];
  const isStatic = p.buildMode === "static";

  return (
    <Panel raised className="flex flex-wrap gap-6 p-6">
      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted">{p.live ? "Live at" : "Will be live at"}</span>
          <a href={publicUrl(p.primaryHost)} target="_blank" rel="noreferrer" className="text-2xl font-bold tracking-[-0.02em] break-all text-text hover:text-accent-text">
            {p.primaryHost}
          </a>
          <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <Pill tone={pill.tone}>{pill.label}</Pill>
            {p.live ? `serving #${p.live.number} since ${timeAgo(p.live.finishedAt)}` : "not serving yet"}
          </p>
        </div>
        <RouteChain
          domain={p.primaryHost}
          app={`${stackLabel(p)}${current ? ` · #${current.number}` : ""}`}
          data={dbs.length ? dbs.map((d) => d.name).join(", ") : undefined}
          addDataHref={isStatic ? undefined : `/projects/${p.slug}/databases`}
        />
      </div>
      <dl className="m-0 grid min-w-0 flex-[1_1_320px] grid-cols-2 content-start gap-x-6 gap-y-5">
        <Fact label="Current deploy">
          {current ? <Link href={`/projects/${p.slug}/deployments/${current.number}`} className="text-accent-text hover:text-accent-strong">#{current.number} · {timeAgo(current.createdAt)}</Link> : "—"}
        </Fact>
        <Fact label="Commit">
          <span className="font-mono text-xs">{current ? `${shortSha(current.commitSha)} ${current.commitMessage ?? ""}` : "—"}</span>
        </Fact>
        <Fact label="Repository">
          <a href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer" className="text-accent-text hover:text-accent-strong">{p.repo}</a>
        </Fact>
        <Fact label="Branch"><span className="font-mono text-xs">{p.branch}</span></Fact>
        <Fact label="Build">{p.buildMode === "dockerfile" ? "Dockerfile" : isStatic ? "Static site" : "Railpack"}{p.framework ? ` · ${p.framework}` : ""}</Fact>
        {isStatic ? (
          <Fact label="Output">
            <span className="font-mono text-xs">{p.buildCommand ?? "auto"} → {p.outputDir ?? "auto"}/</span>
          </Fact>
        ) : (
          <>
            <Fact label="Allocation">{vcpu(p.cpuLimit)} · {p.memoryMb} MB</Fact>
            <Fact label="Health check"><span className="font-mono text-xs">GET {p.healthPath} · port {p.port}</span></Fact>
          </>
        )}
        <Fact label="Linked database">
          {dbs.length ? dbs.map((d) => <Link key={d.name} href={`/databases?db=${encodeURIComponent(d.name)}`} className="mr-2 text-accent-text hover:text-accent-strong">{d.name}</Link>) : <span className="font-normal text-muted">none</span>}
        </Fact>
      </dl>
    </Panel>
  );
}

async function Resources({ params }: { params: Params }) {
  const p = await loadProject(params);
  // Static sites have no container to measure.
  if (!p.live?.containerName) return null;
  const { rows, restarts, now } = await appMetrics(p.id);
  const limit = p.memoryMb * 1024 * 1024;
  const latest = rows.at(-1);
  return (
    <section aria-labelledby="res-h" className="flex flex-col gap-4">
      <SectionHeader
        id="res-h"
        title="Resources"
        description={
          latest
            ? `Using ${bytes(latest.memBytes)} of ${bytes(limit)} and ${latest.cpuPct}% of one core right now · ${restarts === 0 ? "no crashes" : `${restarts} restart${restarts === 1 ? "" : "s"} after crashes`} in the last 24 hours.`
            : "Sampled every minute while the app runs."
        }
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LineChart title="CPU (% of one core)" unit="percent" now={now} points={rows.map((r) => ({ t: r.at.getTime(), v: r.cpuPct }))} />
        <LineChart
          title="Memory"
          unit="bytes"
          now={now}
          points={rows.map((r) => ({ t: r.at.getTime(), v: r.memBytes }))}
          reference={{ value: limit, label: `limit ${bytes(limit)}` }}
        />
      </div>
    </section>
  );
}

async function Domains({ params }: { params: Params }) {
  const p = await loadProject(params);
  const rows = await listDomains(p.id);
  return (
    <section aria-labelledby="domains-h" className="flex flex-col gap-4">
      <SectionHeader id="domains-h" title="Domains" action={<Link href={`/projects/${p.slug}/domains`} className="text-[13px] font-medium text-accent-text hover:text-accent-strong">Manage →</Link>} />
      <DomainList domains={rows.map((r) => r.domain)} defaultHost={defaultHost(p.slug, env().APPS_DOMAIN)} compact />
    </section>
  );
}

async function Recent({ params }: { params: Params }) {
  const p = await loadProject(params);
  const deployments = await listDeployments(p.id, 5);
  return (
    <section aria-labelledby="dep-h" className="flex flex-col gap-4">
      <SectionHeader id="dep-h" title="Recent deployments" action={<Link href={`/projects/${p.slug}/deployments`} className="text-[13px] font-medium text-accent-text hover:text-accent-strong">All deployments →</Link>} />
      <DeploymentList slug={p.slug} deployments={deployments} liveId={p.liveDeploymentId} />
    </section>
  );
}
