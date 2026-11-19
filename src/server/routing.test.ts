import { describe, expect, it } from "vitest";
import { splitHosts } from "./routing";

describe("splitHosts", () => {
  it("redirects www to an apex primary", () => {
    expect(splitHosts("site.com", ["app.unstakd.com", "site.com", "www.site.com"])).toEqual({
      serve: ["site.com", "app.unstakd.com"],
      redirect: { from: ["www.site.com"], to: "site.com" },
    });
  });
  it("redirects the apex to a www primary", () => {
    expect(splitHosts("www.site.com", ["site.com"]).redirect).toEqual({ from: ["site.com"], to: "www.site.com" });
  });
  it("serves unrelated hosts directly and needs no redirect alone", () => {
    expect(splitHosts("app.unstakd.com", ["app.unstakd.com", "other.dev"])).toEqual({ serve: ["app.unstakd.com", "other.dev"], redirect: null });
  });
});
