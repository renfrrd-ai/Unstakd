// Builds the Map: domains → apps → databases, laid out in three columns with one band per project.
// Pure, so the layout is testable and the page only has to feed it rows.

export type MapKind = "domain" | "app" | "data";
export type MapTone = "ok" | "warn" | "err" | "neutral";

export type MapNode = {
  id: string;
  kind: MapKind;
  name: string;
  meta: string;
  tone: MapTone;
  status: string;
  /** Not served by this server's containers (e.g. a domain that points elsewhere). Drawn dashed. */
  dashed?: boolean;
  info: [string, string][];
  /** Main place to manage this block in the dashboard. */
  href: string;
  /** Project the block belongs to, for actions (apps) and grouping. */
  project?: string;
  /** Apps: the newest deploy's number, for "View build" / "View failure". */
  deploy?: number;
  x: number;
  y: number;
};

export type MapEdge = { from: string; to: string; dashed?: boolean };

export type MapProject = {
  slug: string;
  name: string;
  health: "live" | "building" | "attention" | "standby" | "new";
  stack: string;
  deployed: string;
  commit: string;
  isStatic: boolean;
  alloc: number;
  cpu: number | null;
  latestNumber: number | null;
};

export type MapDomain = {
  id: string;
  hostname: string;
  status: "pending" | "verified" | "active" | "misconfigured";
  isPrimary: boolean;
  project: string;
};

export type MapDatabase = {
  name: string;
  engine: "postgres" | "redis";
  version: string;
  status: "provisioning" | "running" | "stopped" | "failed";
  usage: string;
  backups: string;
  links: { project: string; envKey: string }[];
};

export const NODE_W = 240;
export const NODE_H = 64;
export const COL_X: Record<MapKind, number> = { domain: 40, app: 390, data: 740 };
const ROW = 88;
const BAND_GAP = 28;
const TOP = 70;

const appStatus: Record<MapProject["health"], [MapTone, string]> = {
  live: ["ok", "Live"],
  building: ["warn", "Building"],
  attention: ["err", "Failed"],
  standby: ["neutral", "Standby"],
  new: ["neutral", "Not deployed"],
};

const domainStatus: Record<MapDomain["status"], [MapTone, string, string]> = {
  active: ["ok", "Connected", "SSL valid"],
  verified: ["warn", "Issuing", "Issuing certificate"],
  pending: ["warn", "Waiting", "Waiting for DNS"],
  misconfigured: ["err", "Points elsewhere", "DNS points elsewhere"],
};

const dbStatus: Record<MapDatabase["status"], [MapTone, string]> = {
  running: ["ok", "Healthy"],
  provisioning: ["warn", "Provisioning"],
  stopped: ["neutral", "Stopped"],
  failed: ["err", "Failed"],
};

const engineLabel = (d: Pick<MapDatabase, "engine" | "version">) => `${d.engine === "postgres" ? "Postgres" : "Redis"} ${d.version}`;
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n)}%`);

export const domainId = (hostname: string) => `d:${hostname}`;
export const appId = (slug: string) => `a:${slug}`;
export const dataId = (name: string) => `b:${name}`;

export function buildMapGraph(projects: MapProject[], domains: MapDomain[], databases: MapDatabase[]): { nodes: MapNode[]; edges: MapEdge[] } {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const placedDb = new Set<string>();
  let y = TOP;

  // A database linked to several apps sits in the band of the first one; the others get an edge to it.
  const dbsFor = (slug: string) => databases.filter((d) => d.links.some((l) => l.project === slug));

  for (const p of projects) {
    const own = domains.filter((d) => d.project === p.slug).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.hostname.localeCompare(b.hostname));
    const dbs = dbsFor(p.slug);
    const fresh = dbs.filter((d) => !placedDb.has(d.name));
    const rows = Math.max(1, own.length, fresh.length);
    const bandTop = y;
    const centre = (count: number, i: number) => bandTop + ((rows - count) * ROW) / 2 + i * ROW;

    own.forEach((d, i) => {
      const [tone, status, meta] = domainStatus[d.status];
      nodes.push({
        id: domainId(d.hostname),
        kind: "domain",
        name: d.hostname,
        meta: d.isPrimary ? `${meta} · primary` : meta,
        tone,
        status,
        dashed: d.status === "misconfigured",
        info: [
          ["DNS", status],
          ["SSL", d.status === "active" ? "Automatic, valid" : "After DNS resolves"],
          ["Points to", p.name],
        ],
        href: `/domains?d=${encodeURIComponent(d.hostname)}`,
        project: p.slug,
        x: COL_X.domain,
        y: centre(own.length, i),
      });
      edges.push({ from: domainId(d.hostname), to: appId(p.slug), dashed: d.status !== "active" });
    });

    const [tone, status] = appStatus[p.health];
    nodes.push({
      id: appId(p.slug),
      kind: "app",
      name: p.name,
      meta: p.isStatic ? `${p.stack} · no container` : `${p.stack} · CPU ${pct(p.cpu)}`,
      tone,
      status,
      info: [
        ["Runtime", p.stack],
        ["CPU", p.isStatic ? "None, served by Caddy" : `${pct(p.cpu)} of ${p.alloc} vCPU`],
        [p.health === "building" ? "Build" : "Last deploy", p.health === "building" && p.latestNumber != null ? `#${p.latestNumber}, in progress` : p.deployed],
        ["Commit", p.commit],
      ],
      href: `/projects/${p.slug}`,
      project: p.slug,
      deploy: p.latestNumber ?? undefined,
      x: COL_X.app,
      y: centre(1, 0),
    });

    fresh.forEach((d, i) => {
      placedDb.add(d.name);
      nodes.push(dataNode(d, COL_X.data, centre(fresh.length, i)));
    });
    for (const d of dbs) edges.push({ from: appId(p.slug), to: dataId(d.name) });

    y += rows * ROW + BAND_GAP;
  }

  // Databases nobody uses yet go at the bottom of the data column.
  for (const d of databases.filter((x) => !placedDb.has(x.name))) {
    nodes.push(dataNode(d, COL_X.data, y));
    y += ROW;
  }

  return { nodes, edges };
}

function dataNode(d: MapDatabase, x: number, y: number): MapNode {
  const [tone, status] = dbStatus[d.status];
  return {
    id: dataId(d.name),
    kind: "data",
    name: d.name,
    meta: `${engineLabel(d)} · ${d.usage}`,
    tone,
    status,
    info: [
      ["Engine", engineLabel(d)],
      ["Size", d.usage],
      ["Backups", d.backups],
      ["Used by", d.links.length ? d.links.map((l) => `${l.project} (${l.envKey})`).join(", ") : "Nothing yet"],
    ],
    href: `/databases?db=${encodeURIComponent(d.name)}`,
    x,
    y,
  };
}

// Orthogonal connector between two nodes, from the facing sides, with rounded corners.
export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, r = 10): string {
  const leftToRight = a.x + NODE_W / 2 <= b.x + NODE_W / 2;
  const x1 = leftToRight ? a.x + NODE_W : a.x;
  const x2 = leftToRight ? b.x : b.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return `M${x1},${y1} H${x2}`;
  const rr = Math.min(r, Math.abs(dy) / 2, Math.abs(mx - x1));
  const sx = Math.sign(x2 - x1) || 1;
  const sy = Math.sign(dy);
  return [
    `M${x1},${y1}`,
    `H${mx - sx * rr}`,
    `Q${mx},${y1} ${mx},${y1 + sy * rr}`,
    `V${y2 - sy * rr}`,
    `Q${mx},${y2} ${mx + sx * rr},${y2}`,
    `H${x2}`,
  ].join(" ");
}

export function bounds(nodes: Pick<MapNode, "x" | "y">[]) {
  if (nodes.length === 0) return { x: 0, y: 0, w: NODE_W, h: NODE_H };
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) + NODE_W - x, h: Math.max(...ys) + NODE_H - y };
}
