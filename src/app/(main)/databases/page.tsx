import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import { ConnectionString } from "@/components/databases/connection-string";
import { PageMain, PageTitle } from "@/components/layout/app-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { EmptyState, Mono, Panel } from "@/components/ui/panel";
import { Pill, type Tone } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import type { Database } from "@/db/schema";
import { cn } from "@/lib/cn";
import { bytes, timeAgo } from "@/lib/format";
import { connectionUrl } from "@/server/db-connection";
import { listBackups, listDatabases } from "@/server/queries";
import { backupNow, restoreBackup } from "./actions";

export const metadata: Metadata = { title: "Databases" };

const statusPill: Record<Database["status"], { tone: Tone; label: string }> = {
  running: { tone: "ok", label: "Running" },
  provisioning: { tone: "warn", label: "Provisioning" },
  stopped: { tone: "neutral", label: "Stopped" },
  failed: { tone: "err", label: "Failed" },
};

const engineName = (d: Pick<Database, "engine" | "version">) => `${d.engine === "postgres" ? "PostgreSQL" : "Redis"} ${d.version}`;

export default function DatabasesPage({ searchParams }: PageProps<"/databases">) {
  return (
    <PageMain>
      <PageTitle title="Databases" description="Private to your server. Backed up nightly to Cloudflare R2, kept 7 days." />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Databases searchParams={searchParams} />
      </Suspense>
    </PageMain>
  );
}

type DbRow = Awaited<ReturnType<typeof listDatabases>>[number];

async function Databases({ searchParams }: { searchParams: PageProps<"/databases">["searchParams"] }) {
  const [dbs, params] = await Promise.all([listDatabases(), searchParams]);
  if (dbs.length === 0) {
    return (
      <EmptyState title="No databases yet">
        <p className="mt-0">Create Postgres or Redis with one click; it gets a persistent volume and nightly backups.</p>
        <ButtonLink href="/databases/new" variant="primary">New database</ButtonLink>
      </EmptyState>
    );
  }
  const selected = dbs.find((d) => d.name === params.db) ?? dbs[0];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dbs.map((d) => (
          <DatabaseCard key={d.id} db={d} selected={d.id === selected.id} />
        ))}
      </div>
      <Detail db={selected} />
    </>
  );
}

function DatabaseCard({ db, selected }: { db: DbRow; selected: boolean }) {
  const pill = statusPill[db.status];
  return (
    <Link
      href={`/databases?db=${encodeURIComponent(db.name)}`}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-panel p-5 text-text hover:border-border-strong",
        selected ? "border-accent" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="m-0 text-base font-semibold">{db.name}</h2>
          <p className="mt-1 mb-0 text-[13px] text-muted">{engineName(db)}</p>
        </div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      <p className="m-0 text-[13px]">
        {db.links.length ? (
          <>
            Linked to{" "}
            {db.links.map((l, i) => (
              <Fragment key={l.link.id}>
                {i > 0 && ", "}
                <span className="text-accent-text">{l.project.name}</span>
              </Fragment>
            ))}
          </>
        ) : (
          <span className="text-muted">Not linked to a project</span>
        )}
      </p>
      <p className="m-0 text-[13px] text-muted">
        {!db.backupsEnabled
          ? "Snapshot only, no nightly backup"
          : db.lastBackup?.status === "done"
            ? `Last backup ${timeAgo(db.lastBackup.createdAt)} · ${bytes(db.lastBackup.sizeBytes)}`
            : db.lastBackup?.status === "failed"
              ? "Last backup failed"
              : "No backups yet"}
      </p>
    </Link>
  );
}

async function Detail({ db }: { db: DbRow }) {
  const backups = await listBackups(db.id);
  const link = db.links[0];
  const label = link ? `Connection string (injected into ${link.project.name} as ${link.link.envKey})` : "Connection string";

  return (
    <Panel className="flex flex-col gap-5 p-6">
      <section aria-labelledby="detail-h" className="contents">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="detail-h" className="m-0 text-lg font-semibold">{db.name}</h2>
          {db.backupsEnabled && (
            <form action={backupNow.bind(null, db.id)}>
              <Button type="submit">Back up now</Button>
            </form>
          )}
        </div>
        <ConnectionString databaseId={db.id} masked={connectionUrl(db, { mask: true })} label={label} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="pb-2 text-left font-semibold">Backups</caption>
            <thead>
              <tr className="text-left text-[13px] text-muted">
                <th className="py-2.5 font-medium">Taken</th>
                <th className="py-2.5 font-medium">Size</th>
                <th className="py-2.5 font-medium">Stored at</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 && (
                <tr className="border-t border-border">
                  <td colSpan={4} className="py-3 text-muted">No backups yet.</td>
                </tr>
              )}
              {backups.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="py-3">{b.createdAt.toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{b.status === "done" ? bytes(b.sizeBytes) : <Pill tone={b.status === "failed" ? "err" : "warn"}>{b.status}</Pill>}</td>
                  <td><Mono className="text-muted">{b.objectKey ? `r2://…/${b.objectKey.split("/").slice(-2).join("/")}` : "—"}</Mono></td>
                  <td className="text-right">
                    {b.status === "done" && (
                      <form action={restoreBackup.bind(null, b.id)}>
                        <ConfirmButton message={`Restore ${db.name} from this backup? Current data will be replaced.`} className="cursor-pointer text-accent-text hover:underline">Restore</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Panel>
  );
}
