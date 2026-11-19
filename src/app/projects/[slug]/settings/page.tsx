import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { PageMain } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SIZES, sizeOf } from "@/lib/validation";
import { loadProject } from "@/server/load-project";
import { deleteProject, setStandby, updateSettings } from "./actions";

type Props = PageProps<"/projects/[slug]/settings">;

export default function SettingsPage({ params }: Props) {
  return (
    <PageMain>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Settings params={params} />
      </Suspense>
    </PageMain>
  );
}

async function Settings({ params }: { params: Props["params"] }) {
  const p = await loadProject(params);
  return (
    <>
      <SectionHeader title="Settings" description={<>Repository <span className="font-mono text-text">{p.repo}</span></>} />
      <Panel className="p-5">
        <ActionForm action={updateSettings.bind(null, p.slug)} resetOnSuccess={false}>
          
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Branch"><Input name="branch" mono defaultValue={p.branch} required /></Field>
                <Field label="Build">
                  <Select name="buildMode" defaultValue={p.buildMode}>
                    <option value="railpack">Railpack (auto-detect)</option>
                    <option value="dockerfile">Dockerfile in repo</option>
                    <option value="static">Static site</option>
                  </Select>
                </Field>
                <Field label="Port"><Input name="port" type="number" mono defaultValue={p.port} required /></Field>
                <Field label="Health check path"><Input name="healthPath" mono defaultValue={p.healthPath} required /></Field>
                <Field label="Size">
                  <Select name="size" defaultValue={sizeOf(p.cpuLimit, p.memoryMb)}>
                    {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                </Field>
              </div>
              <SubmitButton pendingLabel="Saving…" variant="primary" className="self-start">Save settings</SubmitButton>
            </>
        </ActionForm>
      </Panel>

      <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="m-0 text-[15px] font-semibold">{p.state === "standby" ? "On standby" : "Standby"}</h2>
          <p className="mt-1 mb-0 text-muted">{p.state === "standby" ? "The container is stopped. Start it to serve traffic again." : "Stop the container to free memory. Domains, env and images are kept."}</p>
        </div>
        <form action={setStandby.bind(null, p.slug, p.state !== "standby")}>
          <Button type="submit">{p.state === "standby" ? "Start app" : "Put on standby"}</Button>
        </form>
      </Panel>

      <Panel className="flex flex-col gap-3 border-err-border p-5">
        <div>
          <h2 className="m-0 text-[15px] font-semibold text-err">Delete project</h2>
          <p className="mt-1 mb-0 text-muted">Stops the app, removes its routes, images and env vars. Linked databases are kept.</p>
        </div>
        <ActionForm action={deleteProject.bind(null, p.slug)}>
          
            <div className="flex flex-wrap gap-2">
              <Input name="confirm" mono placeholder={p.name} aria-label={`Type ${p.name} to confirm`} autoComplete="off" className="w-64" />
              <SubmitButton pendingLabel="Deleting…" className="border-err-border text-err">Delete project</SubmitButton>
            </div>
        </ActionForm>
      </Panel>
    </>
  );
}
