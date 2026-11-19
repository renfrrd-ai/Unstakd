import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { PageMain } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/field";
import { EmptyState, Panel, SectionHeader } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { loadProject } from "@/server/load-project";
import { linkedDatabases, listEnvVars } from "@/server/queries";
import { redeploy } from "../actions";
import { deleteEnvVar, importDotEnv, setEnvVar } from "./actions";

type Props = PageProps<"/projects/[slug]/environment">;

export default function EnvironmentPage({ params }: Props) {
  return (
    <PageMain>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Env params={params} />
      </Suspense>
    </PageMain>
  );
}

async function Env({ params }: { params: Props["params"] }) {
  const project = await loadProject(params);
  const [vars, dbs] = await Promise.all([listEnvVars(project.id), linkedDatabases(project.id)]);

  return (
    <>
      <SectionHeader
        title="Environment"
        description="Encrypted at rest. Secret values are never shown again; changes apply on the next deploy."
        action={
          <form action={redeploy.bind(null, project.slug)}>
            <Button type="submit">Redeploy to apply</Button>
          </form>
        }
      />

      {vars.length === 0 && dbs.length === 0 ? (
        <EmptyState title="No variables yet">Add one below or paste a .env file.</EmptyState>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-xl border border-border bg-panel p-0 [&>li+li]:border-t [&>li+li]:border-border">
          {vars.map((v) => (
            <li key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]">
              <span className="truncate font-mono text-[13px] font-semibold">{v.key}</span>
              <span className="col-span-2 row-start-2 truncate font-mono text-[13px] text-soft sm:col-span-1 sm:row-start-auto">
                {v.secret ? <span className="text-dim">••••••••••••</span> : v.value || <span className="text-dim">(empty)</span>}
              </span>
              <span className="flex items-center gap-3">
                {v.secret && <Pill tone="neutral">secret</Pill>}
                <form action={deleteEnvVar.bind(null, project.slug, v.key)}>
                  <ConfirmButton message={`Remove ${v.key}?`} className="cursor-pointer text-[13px] text-err hover:underline">Remove</ConfirmButton>
                </form>
              </span>
            </li>
          ))}
          {dbs.map((d) => (
            <li key={d.envKey} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)_auto]">
              <span className="truncate font-mono text-[13px] font-semibold">{d.envKey}</span>
              <span className="col-span-2 row-start-2 text-[13px] text-muted sm:col-span-1 sm:row-start-auto">injected from database <span className="text-accent-text">{d.name}</span></span>
              <Pill tone="ok">linked</Pill>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="m-0 mb-3 text-[15px] font-semibold">Add or update a variable</h2>
          <ActionForm action={setEnvVar.bind(null, project.slug)}>
            
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Key"><Input name="key" mono required placeholder="API_KEY" autoComplete="off" /></Field>
                  <Field label="Value"><Input name="value" mono placeholder="value" autoComplete="off" /></Field>
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="secret" defaultChecked className="size-4 accent-[var(--accent)]" /> Secret (hide the value after saving)
                </label>
                <SubmitButton pendingLabel="Saving…" variant="primary" className="self-start">Save variable</SubmitButton>
              </>
          </ActionForm>
        </Panel>
        <Panel className="p-5">
          <h2 className="m-0 mb-3 text-[15px] font-semibold">Paste a .env file</h2>
          <ActionForm action={importDotEnv.bind(null, project.slug)}>
            
              <>
                <textarea
                  name="dotenv"
                  rows={5}
                  aria-label=".env contents"
                  placeholder={"DATABASE_URL=...\nNEXT_PUBLIC_SITE=https://..."}
                  className="rounded-lg border border-border-strong bg-bg p-3 font-mono text-[13px] text-text placeholder:text-dim"
                />
                <SubmitButton pendingLabel="Importing…" className="self-start">Import as secrets</SubmitButton>
              </>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
