import { afterEach, describe, expect, it } from "vitest";
import { baseConfig } from "./caddy";

type Route = { "@id"?: string; match?: unknown; handle: { handler: string; status_code?: number }[] };
const routes = () => (baseConfig() as { apps: { http: { servers: { unstakd: { routes: Route[] } } } } }).apps.http.servers.unstakd.routes;

describe("baseConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("ends with a catch-all 404 so unknown hosts don't get an empty 200", () => {
    process.env.CADDY_ADMIN_URL = "http://127.0.0.1:2019";
    const last = routes().at(-1)!;
    expect(last["@id"]).toBe("fallback");
    expect(last.match).toBeUndefined();
    expect(last.handle[0]).toMatchObject({ handler: "static_response", status_code: 404 });
  });

  it("keeps the dashboard route ahead of the fallback", () => {
    process.env.CADDY_ADMIN_URL = "http://127.0.0.1:2019";
    process.env.DASHBOARD_HOST = "dash.example.com";
    expect(routes().map((r) => r["@id"])).toEqual(["dashboard", "fallback"]);
  });
});
