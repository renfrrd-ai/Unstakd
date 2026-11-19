import Link from "next/link";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/app-header";
import { ProjectList } from "@/components/projects/project-list";
import { toRow } from "@/components/projects/rows";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/format";
import { listProjects } from "@/server/queries";

export default function ProjectsPage() {
  return (
    <PageMain>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Projects />
      </Suspense>
    </PageMain>
  );
}

async function Projects() {
  const projects = await listProjects();

  if (projects.length === 0) {
    return (
      <>
        <PageTitle title="Projects" />
        <Panel className="flex flex-col items-start gap-4 p-7">
          <div>
            <p className="m-0 text-lg font-semibold">Deploy your first app</p>
            <p className="mt-1 mb-0 text-muted">Pick a GitHub repo and Unstakd builds it, gives it HTTPS, and redeploys on every push.</p>
          </div>
          <ButtonLink href="/new" variant="primary">New project</ButtonLink>
        </Panel>
      </>
    );
  }

  const failing = projects.filter((p) => p.health === "attention");
  return (
    <>
      {failing.map((p) => (
        <Link
          key={p.id}
          href={`/projects/${p.slug}/deployments/${p.latest!.number}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-err-border bg-err-bg px-5 py-3.5 text-text"
        >
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-xs font-bold text-err">✕ {p.name} #{p.latest!.number} failed · {timeAgo(p.latest!.finishedAt ?? p.latest!.createdAt)}</span>
            <span>{p.live ? <><strong>#{p.live.number} is still serving</strong>, so nothing is down.</> : "Nothing was live before this deploy."}</span>
          </span>
          <span className="font-semibold text-err">Open logs →</span>
        </Link>
      ))}
      <ProjectList as="h1" title="Projects" rows={projects.map(toRow)} />
    </>
  );
}
