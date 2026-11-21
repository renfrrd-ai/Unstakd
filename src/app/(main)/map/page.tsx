import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/page";
import { MapClient } from "@/components/map/map-client";
import { toView } from "@/components/projects/view";
import { Skeleton } from "@/components/ui/skeleton";
import { bytes, timeAgo } from "@/lib/format";
import { buildMapGraph } from "@/lib/map-graph";
import { vcpu } from "@/lib/usage";
import { hostStats } from "@/server/host-stats";
import { latestMetrics, listDatabases, listDomains, listProjects } from "@/server/queries";

export const metadata: Metadata = { title: "Map" };

type Props = PageProps<"/map">;

export default function MapPage({ searchParams }: Props) {
  return (
    <PageMain className="gap-6">
      <PageTitle title="Map" description="How domains reach your apps and which databases they use. Drag a block to move it, drag the background to pan, scroll to zoom." />
      <Suspense fallback={<Skeleton className="h-[660px]" />}>
        <Graph searchParams={searchParams} />
      </Suspense>
    </PageMain>
  );
}

async function Graph({ searchParams }: { searchParams: Props["searchParams"] }) {
  const [projects, metrics, domains, dbs, host, params] = await Promise.all([listProjects(), latestMetrics(), listDomains(), listDatabases(), hostStats(), searchParams]);

  const { nodes, edges } = buildMapGraph(
    projects.map((p) => {
      const v = toView(p, metrics.get(p.id), null);
      return {
        slug: v.slug,
        name: v.name,
        health: v.health,
        stack: v.stack,
        deployed: v.deployed,
        commit: v.commit,
        isStatic: v.isStatic,
        alloc: v.alloc,
        cpu: v.cpu,
        latestNumber: v.latestNumber,
      };
    }),
    domains.map(({ domain: d, project }) => ({ id: d.id, hostname: d.hostname, status: d.status, isPrimary: d.isPrimary, project: project.slug })),
    dbs.map((d) => ({
      name: d.name,
      engine: d.engine,
      version: d.version,
      status: d.status,
      usage: d.usageBytes != null ? bytes(d.usageBytes) : "measuring…",
      backups: !d.backupsEnabled ? "Off" : d.lastBackup?.status === "done" ? `Nightly, last ${timeAgo(d.lastBackup.createdAt)}` : "Nightly, none yet",
      links: d.links.map((l) => ({ project: l.project.slug, envKey: l.link.envKey })),
    })),
  );

  const focus = typeof params.focus === "string" ? params.focus : undefined;
  return <MapClient nodes={nodes} edges={edges} focus={focus} zoneLabel={`${host.hostname} · ${vcpu(host.cores)} · ${host.cpu}% CPU used`} />;
}
