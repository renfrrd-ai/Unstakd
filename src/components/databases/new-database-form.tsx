"use client";

import { useState } from "react";
import { createDatabase } from "@/app/(main)/databases/actions";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

type Engines = Record<string, { label: string; versions: string[]; envKey: string }>;

export function NewDatabaseForm({ engines, projects, defaultProject }: { engines: Engines; projects: { slug: string; name: string }[]; defaultProject: string }) {
  const [engine, setEngine] = useState("postgres");
  const e = engines[engine];
  return (
    <Panel className="max-w-2xl p-6">
      <ActionForm action={createDatabase} resetOnSuccess={false}>
        
          <>
            <fieldset className="m-0 flex gap-3 border-0 p-0">
              <legend className="mb-2 text-[13px] text-muted">Engine</legend>
              {Object.entries(engines).map(([key, v]) => (
                <label
                  key={key}
                  className={cn(
                    "flex flex-1 cursor-pointer flex-col gap-1 rounded-lg border p-4",
                    engine === key ? "border-accent bg-ok-bg" : "border-border-strong bg-panel",
                  )}
                >
                  <input type="radio" name="engine" value={key} checked={engine === key} onChange={() => setEngine(key)} className="sr-only" />
                  <span className="font-semibold">{v.label}</span>
                  <span className="text-[13px] text-muted">Injected as <span className="font-mono">{v.envKey}</span></span>
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
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" name="backups" defaultChecked={engine === "postgres"} key={engine} className="size-4 accent-[var(--accent)]" />
              Nightly backups to R2, kept 7 days
            </label>
            <SubmitButton pendingLabel="Creating…" variant="primary" size="lg" className="self-start">Create database</SubmitButton>
          </>
      </ActionForm>
    </Panel>
  );
}
