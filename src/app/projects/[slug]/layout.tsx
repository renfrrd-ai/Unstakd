import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProjectHeader } from "@/components/layout/project-header";
import { UserMenu } from "@/components/layout/user-menu";
import { Button, buttonClass } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { healthPill } from "@/lib/status";
import { getProject } from "@/server/queries";
import { redeploy } from "./actions";

export default function ProjectLayout({ children, params }: LayoutProps<"/projects/[slug]">) {
  return (
    <>
      <Suspense fallback={<div className="h-28 border-b border-border" />}>
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
      crumbs={[{ label: project.name }]}
      status={<Pill tone={pill.tone} className="font-sans">{pill.label}</Pill>}
      actions={
        <>
          {project.live && (
            <a href={`https://${project.primaryHost}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              Visit site
            </a>
          )}
          <form action={redeploy.bind(null, project.slug)}>
            <Button type="submit" variant="primary">Redeploy</Button>
          </form>
        </>
      }
      trailing={
        <Suspense>
          <UserMenu />
        </Suspense>
      }
    />
  );
}
