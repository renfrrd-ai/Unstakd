import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ProjectMain } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { SIZES, sizeOf } from "@/lib/validation";
import { loadProject } from "@/server/load-project";
import { deleteProject, setPreviews, setStandby, updateSettings } from "./actions";
import { previewHost } from "@/lib/domains";
import { env } from "@/lib/env";

type Props = PageProps<"/projects/[slug]/settings">;

export default function SettingsPage({ params }: Props) {
  return (
    <ProjectMain>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Settings params={params} />
      </Suspense>
    </ProjectMain>
  );
}

async function Settings({ params }: { params: Props["params"] }) {
  const p = await loadProject(params);
  return (
    <>
      <SectionHeader title="Settings" description={<>Repository <span className="font-medium text-text">{p.repo}</span></>} />
      <Panel className="flex flex-col gap-3 p-5.5">
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
              <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-border p-0 pt-4">
                <legend className="float-left mb-1 text-[13px] text-muted">
                  Monorepos. The root directory is the build context and where the stack is detected; leave both blank to build from the repo root with its <span className="font-mono">Dockerfile</span>.
                  A Dockerfile that copies the lockfile or shared packages needs the repo root: leave the root directory blank and set the path, e.g. <span className="font-mono">api/Dockerfile</span>.
                </legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Root directory"><Input name="rootDir" mono defaultValue={p.rootDir ?? ""} placeholder="/ (repo root)" autoComplete="off" /></Field>
                  <Field label="Dockerfile path (inside the root directory)"><Input name="dockerfilePath" mono defaultValue={p.dockerfilePath ?? ""} placeholder="Dockerfile" autoComplete="off" /></Field>
                </div>
              </fieldset>
              <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-border p-0 pt-4">
                <legend className="float-left mb-1 text-[13px] text-muted">
                  Static sites only. Leave blank to detect from <span className="font-mono">package.json</span>; port and health path aren&apos;t used.
                </legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Build command"><Input name="buildCommand" mono defaultValue={p.buildCommand ?? ""} placeholder="npm run build" autoComplete="off" /></Field>
                  <Field label="Output directory"><Input name="outputDir" mono defaultValue={p.outputDir ?? ""} placeholder="dist" autoComplete="off" /></Field>
                </div>
              </fieldset>
              <SubmitButton pendingLabel="Saving…" variant="primary" className="self-start">Save settings</SubmitButton>
            </>
        </ActionForm>
      </Panel>

      <Panel className="flex flex-wrap items-center justify-between gap-4 p-5.5">
        <div className="max-w-2xl">
          <h2 className="m-0 text-base font-semibold">Preview deploys {p.previewsEnabled ? "are on" : ""}</h2>
          <p className="mt-1 mb-0 text-muted">
            Every pull request into <span className="font-mono text-xs text-text">{p.branch}</span> gets its own copy at{" "}
            <span className="font-mono text-xs text-text">{previewHost(p.slug, 12, env().APPS_DOMAIN).replace("pr-12-", "pr-<n>-")}</span>, removed when the PR closes. Needs the repo webhook to send
            &ldquo;Pull requests&rdquo; events too. Previews share this project&apos;s environment and databases.
          </p>
        </div>
        <form action={setPreviews.bind(null, p.slug, !p.previewsEnabled)}>
          <Button type="submit" variant={p.previewsEnabled ? "secondary" : "primary"}>{p.previewsEnabled ? "Turn off" : "Turn on"}</Button>
        </form>
      </Panel>

      <Panel className="flex flex-wrap items-center justify-between gap-4 p-5.5">
        <div>
          <h2 className="m-0 text-base font-semibold">{p.state === "standby" ? "On standby" : "Standby"}</h2>
          <p className="mt-1 mb-0 text-muted">
            {p.buildMode === "static"
              ? p.state === "standby"
                ? "The site is offline. Start it to serve it again."
                : "Take the site offline. Domains, env and published files are kept."
              : p.state === "standby"
                ? "The container is stopped. Start it to serve traffic again."
                : "Stop the container to free memory. Domains, env and images are kept."}
          </p>
        </div>
        <form action={setStandby.bind(null, p.slug, p.state !== "standby")}>
          <Button type="submit">{p.state === "standby" ? (p.buildMode === "static" ? "Bring online" : "Start app") : "Put on standby"}</Button>
        </form>
      </Panel>

      <Panel className="flex flex-col gap-3 border-err-border p-5.5">
        <div>
          <h2 className="m-0 text-base font-semibold text-err">Delete project</h2>
          <p className="mt-1 mb-0 text-muted">Stops the app, removes its routes, images and env vars. Linked databases are kept.</p>
        </div>
        <ActionForm action={deleteProject.bind(null, p.slug)}>
          
            <div className="flex flex-wrap gap-2">
              <Input name="confirm" mono placeholder={p.name} aria-label={`Type ${p.name} to confirm`} autoComplete="off" className="w-64" />
              <SubmitButton pendingLabel="Deleting…" variant="danger">Delete project</SubmitButton>
            </div>
        </ActionForm>
      </Panel>
    </>
  );
}
