import type { Metadata } from "next";
import { Suspense } from "react";
import { PageMain, PageTitle } from "@/components/layout/app-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { ActionForm, SubmitButton } from "@/components/forms/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { getSetting } from "@/server/settings";
import { removeAlert, saveAlerts, sendTestAlert } from "./actions";
import { duration } from "@/lib/format";
import { hostStats } from "@/server/host-stats";
import { deployStats } from "@/server/queries";

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
    </PageMain>
  );
}

async function Stats() {
  const [host, deploys] = await Promise.all([hostStats(), deployStats()]);
  const fmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());
  return (
    <>
      <PageTitle title="Server" description={<><span className="font-mono text-text">{host.hostname}</span> · everything runs on this one machine.</>} />
      <section aria-label="Resources" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="CPU" value={host.cpu} unit="%" percent={host.cpu} />
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
  const [discord, webhook] = await Promise.all([getSetting("alerts.discordWebhook"), getSetting("alerts.webhook")]);
  const targets = [
    { key: "alerts.discordWebhook" as const, label: "Discord", value: discord },
    { key: "alerts.webhook" as const, label: "Webhook", value: webhook },
  ];
  return (
    <section aria-labelledby="alerts-h" className="flex flex-col gap-3.5">
      <div>
        <h2 id="alerts-h" className="m-0 text-lg font-semibold">Alerts</h2>
        <p className="mt-1 mb-0 text-muted">Failed deploys (with the last 40 log lines), failed backups, databases that won&apos;t start, and domains that stop pointing here.</p>
      </div>
      <Panel className="flex flex-col gap-5 p-5">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {targets.map((t) => (
            <li key={t.key} className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <span className="w-20 font-semibold">{t.label}</span>
                {t.value ? <span className="font-mono text-[13px] text-soft">{mask(t.value)}</span> : <span className="text-muted">not set</span>}
              </span>
              {t.value && (
                <form action={removeAlert.bind(null, t.key)}>
                  <ConfirmButton message={`Stop sending alerts to ${t.label}?`} className="cursor-pointer text-[13px] text-err hover:underline">Remove</ConfirmButton>
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
