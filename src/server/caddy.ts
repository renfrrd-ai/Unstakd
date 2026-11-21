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

export function baseConfig() {
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
  // Last route: any host with no app (typo, deleted project) gets a plain 404 instead of an empty 200.
  // Project routes are inserted before it (see setRoute).
  routes.push({ "@id": FALLBACK, handle: [plainText(404, "Nothing is deployed at this address.")], terminal: true });
  const server: Record<string, unknown> = {
    listen: https ? [":443", ":80"] : [":80"],
    routes,
  };
  // With HTTPS on, Caddy (2.10+) already serves subdomains from the managed *.<apps domain> cert.
  if (!https) server.automatic_https = { disable: true };
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

const FALLBACK = "fallback";

function plainText(status: number, body: string, headers: Record<string, string[]> = {}) {
  return { handler: "static_response", status_code: status, headers: { "Content-Type": ["text/plain; charset=utf-8"], ...headers }, body };
}

// Caddy returns its config with sorted keys, so compare canonical JSON.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]));
  return v;
}

// The parts of the config that come from env (not the per-project routes).
function baseParts(config: unknown) {
  const c = config as { apps?: { tls?: unknown; http?: { servers?: Record<string, { listen?: unknown; automatic_https?: unknown; routes?: { "@id"?: string }[] }> } } } | null;
  const server = c?.apps?.http?.servers?.[SERVER];
  return JSON.stringify(
    canonical({
      tls: c?.apps?.tls ?? null,
      listen: server?.listen ?? null,
      automaticHttps: server?.automatic_https ?? null,
      dashboard: server?.routes?.find((r) => r["@id"] === "dashboard") ?? null,
      fallback: server?.routes?.find((r) => r["@id"] === FALLBACK) ?? null,
    }),
  );
}

/**
 * Loads our base config if Caddy doesn't have the unstakd server yet (fresh start or reboot).
 * With `refresh`, also reloads it when the env-derived parts changed (domain, HTTPS, dashboard
 * host); that drops project routes, so callers must re-apply them. Returns true if it loaded.
 */
export async function ensureCaddy({ refresh = false } = {}) {
  const res = await api("GET", refresh ? "/config/" : `/config/apps/http/servers/${SERVER}`);
  const current = res.ok ? await res.json() : null;
  if (current && (!refresh || baseParts(current) === baseParts(baseConfig()))) return false;
  // Loading a config that changes the admin listener can drop this very connection, so confirm by re-reading.
  try {
    const load = await api("POST", "/load", baseConfig());
    if (!load.ok) throw new Error(`caddy load failed: ${load.status} ${await load.text()}`);
  } catch (e) {
    if ((e as Error).message.startsWith("caddy load failed")) throw e;
  }
  for (let i = 0; i < 20; i++) {
    const check = await api("GET", `/config/apps/http/servers/${SERVER}`).catch(() => null);
    if (check?.ok && (await check.json())) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("caddy did not accept the base config");
}

export const previewRouteId = (slug: string, pr: number) => `preview-${slug}-${pr}`;

// Where a route sends traffic: a container (host:port), a directory of static files, or a
// "this app is offline" page (standby).
export type Upstream = { dial: string } | { root: string } | { offline: string };

function serveHandlers(up: Upstream) {
  if ("dial" in up) return [{ handler: "reverse_proxy", upstreams: [{ dial: up.dial }] }];
  if ("offline" in up) return [plainText(503, up.offline, { "Retry-After": ["3600"], "Cache-Control": ["no-store"] })];
  // Pretty URLs (/about → about.html or about/index.html). Unknown paths get the site's own
  // 404.html with a 404 status (multi-page exports ship one); without it, /index.html (SPAs).
  const serveFile = (tryFiles: string[], uri: string, status?: number) => ({
    match: [{ file: { root: up.root, try_files: tryFiles } }],
    handle: [
      { handler: "rewrite", uri },
      { handler: "file_server", root: up.root, ...(status ? { status_code: status } : {}) },
    ],
    terminal: true,
  });
  return [
    { handler: "encode", encodings: { zstd: {}, gzip: {} } },
    {
      handler: "subroute",
      routes: [
        serveFile(["{http.request.uri.path}", "{http.request.uri.path}/index.html", "{http.request.uri.path}.html"], "{http.matchers.file.relative}"),
        serveFile(["/404.html"], "/404.html", 404),
        serveFile(["/index.html"], "/index.html"),
        { handle: [{ handler: "file_server", root: up.root }] },
      ],
    },
  ];
}

export async function setRoute(slug: string, hosts: string[], upstream: Upstream, redirect?: { from: string[]; to: string } | null, id = routeId(slug)) {
  await ensureCaddy();
  const serve = serveHandlers(upstream);
  const route = {
    "@id": id,
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
              { handle: serve },
            ],
          },
        ]
      : serve,
    terminal: true,
  };
  const replace = await api("PATCH", `/id/${id}`, route);
  if (replace.ok) return;
  // Insert at the front: the catch-all fallback must stay last.
  const add = await api("PUT", `/config/apps/http/servers/${SERVER}/routes/0`, route);
  if (!add.ok) throw new Error(`caddy route update failed: ${add.status} ${await add.text()}`);
}

export async function removeRoute(slug: string, id = routeId(slug)) {
  const res = await api("DELETE", `/id/${id}`);
  if (!res.ok && res.status !== 404 && !(await res.text()).includes("unknown object ID")) {
    throw new Error(`caddy route delete failed: ${res.status}`);
  }
}

export async function getRoute(slug: string): Promise<{ hosts: string[]; dial: string; root: string } | null> {
  const res = await api("GET", `/id/${routeId(slug)}`);
  if (!res.ok) return null;
  const r = await res.json();
  const text = JSON.stringify(r.handle ?? []);
  return { hosts: r.match?.[0]?.host ?? [], dial: /"dial":"([^"]+)"/.exec(text)?.[1] ?? "", root: /"root":"([^"]+)"/.exec(text)?.[1] ?? "" };
}
