import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConnectionString } from "@/components/databases/connection-string";
import { TunnelPanel } from "@/components/databases/tunnel-panel";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { PageMain, PageTitle } from "@/components/layout/page";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Input } from "@/components/ui/field";
import { Meter } from "@/components/ui/meter";
import { CardHeader, EmptyState, Panel } from "@/components/ui/panel";
import { Dot, Pill, type Tone } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Inactive, SoonButton } from "@/components/ui/soon";
import type { Database } from "@/db/schema";
import { cn } from "@/lib/cn";
import { decrypt } from "@/lib/crypto";
import { env } from "@/lib/env";
import { bytes, timeAgo } from "@/lib/format";
import { ENGINES, usageCapacityBytes } from "@/server/database-catalog";
import { connectionUrl, type DbCredentials } from "@/server/db-connection";
import { listBackups, listDatabases } from "@/server/queries";
import { backupNow, deleteDatabase, restoreBackup, retryProvision } from "./actions";

export const metadata: Metadata = { title: "Databases" };

const statusPill: Record<Database["status"], { tone: Tone; label: string }> = {
  running: { tone: "ok", label: "Healthy" },
  provisioning: { tone: "warn", label: "Provisioning" },
  stopped: { tone: "neutral", label: "Stopped" },
  failed: { tone: "err", label: "Failed" },
};

const engineName = (d: Pick<Database, "engine" | "version">) => `${d.engine === "postgres" ? "Postgres" : "Redis"} ${d.version}`;

export default function DatabasesPage({ searchParams }: PageProps<"/databases">) {
  return (
    <PageMain className="gap-6">
      <Suspense fallback={<><Skeleton className="h-16 border-0 bg-transparent" /><Skeleton className="h-96" /></>}>
        <Databases searchParams={searchParams} />
      </Suspense>
    </PageMain>
  );
}

type DbRow = Awaited<ReturnType<typeof listDatabases>>[number];

async function Databases({ searchParams }: { searchParams: PageProps<"/databases">["searchParams"] }) {
  const [dbs, params] = await Promise.all([listDatabases(), searchParams]);
  const pg = dbs.filter((d) => d.engine === "postgres").length;
  const redis = dbs.length - pg;
  const counts = [pg && `${pg} Postgres`, redis && `${redis} Redis`].filter(Boolean).join(" and ");
  const header = (
    <PageTitle
      title="Databases"
      description={`${counts ? `${counts} on this server. ` : ""}Backed up nightly to ${process.env.R2_BUCKET ? "Cloudflare R2" : "local disk (R2 not configured yet)"}, kept 7 days.`}
      actions={<ButtonLink href="/databases/new" variant="primary">New database</ButtonLink>}
    />
  );
  if (dbs.length === 0) {
    return (
      <>
        {header}
        <EmptyState title="No databases yet">
          <span>Create Postgres or Redis with one click; it gets a persistent volume and nightly backups.</span>
          <ButtonLink href="/databases/new" variant="primary">New database</ButtonLink>
        </EmptyState>
      </>
    );
  }
  const selected = dbs.find((d) => d.name === params.db) ?? dbs[0];

  return (
    <>
      {header}
      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Database list" className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
          {dbs.map((d) => <DatabaseCard key={d.id} db={d} selected={d.id === selected.id} />)}
        </section>
        <Detail db={selected} />
      </div>
    </>
  );
}

function DatabaseCard({ db, selected }: { db: DbRow; selected: boolean }) {
  const pill = statusPill[db.status];
  const cap = usageCapacityBytes(db.engine);
  const pct = db.usageBytes != null ? (100 * db.usageBytes) / cap : null;
  return (
    <Link
      href={`/databases?db=${encodeURIComponent(db.name)}`}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-2xl bg-panel px-4.5 py-4 text-text",
        selected ? "border-[1.5px] border-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_12%,transparent)]" : "border border-border shadow-soft hover:border-border-strong",
      )}
    >
      <span className="flex w-full items-center gap-3">
        <DbTile engine={db.engine} />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[15px] font-semibold">{db.name}</span>
          <span className="truncate text-xs text-muted">
            {engineName(db)} · {db.links.length ? `used by ${db.links.map((l) => l.project.name).join(", ")}` : "not linked"}
          </span>
        </span>
        <Pill tone={pill.tone} dot={false}>{pill.label}</Pill>
      </span>
      <span className="flex w-full flex-col gap-1.25">
        <span className="flex justify-between text-xs text-muted">
          <span>{ENGINES[db.engine].usageLabel}</span>
          <span>{db.usageBytes != null ? <><span className="font-semibold text-text">{bytes(db.usageBytes)}</span> of {bytes(cap)}</> : "measuring…"}</span>
        </span>
        <Meter percent={pct} size="sm" label={`${ENGINES[db.engine].usageLabel} used`} />
      </span>
    </Link>
  );
}

function DbTile({ engine, large }: { engine: Database["engine"]; large?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center rounded-[10px] bg-tint-data-strong font-semibold text-soft", large ? "size-11 text-[13px]" : "size-9 text-[11px]")}>
      {engine === "postgres" ? "PG" : "RD"}
    </span>
  );
}

// Only the non-secret parts (user and database name) for the tunnel instructions.
function publicCreds(db: DbRow) {
  const c = JSON.parse(decrypt(db.credentialsEnc)) as DbCredentials;
  return { user: c.user, database: c.database };
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl bg-sunken px-3.5 py-3">
      <span className="text-xs text-muted">{k}</span>
      <span className="text-lg font-semibold">{v}</span>
    </div>
  );
}

async function Detail({ db }: { db: DbRow }) {
  const backups = await listBackups(db.id);
  const link = db.links[0];
  const pill = statusPill[db.status];
  const last = db.lastBackup;

  return (
    <section aria-labelledby="detail-h" className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
      <Panel raised className="flex flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <DbTile engine={db.engine} large />
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted">
                {engineName(db)} ·{" "}
                {link ? <>linked to <Link href={`/projects/${link.project.slug}`} className="font-medium text-accent-text hover:text-accent-strong">{link.project.name}</Link></> : "not linked"}
              </span>
              <h2 id="detail-h" className="m-0 text-2xl font-bold tracking-[-0.02em] break-all">{db.name}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SoonButton>Open console</SoonButton>
            {db.status === "failed" && (
              <form action={retryProvision.bind(null, db.id)}>
                <Button type="submit" variant="primary">Retry setup</Button>
              </form>
            )}
            {db.backupsEnabled && db.status === "running" && (
              <form action={backupNow.bind(null, db.id)}>
                <Button type="submit" variant="primary">Back up now</Button>
              </form>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
          <Stat k="Status" v={<span className="flex items-center gap-2"><Dot tone={pill.tone} className="size-2" />{pill.label}</span>} />
          <Stat k={ENGINES[db.engine].usageLabel} v={db.usageBytes != null ? bytes(db.usageBytes) : "—"} />
          <Stat k="Last backup" v={!db.backupsEnabled ? "Off" : last?.status === "done" ? timeAgo(last.createdAt) : last?.status === "failed" ? "Failed" : "None yet"} />
          <Stat k="Created" v={timeAgo(db.createdAt)} />
        </div>
        <ConnectionString
          databaseId={db.id}
          masked={connectionUrl(db, { mask: true })}
          label="Connection string"
          note={link ? `Injected into ${link.project.name} as ${link.link.envKey}.` : "Link it to a project to inject it as an environment variable."}
        />
      </Panel>

      <div className="flex flex-wrap items-stretch gap-5">
        <Inactive label="Table stats are coming soon" className="flex min-w-0 flex-[1_1_300px]">
          <Panel className="flex h-full flex-col gap-3 p-5.5">
            <CardHeader as="h3" title={db.engine === "postgres" ? "Largest tables" : "Largest keys"} aside="by rows" />
            <p className="m-0 text-[13px] text-muted">Row counts and sizes per table will show here.</p>
          </Panel>
        </Inactive>
        <Panel className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 p-5.5">
          <CardHeader as="h3" title="Backups" aside={db.backupsEnabled ? "Nightly, kept 7 days" : "Snapshot only"} />
          {backups.length === 0 ? (
            <p className="m-0 text-[13px] text-muted">No backups yet.</p>
          ) : (
            <ol className="m-0 flex list-none flex-col p-0 [&>li+li]:border-t [&>li+li]:border-border">
              {backups.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2.5">
                  <Dot tone={b.status === "done" ? "ok" : b.status === "failed" ? "err" : "warn"} className="size-2" />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="font-medium">{b.createdAt.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span className="truncate text-xs text-muted">
                      {b.status === "done" ? `${bytes(b.sizeBytes)} · ${b.storage === "r2" ? "R2" : "local disk"}` : b.status === "failed" ? (b.error ?? "failed") : "running…"}
                    </span>
                  </span>
                  {b.status === "done" && (
                    <form action={restoreBackup.bind(null, b.id)}>
                      <ConfirmButton
                        message={`Restore ${db.name} from this backup? Current data will be replaced.`}
                        className="cursor-pointer rounded-lg bg-panel-2 px-2.5 py-1.5 text-xs font-medium hover:brightness-95"
                      >
                        Restore
                      </ConfirmButton>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel className="p-5.5">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col">
              <span className="text-base font-semibold">Connect from your laptop</span>
              <span className="text-[13px] text-muted">SSH tunnel for TablePlus, DBeaver or psql</span>
            </span>
            <span className="text-muted transition group-open:rotate-180" aria-hidden="true">▾</span>
          </summary>
          <div className="mt-4">
            <TunnelPanel db={db} server={env().EDGE_IP || env().EDGE_HOST} sshUser={process.env.SSH_USER ?? "root"} {...publicCreds(db)} />
          </div>
        </details>
      </Panel>

      <Panel className="border-err-border p-5.5">
        <details>
          <summary className="cursor-pointer text-base font-semibold text-err">Delete {db.name}</summary>
          <ActionForm action={deleteDatabase.bind(null, db.id)} className="mt-3">
            <p className="m-0 text-muted">Stops the container and unlinks it from projects.</p>
            <Checkbox name="keepVolume" defaultChecked label="Keep the data volume (recommended)" />
            <div className="flex flex-wrap gap-2">
              <Input name="confirm" mono placeholder={db.name} aria-label={`Type ${db.name} to confirm`} autoComplete="off" className="w-64" />
              <SubmitButton pendingLabel="Deleting…" variant="danger">Delete database</SubmitButton>
            </div>
          </ActionForm>
        </details>
      </Panel>
    </section>
  );
}
