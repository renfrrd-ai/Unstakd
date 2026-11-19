import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain } from "@/components/layout/app-header";
import { ProjectList } from "@/components/projects/project-list";
import { toRow } from "@/components/projects/rows";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { listProjects } from "@/server/queries";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <PageMain>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 font-display text-[34px] font-bold tracking-[-0.02em]">Projects</h1>
        <ButtonLink href="/new" variant="primary">+ New project</ButtonLink>
      </div>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AllProjects />
      </Suspense>
    </PageMain>
  );
}

async function AllProjects() {
  const projects = await listProjects();
  if (projects.length === 0) return <EmptyState title="No projects yet">Create one from a GitHub repo to get started.</EmptyState>;
  return <ProjectList title="All projects" rows={projects.map(toRow)} />;
}
