import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { LiveUpdates } from "@/components/layout/live-updates";
import { ProjectHeader } from "@/components/layout/project-header";
import { UserMenu } from "@/components/layout/user-menu";
import { Swap } from "@/components/motion/motion";
import { Button, buttonClass } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { publicUrl } from "@/lib/domains";
import { healthPill } from "@/lib/status";
import { getProject } from "@/server/queries";
import { redeploy } from "./actions";

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[slug]">) {
  return (
    <>
      <AppHeader>
        <Suspense fallback={<span className="size-9 rounded-full bg-panel-2" />}>
          <UserMenu />
        </Suspense>
      </AppHeader>
      <LiveUpdates />
      <Suspense fallback={<div className="mx-auto h-44 w-full max-w-320" />}>
        <Header params={params} />
      </Suspense>
      {children}
    </>
  );
}

async function Header({ params }: { params: LayoutProps<"/projects/[slug]">["params"] }) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();
  const pill = healthPill[project.health];

  return (
    <ProjectHeader
      slug={project.slug}
      name={project.name}
      status={<Swap k={pill.label}><Pill tone={pill.tone}>{pill.label}</Pill></Swap>}
      meta={
        <>
          <a href={`https://github.com/${project.repo}`} target="_blank" rel="noreferrer" className="hover:text-text">{project.repo}</a>
          <span className="px-1.5 text-dim">·</span>
          <span className="font-mono text-xs">{project.branch}</span>
        </>
      }
      actions={
        <>
          {project.live && (
            <a href={publicUrl(project.primaryHost)} target="_blank" rel="noreferrer" className={buttonClass("outline")}>
              Visit site ↗
            </a>
          )}
          <form action={redeploy.bind(null, project.slug)}>
            <Button type="submit" variant="primary">Redeploy</Button>
          </form>
        </>
      }
    />
  );
}
