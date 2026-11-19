import { getSetting } from "./settings";

export type Alert = {
  title: string;
  body: string;
  level: "error" | "warning" | "info";
  url?: string;
  logTail?: string[];
};

const COLORS = { error: 0xff7a7a, warning: 0xf5b83d, info: 0x3ddc84 };

async function post(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
}

// Sends to every configured target. Never throws: an alert failing must not fail the job that raised it.
export async function notify(alert: Alert): Promise<string[]> {
  const sent: string[] = [];
  const [discord, webhook] = await Promise.all([getSetting("alerts.discordWebhook"), getSetting("alerts.webhook")]);
  if (discord) {
    const tail = alert.logTail?.length ? `\n\`\`\`\n${alert.logTail.join("\n").slice(-1800)}\n\`\`\`` : "";
    try {
      await post(discord, {
        username: "Unstakd",
        embeds: [{ title: alert.title.slice(0, 250), description: (alert.body + tail).slice(0, 4000), color: COLORS[alert.level], url: alert.url }],
      });
      sent.push("Discord");
    } catch (e) {
      console.error(`[notify] discord failed: ${(e as Error).message}`);
    }
  }
  if (webhook) {
    try {
      await post(webhook, { source: "unstakd", ...alert, at: new Date().toISOString() });
      sent.push("webhook");
    } catch (e) {
      console.error(`[notify] webhook failed: ${(e as Error).message}`);
    }
  }
  return sent;
}
