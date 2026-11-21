import { describe, expect, it } from "vitest";
import { appId, buildMapGraph, COL_X, dataId, domainId, edgePath, type MapDatabase, type MapDomain, type MapProject } from "./map-graph";

const project = (slug: string, over: Partial<MapProject> = {}): MapProject => ({
  slug,
  name: slug,
  health: "live",
  stack: "Next.js 16",
  deployed: "2h ago",
  commit: "abc1234",
  isStatic: false,
  alloc: 1,
  cpu: 40,
  latestNumber: 3,
  ...over,
});
const domain = (hostname: string, p: string, over: Partial<MapDomain> = {}): MapDomain => ({ id: hostname, hostname, status: "active", isPrimary: false, project: p, ...over });
const database = (name: string, projects: string[]): MapDatabase => ({
  name,
  engine: "postgres",
  version: "17",
  status: "running",
  usage: "30 MB",
  backups: "Nightly",
  links: projects.map((p) => ({ project: p, envKey: "DATABASE_URL" })),
});

describe("buildMapGraph", () => {
  it("puts domains, apps and data in their columns and links them", () => {
    const { nodes, edges } = buildMapGraph([project("blog")], [domain("blog.example.com", "blog")], [database("blog-pg", ["blog"])]);
    expect(nodes.map((n) => [n.id, n.x])).toEqual([
      [domainId("blog.example.com"), COL_X.domain],
      [appId("blog"), COL_X.app],
      [dataId("blog-pg"), COL_X.data],
    ]);
    expect(edges).toEqual([
      { from: domainId("blog.example.com"), to: appId("blog"), dashed: false },
      { from: appId("blog"), to: dataId("blog-pg") },
    ]);
  });

  it("gives each project its own band, tall enough for its domains", () => {
    const { nodes } = buildMapGraph(
      [project("a"), project("b")],
      [domain("a.one.com", "a"), domain("a.two.com", "a"), domain("b.com", "b")],
      [],
    );
    const y = (id: string) => nodes.find((n) => n.id === id)!.y;
    expect(y(domainId("a.two.com")) - y(domainId("a.one.com"))).toBeGreaterThan(0);
    // The app is centred between its two domains, and b's band starts below both.
    expect(y(appId("a"))).toBe((y(domainId("a.one.com")) + y(domainId("a.two.com"))) / 2);
    expect(y(appId("b"))).toBeGreaterThan(y(domainId("a.two.com")));
  });

  it("places a shared database once and links every app to it", () => {
    const { nodes, edges } = buildMapGraph([project("a"), project("b")], [], [database("shared", ["a", "b"])]);
    expect(nodes.filter((n) => n.id === dataId("shared"))).toHaveLength(1);
    expect(edges.filter((e) => e.to === dataId("shared")).map((e) => e.from)).toEqual([appId("a"), appId("b")]);
  });

  it("keeps unlinked databases on the map", () => {
    const { nodes } = buildMapGraph([project("a")], [], [database("spare", [])]);
    expect(nodes.find((n) => n.id === dataId("spare"))?.info.at(-1)).toEqual(["Used by", "Nothing yet"]);
  });

  it("marks domains that don't point here as dashed", () => {
    const { nodes, edges } = buildMapGraph([project("a")], [domain("a.com", "a", { status: "misconfigured" })], []);
    expect(nodes[0]).toMatchObject({ dashed: true, tone: "err", status: "Points elsewhere" });
    expect(edges[0].dashed).toBe(true);
  });

  it("describes static sites without CPU", () => {
    const { nodes } = buildMapGraph([project("site", { isStatic: true, stack: "Static" })], [], []);
    expect(nodes[0].meta).toBe("Static · no container");
    expect(nodes[0].info[1]).toEqual(["CPU", "None, served by Caddy"]);
  });
});

describe("edgePath", () => {
  it("is a straight line between nodes on the same row", () => {
    expect(edgePath({ x: 0, y: 0 }, { x: 400, y: 0 })).toBe("M240,32 H400");
  });
  it("bends between rows and starts on the facing side", () => {
    const d = edgePath({ x: 400, y: 100 }, { x: 0, y: 0 });
    expect(d.startsWith("M400,132")).toBe(true);
    expect(d.endsWith("H240")).toBe(true);
  });
});
