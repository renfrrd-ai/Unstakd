import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { duration } from "@/lib/format";
import { hostStats } from "@/server/host-stats";
import { deployStats } from "@/server/queries";

export const metadata: Metadata = { title: "Server" };

export default function ServerPage() {
  return (
    <PageMain>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Stats />
      </Suspense>
    </PageMain>
  );
}

async function Stats() {
  const [host, deploys] = await Promise.all([hostStats(), deployStats()]);
  const fmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());
  return (
    <>
      <PageTitle title="Server" description={<><span className="font-mono text-text">{host.hostname}</span> · everything runs on this one machine.</>} />
      <section aria-label="Resources" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="CPU" value={host.cpu} unit="%" percent={host.cpu} />
        <StatCard label="Memory" value={fmt(host.memUsedGb)} unit={` / ${Math.round(host.memTotalGb)} GB`} percent={(100 * host.memUsedGb) / host.memTotalGb} />
        <StatCard label="Disk" value={Math.round(host.diskUsedGb)} unit={` / ${Math.round(host.diskTotalGb)} GB`} percent={(100 * host.diskUsedGb) / host.diskTotalGb} />
        <StatCard label="Deploys this week" value={deploys.count} footnote={deploys.medianMs ? `median ${duration(deploys.medianMs)} to live` : "no finished deploys yet"} />
      </section>
    </>
  );
}
