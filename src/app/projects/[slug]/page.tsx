import Link from "next/link";
import { Suspense } from "react";
import { PageMain } from "@/components/layout/app-header";
import { DeploymentList } from "@/components/deployments/deployment-list";
import { DomainList } from "@/components/domains/domain-list";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { shortSha, timeAgo } from "@/lib/format";
import { healthPill } from "@/lib/status";
import { loadProject } from "@/server/load-project";
import { linkedDatabases, listDeployments, listDomains } from "@/server/queries";

type Params = PageProps<"/projects/[slug]">["params"];

export default function ProjectPage({ params }: PageProps<"/projects/[slug]">) {
  return (
    <PageMain className="gap-8">
      <Suspense fallback={<Skeleton className="h-56" />}>
        <Summary params={params} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Domains params={params} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <Recent params={params} />
      </Suspense>
    </PageMain>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="m-0 mt-1">{children}</dd>
    </div>
  );
}

async function Summary({ params }: { params: Params }) {
  const p = await loadProject(params);
  const dbs = await linkedDatabases(p.id);
  const current = p.live ?? p.latest;
  const pill = healthPill[p.health];
  const size = `${p.cpuLimit} CPU · ${p.memoryMb} MB`;

  return (
    <Panel className="flex flex-wrap gap-6 p-6">
      <div className="flex min-h-48 flex-[1_1_360px] flex-col justify-between gap-4 rounded-lg bg-panel-2 p-5">
        <div className="flex items-center gap-2 font-mono text-xs text-muted">
          <span className="size-2 rounded-full bg-err-border" /><span className="size-2 rounded-full bg-warn" /><span className="size-2 rounded-full bg-accent" />
          <span className="ml-2 truncate">https://{p.primaryHost}</span>
        </div>
        <div>
          <p className="m-0 font-display text-3xl font-bold tracking-[-0.02em] break-all">{p.primaryHost}</p>
          <p className="mt-2 mb-0 flex flex-wrap items-center gap-2 text-muted">
            <Pill tone={pill.tone}>{pill.label}</Pill>
            {p.live ? `serving #${p.live.number} since ${timeAgo(p.live.finishedAt)}` : "not serving yet"}
          </p>
        </div>
      </div>
      <dl className="m-0 grid flex-[1_1_360px] grid-cols-2 content-start gap-x-6 gap-y-5">
        <Fact label="Current deploy">
          {current ? <Link href={`/projects/${p.slug}/deployments/${current.number}`} className="font-semibold text-text hover:underline">#{current.number} · {timeAgo(current.createdAt)}</Link> : "—"}
        </Fact>
        <Fact label="Commit">
          <span className="font-mono text-[13px]">{current ? `${shortSha(current.commitSha)} ${current.commitMessage ?? ""}` : "—"}</span>
        </Fact>
        <Fact label="Repository">
          <a href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-accent-text hover:underline">{p.repo}</a>
        </Fact>
        <Fact label="Branch"><span className="font-mono text-[13px]">{p.branch}</span></Fact>
        <Fact label="Build">{p.buildMode === "dockerfile" ? "Dockerfile" : p.buildMode === "static" ? "Static site" : "Railpack"}{p.framework ? ` · ${p.framework}` : ""}</Fact>
        <Fact label="Resources">{size}</Fact>
        <Fact label="Health check"><span className="font-mono text-[13px]">GET {p.healthPath} · port {p.port}</span></Fact>
        <Fact label="Linked database">
          {dbs.length ? dbs.map((d) => <Link key={d.name} href="/databases" className="mr-2 text-accent-text hover:underline">{d.name}</Link>) : <span className="text-muted">none</span>}
        </Fact>
      </dl>
    </Panel>
  );
}

async function Domains({ params }: { params: Params }) {
  const p = await loadProject(params);
  const rows = await listDomains(p.id);
  return (
    <section aria-labelledby="domains-h" className="flex flex-col gap-3.5">
      <SectionHeader id="domains-h" title="Domains" action={<Link href={`/projects/${p.slug}/domains`} className="text-accent-text hover:underline">Manage domains →</Link>} />
      <DomainList domains={rows.map((r) => r.domain)} defaultHost={rows.find((r) => r.domain.hostname.startsWith(`${p.slug}.`))?.domain.hostname} />
    </section>
  );
}

async function Recent({ params }: { params: Params }) {
  const p = await loadProject(params);
  const deployments = await listDeployments(p.id, 3);
  return (
    <section aria-labelledby="dep-h" className="flex flex-col gap-3.5">
      <SectionHeader id="dep-h" title="Recent deployments" action={<Link href={`/projects/${p.slug}/deployments`} className="text-accent-text hover:underline">All deployments →</Link>} />
      <DeploymentList slug={p.slug} deployments={deployments} liveId={p.liveDeploymentId} />
    </section>
  );
}
