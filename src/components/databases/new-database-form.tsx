"use client";

import { useState } from "react";
import { createDatabase } from "@/app/(main)/databases/actions";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

type Engines = Record<string, { label: string; versions: string[]; envKey: string }>;

export function NewDatabaseForm({ engines, projects, defaultProject }: { engines: Engines; projects: { slug: string; name: string }[]; defaultProject: string }) {
  const [engine, setEngine] = useState("postgres");
  const e = engines[engine];
  return (
    <Panel raised className="max-w-2xl p-6">
      <ActionForm action={createDatabase} resetOnSuccess={false}>
        
          <>
            <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
              <legend className="mb-2 text-xs font-medium text-muted">Engine</legend>
              {Object.entries(engines).map(([key, v]) => (
                <label
                  key={key}
                  className={cn(
                    "flex flex-1 cursor-pointer items-start gap-3 rounded-2xl bg-panel p-4 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                    engine === key ? "border-[1.5px] border-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border border-border-strong",
                  )}
                >
                  <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-tint-data-strong text-[11px] font-semibold text-soft">{key === "postgres" ? "PG" : "RD"}</span>
                  <span className="flex flex-col gap-0.5">
                  <input type="radio" name="engine" value={key} checked={engine === key} onChange={() => setEngine(key)} className="sr-only" />
                  <span className="font-semibold">{v.label}</span>
                  <span className="text-xs text-muted">Injected as <span className="font-mono">{v.envKey}</span></span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name"><Input name="name" mono required placeholder={engine === "postgres" ? "myapp-pg" : "myapp-redis"} autoComplete="off" /></Field>
              <Field label="Version">
                <Select name="version" key={engine} defaultValue={e.versions[0]}>
                  {e.versions.map((v) => <option key={v} value={v}>{e.label} {v}</option>)}
                </Select>
              </Field>
              <Field label="Link to project (optional)" className="sm:col-span-2">
                <Select name="project" defaultValue={defaultProject}>
                  <option value="">Don&apos;t link now</option>
                  {projects.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
                </Select>
              </Field>
            </div>
            <Checkbox name="backups" defaultChecked={engine === "postgres"} key={engine} label="Nightly backups" hint="To R2, kept 7 days" />
            <SubmitButton pendingLabel="Creating…" variant="primary" size="lg" className="self-start">Create database</SubmitButton>
          </>
      </ActionForm>
    </Panel>
  );
}
