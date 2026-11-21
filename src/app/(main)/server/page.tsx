import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { getSetting } from "@/server/settings";
import { requireUser } from "@/server/session";
import { createToken, removeAlert, revokeToken, saveAlerts, sendTestAlert } from "./actions";
import { NewToken } from "@/components/server/new-token";
import { db, schema as s } from "@/db";
import { duration, timeAgo } from "@/lib/format";
import { hostStats } from "@/server/host-stats";
import { deployStats } from "@/server/queries";
import { appInfo, githubAppConfig } from "@/server/github-app";
import { Pill } from "@/components/ui/pill";

export const metadata: Metadata = { title: "Server" };

export default function ServerPage() {
  return (
    <PageMain>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Alerts />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-40" />}>
        <GitHubApp />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-48" />}>
        <ApiTokens />
      </Suspense>
    </PageMain>
  );
}

async function Stats() {
  await requireUser();
  const [host, deploys] = await Promise.all([hostStats(), deployStats()]);
  const fmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());
  return (
    <>
      <PageTitle title="Server" description={<><span className="font-medium text-text">{host.hostname}</span> · {host.cores} vCPU · everything runs on this one machine.</>} />
      <section aria-label="Resources" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <StatCard label="CPU" value={host.cpu} unit="%" percent={host.cpu} footnote={`of ${host.cores} vCPU`} />
        <StatCard label="Memory" value={fmt(host.memUsedGb)} unit={` / ${Math.round(host.memTotalGb)} GB`} percent={(100 * host.memUsedGb) / host.memTotalGb} />
        <StatCard label="Disk" value={Math.round(host.diskUsedGb)} unit={` / ${Math.round(host.diskTotalGb)} GB`} percent={(100 * host.diskUsedGb) / host.diskTotalGb} />
        <StatCard label="Deploys this week" value={deploys.count} footnote={deploys.medianMs ? `median ${duration(deploys.medianMs)} to live` : "no finished deploys yet"} />
      </section>
    </>
  );
}

function mask(url: string) {
  const u = new URL(url);
  return `${u.host}/…${url.slice(-6)}`;
}

async function Alerts() {
  await requireUser();
  const [discord, webhook] = await Promise.all([getSetting("alerts.discordWebhook"), getSetting("alerts.webhook")]);
  const targets = [
    { key: "alerts.discordWebhook" as const, label: "Discord", value: discord },
    { key: "alerts.webhook" as const, label: "Webhook", value: webhook },
  ];
  return (
    <section aria-labelledby="alerts-h" className="flex flex-col gap-4">
      <div>
        <h2 id="alerts-h" className="m-0 text-lg font-semibold">Alerts</h2>
        <p className="mt-1 mb-0 text-muted">Failed deploys (with the last 40 log lines), failed backups, databases that won&apos;t start, and domains that stop pointing here.</p>
      </div>
      <Panel className="flex flex-col gap-5 p-5.5">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {targets.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="w-20 font-semibold">{t.label}</span>
                {t.value ? <span className="font-mono text-xs text-soft">{mask(t.value)}</span> : <span className="text-muted">not set</span>}
              </span>
              {t.value && (
                <form action={removeAlert.bind(null, t.key)}>
                  <ConfirmButton message={`Stop sending alerts to ${t.label}?`} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-err hover:bg-err-bg">Remove</ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={saveAlerts}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Discord webhook URL"><Input name="discord" mono placeholder="https://discord.com/api/webhooks/…" autoComplete="off" /></Field>
            <Field label="Other webhook (JSON POST)"><Input name="webhook" mono placeholder="https://…" autoComplete="off" /></Field>
          </div>
          <SubmitButton variant="primary" pendingLabel="Saving…" className="self-start">Save</SubmitButton>
        </ActionForm>
        {(discord || webhook) && (
          <ActionForm action={sendTestAlert}>
            <SubmitButton pendingLabel="Sending…" className="self-start">Send a test alert</SubmitButton>
          </ActionForm>
        )}
      </Panel>
    </section>
  );
}

async function ApiTokens() {
  await requireUser();
  const tokens = await db().select().from(s.apiTokens).orderBy(s.apiTokens.createdAt);
  return (
    <section aria-labelledby="tokens-h" className="flex flex-col gap-4">
      <div>
        <h2 id="tokens-h" className="m-0 text-lg font-semibold">API tokens</h2>
        <p className="mt-1 mb-0 text-muted">
          For the <code className="font-mono text-xs text-soft">unstakd</code> CLI and scripts. A token can deploy, roll back and change env vars on every project.
        </p>
      </div>
      <Panel className="flex flex-col gap-5 p-5.5">
        {tokens.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{t.name}</span>
                  <span className="rounded-md bg-sunken px-2 py-0.5 font-mono text-xs text-soft">{t.prefix}…</span>
                  <span className="text-[13px] text-muted">{t.lastUsedAt ? `used ${timeAgo(t.lastUsedAt)}` : "never used"}</span>
                </span>
                <form action={revokeToken.bind(null, t.id)}>
                  <ConfirmButton message={`Revoke “${t.name}”? Anything using it stops working.`} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-err hover:bg-err-bg">Revoke</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-muted">No tokens yet.</p>
        )}
        <NewToken action={createToken} />
      </Panel>
    </section>
  );
}

async function GitHubApp() {
  await requireUser();
  const cfg = githubAppConfig();
  let info: Awaited<ReturnType<typeof appInfo>> | null = null;
  let error: string | null = null;
  if (cfg) info = await appInfo().catch((e: Error) => ((error = e.message), null));
  return (
    <section aria-labelledby="ghapp-h" className="flex flex-col gap-4">
      <div>
        <h2 id="ghapp-h" className="m-0 text-lg font-semibold">GitHub App</h2>
        <p className="mt-1 mb-0 text-muted">Clones private repos, lists your repos in New project, and sends pushes and pull requests here, so no repo needs its own webhook.</p>
      </div>
      <Panel className="flex flex-col gap-4 p-5.5">
        {!cfg ? (
          <div className="flex flex-col gap-2 text-muted">
            <span className="flex items-center gap-3"><Pill tone="neutral">Not set up</Pill></span>
            <p className="m-0">
              Create a GitHub App, save its private key on this server and set <code className="font-mono text-xs text-soft">GITHUB_APP_ID</code> and{" "}
              <code className="font-mono text-xs text-soft">GITHUB_APP_KEY_FILE</code> in <code className="font-mono text-xs text-soft">.env</code>. Steps: docs/LATER.md § 2.
            </p>
          </div>
        ) : error || !info ? (
          <div className="flex flex-col gap-2">
            <span><Pill tone="err">Can&apos;t reach GitHub</Pill></span>
            <p className="m-0 text-[13px] text-err">{error}. Check the App ID and that the key file is the App&apos;s current private key.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex flex-wrap items-center gap-3">
                <Pill tone="ok">Connected</Pill>
                <a href={info.html_url} className="font-medium text-accent-text hover:text-accent-strong">{info.slug}</a>
              </span>
              <a href={info.installUrl} className="text-[13px] font-medium text-accent-text hover:text-accent-strong">Install on another account ↗</a>
            </div>
            {info.installations.length === 0 ? (
              <p className="m-0 text-muted">Not installed anywhere yet.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {info.installations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                      <span className="font-semibold">{i.account}</span>
                      <span className="text-[13px] text-muted">{i.accountType === "Organization" ? "organization" : "personal"} · {i.selection === "all" ? "all repositories" : "selected repositories"}</span>
                    </span>
                    <a href={i.manageUrl} className="text-[13px] font-medium text-accent-text hover:text-accent-strong">Manage ↗</a>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Panel>
    </section>
  );
}
