import Link from "next/link";
import { AppHeader, PageMain } from "@/components/layout/app-header";
import { ButtonLink } from "@/components/ui/button";
import { List, ListRow, Mono, Panel, SectionHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { StatCard } from "@/components/ui/stat-card";

export default function OverviewPage() {
  return (
    <>
      <AppHeader />
      <PageMain>
        <Panel className="flex flex-wrap items-stretch justify-between gap-5 p-7">
          <div className="flex flex-col justify-between gap-4.5">
            <div>
              <p className="m-0 font-mono text-xs text-muted">good evening</p>
              <h1 className="mt-2 font-display text-[46px] leading-[1.05] font-bold tracking-[-0.03em]">
                5 apps up.
                <br />
                <span className="text-err">1 needs you.</span>
              </h1>
            </div>
            <ButtonLink href="/new" variant="primary" className="self-start">+ New project</ButtonLink>
          </div>
          <Link href="#" className="flex flex-[0_1_380px] flex-col gap-2 rounded-[10px] border border-err-border bg-err-bg px-5 py-4.5 text-text">
            <span className="font-mono text-xs font-bold text-err">✕ FAILED · clueline #22 · 2h ago</span>
            <span className="leading-normal">Health check timed out. <strong>#21 is still serving</strong>, so nothing is down.</span>
            <span className="font-mono text-xs text-soft">GET /api/health → no response in 30s</span>
            <span className="font-semibold text-err">Open logs →</span>
          </Link>
        </Panel>

        <section aria-label="Server" className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="CPU" value="41" unit="%" percent={41} />
          <StatCard label="Memory" value="3.2" unit=" / 8 GB" percent={40} />
          <StatCard label="Disk" value="38" unit=" / 160 GB" percent={24} />
          <StatCard label="Deploys this week" value="23" footnote="median 1m 06s to live" />
        </section>

        <section aria-labelledby="proj-h" className="flex flex-col gap-3.5">
          <SectionHeader id="proj-h" title="Projects" description="3 apps · 2 live · 1 building" />
          <List>
            <ListRow href="#">
              <span className="flex flex-col gap-1"><strong>twoday</strong><Mono className="text-accent-text">ourtwoday.com</Mono></span>
              <Mono className="text-xs text-muted">collections: drag to reorder · now</Mono>
              <Pill tone="warn">Building 01:12</Pill>
            </ListRow>
            <ListRow href="#">
              <span className="flex flex-col gap-1"><strong>clueline</strong><Mono className="text-accent-text">clueline.dev</Mono></span>
              <Mono className="text-xs text-muted">serving #21 · #22 failed 2h ago</Mono>
              <Pill tone="err">Needs attention</Pill>
            </ListRow>
            <ListRow href="#">
              <span className="flex flex-col gap-1"><strong>nn-visualizer</strong><Mono className="text-accent-text">nn.unstakd.com</Mono></span>
              <Mono className="text-xs text-muted">pooling step animation · 1w ago</Mono>
              <Pill tone="neutral">Standby</Pill>
            </ListRow>
          </List>
        </section>
      </PageMain>
    </>
  );
}
