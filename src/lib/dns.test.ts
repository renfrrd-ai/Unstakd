import { describe, expect, it } from "vitest";
import { normalizeHostname, requiredRecord } from "./dns";

describe("dns", () => {
  it("normalizes and validates hostnames", () => {
    expect(normalizeHostname(" HTTPS://Photos.Example.com/path ")).toBe("photos.example.com");
    expect(normalizeHostname("example.com.")).toBe("example.com");
    expect(normalizeHostname("bad_host.com")).toBeNull();
    expect(normalizeHostname("localhost")).toBeNull();
    expect(normalizeHostname("-a.com")).toBeNull();
  });

  it("picks CNAME for subdomains and A for apex", () => {
    expect(requiredRecord("www.mysite.com", "edge.unstakd.com", "1.2.3.4")).toEqual({ type: "CNAME", name: "www", value: "edge.unstakd.com" });
    expect(requiredRecord("a.b.mysite.com", "edge.unstakd.com", "")).toEqual({ type: "CNAME", name: "a.b", value: "edge.unstakd.com" });
    expect(requiredRecord("mysite.com", "edge.unstakd.com", "1.2.3.4")).toEqual({ type: "A", name: "@", value: "1.2.3.4" });
  });
});
