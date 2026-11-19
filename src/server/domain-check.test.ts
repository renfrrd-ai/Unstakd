import { describe, expect, it } from "vitest";
import { checkDns, type Resolver } from "./domain-check";

function fake(cnames: Record<string, string[]>, a: Record<string, string[]>): Resolver {
  return {
    resolveCname: async (h) => (cnames[h] ? cnames[h] : Promise.reject(new Error("ENODATA"))),
    resolve4: async (h) => (a[h] ? a[h] : Promise.reject(new Error("ENOTFOUND"))),
  };
}
const edge = { host: "edge.unstakd.com", ip: "203.0.113.7" };

describe("checkDns", () => {
  it("accepts a direct CNAME to the edge", async () => {
    expect(await checkDns("www.site.com", edge, fake({ "www.site.com": ["edge.unstakd.com."] }, {}))).toBe("ok");
  });
  it("follows CNAME chains", async () => {
    const r = fake({ "a.site.com": ["b.site.com"], "b.site.com": ["edge.unstakd.com"] }, {});
    expect(await checkDns("a.site.com", edge, r)).toBe("ok");
  });
  it("accepts an apex A record pointing at the server", async () => {
    expect(await checkDns("site.com", edge, fake({}, { "site.com": ["203.0.113.7"] }))).toBe("ok");
  });
  it("flags records that point elsewhere (e.g. a proxy)", async () => {
    expect(await checkDns("site.com", edge, fake({}, { "site.com": ["104.21.1.1"] }))).toBe("elsewhere");
  });
  it("reports missing records", async () => {
    expect(await checkDns("nothing.site.com", edge, fake({}, {}))).toBe("missing");
  });
  it("uses the edge host's addresses when no IP is configured", async () => {
    const r = fake({}, { "edge.unstakd.com": ["198.51.100.2"], "site.com": ["198.51.100.2"] });
    expect(await checkDns("site.com", { host: "edge.unstakd.com", ip: "" }, r)).toBe("ok");
  });
});
