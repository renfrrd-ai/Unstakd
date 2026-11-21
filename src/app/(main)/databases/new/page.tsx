import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";
import { NewDatabaseForm } from "@/components/databases/new-database-form";
import { ENGINES } from "@/server/database-catalog";
import { listProjects } from "@/server/queries";

export const metadata: Metadata = { title: "New database" };

export default function NewDatabasePage({ searchParams }: PageProps<"/databases/new">) {
  return (
    <PageMain>
      <PageTitle title="New database" description="Runs on your server's private network with a persistent volume. Never exposed to the internet." />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </PageMain>
  );
}

async function Form({ searchParams }: { searchParams: PageProps<"/databases/new">["searchParams"] }) {
  const [projects, params] = await Promise.all([listProjects(), searchParams]);
  const project = typeof params.project === "string" ? params.project : "";
  return (
    <NewDatabaseForm
      engines={Object.fromEntries(Object.entries(ENGINES).map(([k, v]) => [k, { label: v.label, versions: [...v.versions], envKey: v.envKey }]))}
      projects={projects.map((p) => ({ slug: p.slug, name: p.name }))}
      defaultProject={project}
    />
  );
}
