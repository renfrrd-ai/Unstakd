"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/lib/validation";
import { audit } from "@/server/audit";
import { notify } from "@/server/notify";
import { requireUser } from "@/server/session";
import { setSetting } from "@/server/settings";

const discord = z.string().trim().regex(/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/, "That isn't a Discord webhook URL");
const webhook = z.string().trim().url("Enter a full URL").refine((u) => /^https?:\/\//.test(u), "Use an http(s) URL");

export async function saveAlerts(_prev: FormState, data: FormData): Promise<FormState> {
  await requireUser();
  const d = String(data.get("discord") ?? "").trim();
  const w = String(data.get("webhook") ?? "").trim();
  if (d) {
    const ok = discord.safeParse(d);
    if (!ok.success) return { error: ok.error.issues[0].message };
    await setSetting("alerts.discordWebhook", ok.data);
  }
  if (w) {
    const ok = webhook.safeParse(w);
    if (!ok.success) return { error: ok.error.issues[0].message };
    await setSetting("alerts.webhook", ok.data);
  }
  if (!d && !w) return { error: "Paste a Discord or webhook URL" };
  await audit("alerts.updated", d && w ? "Discord and webhook" : d ? "Discord" : "webhook");
  refresh();
  return { ok: "Saved. Use “Send a test alert” to check it." };
}

export async function removeAlert(key: "alerts.discordWebhook" | "alerts.webhook") {
  await requireUser();
  await setSetting(key, null);
  refresh();
}

export async function sendTestAlert(): Promise<FormState> {
  await requireUser();
  const sent = await notify({ level: "info", title: "Test alert from Unstakd", body: "Failed deploys, failed backups and broken domains will show up here." });
  return sent.length ? { ok: `Sent to ${sent.join(" and ")}.` } : { error: "Nothing was sent. Save a target first, or check the URL." };
}
