import { enableTunnel } from "@/app/(main)/databases/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import type { Database } from "@/db/schema";

export function TunnelPanel({ db, server, sshUser, user, database }: { db: Pick<Database, "id" | "engine" | "localPort" | "status">; server: string; sshUser: string; user?: string; database?: string }) {
  if (!db.localPort) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
        <p className="m-0 text-muted">This database was created before tunnel access existed. Enabling it restarts the container (data is kept).</p>
        <form action={enableTunnel.bind(null, db.id)}>
          <Button type="submit">Enable tunnel access</Button>
        </form>
      </div>
    );
  }
  const command = `ssh -N -L ${db.localPort}:127.0.0.1:${db.localPort} ${sshUser}@${server}`;
  const rows: [string, string][] = [
    ["SSH host", server],
    ["SSH user", sshUser],
    ["Host", "127.0.0.1"],
    ["Port", String(db.localPort)],
    ...(db.engine === "postgres" ? ([["User", user ?? "app"], ["Database", database ?? "app"]] as [string, string][]) : []),
  ];
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <p className="m-0 text-muted">
        The database listens on the server&apos;s loopback only, so it&apos;s never on the internet. Reach it through SSH, then point your tool at{" "}
        <span className="font-mono text-text">127.0.0.1:{db.localPort}</span>. Password: use Reveal above.
      </p>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">From a terminal (leave it running)</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="flex-[1_1_360px] overflow-x-auto rounded-lg border border-border bg-bg px-3.5 py-2.5 font-mono text-[13px] whitespace-nowrap">{command}</code>
          <CopyButton value={command} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">TablePlus / DBeaver: new connection “over SSH”</span>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="m-0 font-mono">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
