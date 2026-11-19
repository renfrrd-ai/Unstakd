"use client";

import { useState, type ReactNode } from "react";
import { createProject } from "@/app/new/actions";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select, SuffixInput } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { SIZES } from "@/lib/validation";

import type { Detected } from "@/server/builder";

export function ConfigureForm({ repo, branch, detected, suggestedSlug, appsDomain, steps }: { repo: string; branch: string; detected: Detected; suggestedSlug: string; appsDomain: string; steps: ReactNode }) {
  const [slug, setSlug] = useState(suggestedSlug);
  const [port, setPort] = useState(String(detected.port ?? 3000));
  const [health, setHealth] = useState("/");
  const host = `${slug || "your-app"}.${appsDomain}`;
  const isStatic = detected.mode === "static";
  const builtWith = detected.mode === "dockerfile" ? "your Dockerfile" : isStatic ? (detected.static?.buildCommand ? <code className="font-mono text-[13px]">{detected.static.buildCommand}</code> : "no build step") : "Railpack";

  return (
    <ActionForm action={createProject} resetOnSuccess={false} className="gap-7">
      <input type="hidden" name="repo" value={repo} />
      <input type="hidden" name="buildMode" value={detected.mode} />
      <input type="hidden" name="framework" value={detected.framework ?? ""} />
      <div>
        {steps}
        <h1 className="mt-5 mb-0 font-display text-[34px] leading-tight font-bold tracking-[-0.03em] sm:text-[40px]">
          Configure <span className="text-accent-text">{slug || repo.split("/")[1]}</span>
        </h1>
        <p className="mt-2 mb-0 font-mono text-[13px] text-muted">github.com/{repo} · {branch}</p>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <Panel className="flex flex-wrap items-center gap-4 px-5 py-4.5">
            <div className="flex size-11 items-center justify-center rounded-[10px] bg-panel-2 font-mono font-bold">{detected.framework?.[0] ?? (detected.mode === "dockerfile" ? "D" : "?")}</div>
            <div className="flex-[1_1_200px]">
              <div className="font-semibold">
                {isStatic ? `Static site${detected.framework ? ` · ${detected.framework}` : ""}` : detected.framework ? `Detected ${detected.framework}` : detected.mode === "dockerfile" ? "Detected a Dockerfile" : "Couldn’t detect the stack"}
              </div>
              <div className="mt-0.5 text-[13px] text-muted">
                {detected.mode === "dockerfile"
                  ? "Your Dockerfile will be used to build it."
                  : isStatic
                    ? "Caddy serves the built files directly: no container, nothing to keep running."
                    : "Railpack will build it. Add a Dockerfile to override."}
              </div>
            </div>
          </Panel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Subdomain">
              <SuffixInput name="slug" required value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} suffix={`.${appsDomain}`} autoComplete="off" />
            </Field>
            <Field label="Branch"><Input name="branch" mono required defaultValue={branch} /></Field>
            {isStatic ? (
              <>
                <input type="hidden" name="port" value={port} />
                <input type="hidden" name="healthPath" value={health} />
                <Field label="Build command"><Input name="buildCommand" mono defaultValue={detected.static?.buildCommand ?? ""} placeholder="none" autoComplete="off" /></Field>
                <Field label="Output directory"><Input name="outputDir" mono defaultValue={detected.static?.outputDir ?? "dist"} autoComplete="off" /></Field>
              </>
            ) : (
              <>
                <Field label="Port"><Input name="port" type="number" mono required value={port} onChange={(e) => setPort(e.target.value)} /></Field>
                <Field label="Health check path"><Input name="healthPath" mono required value={health} onChange={(e) => setHealth(e.target.value)} /></Field>
              </>
            )}
            <Field label="Size" className="sm:col-span-2">
              <Select name="size" defaultValue="medium">
                {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
          </div>
          <Panel className="flex flex-col gap-3 p-5">
            <h2 className="m-0 text-[15px] font-semibold">Environment</h2>
            <textarea
              name="dotenv"
              rows={4}
              aria-label="Environment variables in .env format"
              placeholder={"Paste a .env file, e.g.\nNEXT_PUBLIC_SITE=https://example.com\nAPI_KEY=..."}
              className="rounded-lg border border-border-strong bg-bg p-3 font-mono text-[13px] text-text placeholder:text-dim"
            />
            <p className="m-0 text-[13px] text-muted">Stored encrypted as secrets. You can edit them later under Environment.</p>
          </Panel>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-panel px-5 py-4">
            <input type="checkbox" name="createDb" className="size-5 accent-[var(--accent)]" />
            <span>
              <span className="block font-semibold">Create a Postgres database for this app</span>
              <span className="mt-0.5 block text-[13px] text-muted">Injected as DATABASE_URL, backed up nightly</span>
            </span>
          </label>
        </div>
        <Panel className="flex flex-[1_1_300px] flex-col gap-4 p-6">
          <h2 className="m-0 font-display text-xl font-bold">What happens next</h2>
          <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 leading-snug text-soft marker:text-dim">
            <li>Build with {builtWith}{isStatic ? "" : ", about 1–2 minutes"}</li>
            <li>{isStatic ? "Publish the output and check it has an index.html" : `Start the container and wait for ${health || "/"} on port ${port}`}</li>
            <li>Go live at <span className="font-mono text-[13px] break-all">{host}</span></li>
            <li>Redeploy from the dashboard; every push to {branch} once the GitHub App is connected</li>
          </ol>
          <SubmitButton variant="primary" size="lg" pendingLabel="Starting deploy…">Deploy {slug || "app"}</SubmitButton>
        </Panel>
      </div>
    </ActionForm>
  );
}
