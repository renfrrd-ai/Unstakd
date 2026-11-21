import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ProjectMain } from "@/components/layout/page";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/field";
import { EmptyState, Panel, SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { loadProject } from "@/server/load-project";
import { listDatabases } from "@/server/queries";
import { redeploy } from "../actions";
import { linkDatabase, unlinkDatabase } from "./actions";

type Props = PageProps<"/projects/[slug]/databases">;

export default function ProjectDatabasesPage({ params }: Props) {
  return (
    <ProjectMain>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Linked params={params} />
      </Suspense>
    </ProjectMain>
  );
}

async function Linked({ params }: { params: Props["params"] }) {
  const project = await loadProject(params);
  const all = await listDatabases();
  const mine = all.flatMap((d) => d.links.filter((l) => l.link.projectId === project.id).map((l) => ({ db: d, link: l.link })));
  const available = all.filter((d) => !d.links.some((l) => l.link.projectId === project.id));

  return (
    <>
      <SectionHeader
        title="Databases"
        description="Linked databases are injected as environment variables on the next deploy."
        action={<form action={redeploy.bind(null, project.slug)}><Button type="submit">Redeploy to apply</Button></form>}
      />
      {mine.length === 0 ? (
        <EmptyState title="No linked databases">Link one below or create a new one.</EmptyState>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-[18px] border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
          {mine.map(({ db, link }) => (
            <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="flex items-center gap-3">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-tint-data-strong text-[11px] font-semibold text-soft">{db.engine === "postgres" ? "PG" : "RD"}</span>
                <span className="flex flex-col gap-0.5">
                <Link href={`/databases?db=${encodeURIComponent(db.name)}`} className="font-semibold text-text hover:text-accent-text">{db.name}</Link>
                <span className="text-[13px] text-muted">{db.engine === "postgres" ? "PostgreSQL" : "Redis"} {db.version} · as <span className="font-mono text-xs text-text">{link.envKey}</span></span>
                </span>
              </span>
              <form action={unlinkDatabase.bind(null, project.slug, link.id)}>
                <ConfirmButton message={`Unlink ${db.name}? ${link.envKey} will be removed on the next deploy. The data is kept.`} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-err hover:bg-err-bg">Unlink</ConfirmButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      <Panel className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 text-base font-semibold">Link a database</h2>
          <ButtonLink href={`/databases/new?project=${project.slug}`} size="sm">Create a new one</ButtonLink>
        </div>
        {available.length === 0 ? (
          <p className="m-0 text-muted">Every database is already linked here.</p>
        ) : (
          <ActionForm action={linkDatabase.bind(null, project.slug)}>
            
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="Database">
                  <Select name="databaseId" required>
                    {available.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.engine})</option>)}
                  </Select>
                </Field>
                <Field label="Variable name"><Input name="envKey" mono required defaultValue={available[0].engine === "redis" ? "REDIS_URL" : "DATABASE_URL"} /></Field>
                <SubmitButton pendingLabel="Linking…" variant="primary">Link</SubmitButton>
              </div>
          </ActionForm>
        )}
      </Panel>
    </>
  );
}
