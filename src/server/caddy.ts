// Caddy is configured entirely through its admin API: one HTTP server, one route per project.
const SERVER = "unstakd";

const adminUrl = () => process.env.CADDY_ADMIN_URL ?? "";
export const caddyEnabled = () => !!adminUrl();
const routeId = (slug: string) => `app-${slug}`;

async function api(method: string, path: string, body?: unknown) {
  const origin = new URL(adminUrl()).origin;
  const send = () =>
    fetch(`${adminUrl()}${path}`, {
      method,
      // The admin API rejects writes without an Origin it recognises.
      headers: body === undefined ? { Origin: origin } : { Origin: origin, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    return await send();
  } catch (e) {
    // Caddy drops admin connections when its config changes; a reused keep-alive socket then fails once.
    if ((e as { cause?: { code?: string } }).cause?.code !== "UND_ERR_SOCKET") throw e;
    return send();
  }
}

function baseConfig() {
  const https = process.env.CADDY_HTTPS === "true";
  const apps = process.env.APPS_DOMAIN ?? "localhost";
  const wildcard = https && !!process.env.CF_API_TOKEN;
  const routes: unknown[] = [];
  if (process.env.DASHBOARD_HOST) {
    routes.push({
      "@id": "dashboard",
      match: [{ host: [process.env.DASHBOARD_HOST] }],
      handle: [{ handler: "reverse_proxy", upstreams: [{ dial: process.env.DASHBOARD_UPSTREAM ?? "app:3000" }] }],
      terminal: true,
    });
  }
  const server: Record<string, unknown> = {
    listen: https ? [":443", ":80"] : [":80"],
    routes,
  };
  if (!https) server.automatic_https = { disable: true };
  else if (wildcard) server.automatic_https = { prefer_wildcard: true };
  const config: Record<string, unknown> = {
    // Keep our own access: Caddy checks the Host header against `origins` on non-loopback listeners.
    admin: {
      listen: process.env.CADDY_ADMIN_LISTEN ?? "0.0.0.0:2019",
      origins: (process.env.CADDY_ADMIN_ORIGINS ?? new URL(adminUrl()).host).split(",").map((o) => o.trim()),
    },
    apps: { http: { servers: { [SERVER]: server } } },
  };
  if (https) {
    const policies: unknown[] = [];
    // One wildcard cert (DNS challenge via Cloudflare) covers every <app>.<apps domain>.
    if (wildcard) {
      policies.push({
        subjects: [`*.${apps}`],
        issuers: [{ module: "acme", challenges: { dns: { provider: { name: "cloudflare", api_token: "{env.CF_API_TOKEN}" } } } }],
      });
    }
    // Custom domains get certificates on first visit, but only if the ask endpoint approves them.
    if (process.env.CADDY_ASK_URL) policies.push({ on_demand: true });
    (config.apps as Record<string, unknown>).tls = {
      ...(wildcard ? { certificates: { automate: [`*.${apps}`] } } : {}),
      automation: {
        ...(process.env.CADDY_ASK_URL ? { on_demand: { permission: { module: "http", endpoint: process.env.CADDY_ASK_URL } } } : {}),
        policies,
      },
    };
  }
  return config;
}

// Loads our base config if Caddy doesn't have the unstakd server yet (fresh start or reboot).
export async function ensureCaddy() {
  const res = await api("GET", `/config/apps/http/servers/${SERVER}`);
  const current = res.ok ? await res.json() : null;
  if (current) return;
  // Loading a config that changes the admin listener can drop this very connection, so confirm by re-reading.
  try {
    const load = await api("POST", "/load", baseConfig());
    if (!load.ok) throw new Error(`caddy load failed: ${load.status} ${await load.text()}`);
  } catch (e) {
    if ((e as Error).message.startsWith("caddy load failed")) throw e;
  }
  for (let i = 0; i < 20; i++) {
    const check = await api("GET", `/config/apps/http/servers/${SERVER}`).catch(() => null);
    if (check?.ok && (await check.json())) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("caddy did not accept the base config");
}

export async function setRoute(slug: string, hosts: string[], dial: string, redirect?: { from: string[]; to: string } | null) {
  await ensureCaddy();
  const proxy = { handler: "reverse_proxy", upstreams: [{ dial }] };
  const route = {
    "@id": routeId(slug),
    match: [{ host: [...hosts, ...(redirect?.from ?? [])] }],
    handle: redirect
      ? [
          {
            handler: "subroute",
            routes: [
              {
                match: [{ host: redirect.from }],
                handle: [{ handler: "static_response", status_code: 308, headers: { Location: [`{http.request.scheme}://${redirect.to}{http.request.uri}`] } }],
              },
              { handle: [proxy] },
            ],
          },
        ]
      : [proxy],
    terminal: true,
  };
  const replace = await api("PATCH", `/id/${routeId(slug)}`, route);
  if (replace.ok) return;
  const add = await api("POST", `/config/apps/http/servers/${SERVER}/routes`, route);
  if (!add.ok) throw new Error(`caddy route update failed: ${add.status} ${await add.text()}`);
}

export async function removeRoute(slug: string) {
  const res = await api("DELETE", `/id/${routeId(slug)}`);
  if (!res.ok && res.status !== 404 && !(await res.text()).includes("unknown object ID")) {
    throw new Error(`caddy route delete failed: ${res.status}`);
  }
}

export async function getRoute(slug: string): Promise<{ hosts: string[]; dial: string } | null> {
  const res = await api("GET", `/id/${routeId(slug)}`);
  if (!res.ok) return null;
  const r = await res.json();
  return { hosts: r.match?.[0]?.host ?? [], dial: r.handle?.[0]?.upstreams?.[0]?.dial ?? "" };
}
