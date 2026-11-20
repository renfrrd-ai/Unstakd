import { describe, expect, it } from "vitest";
import { customDomainError } from "./domains";

describe("customDomainError", () => {
  it("lets one project take the apps domain's apex and www", () => {
    expect(customDomainError("unstakd.com", "unstakd.com")).toBeNull();
    expect(customDomainError("www.unstakd.com", "unstakd.com")).toBeNull();
  });

  it("keeps other subdomains automatic", () => {
    expect(customDomainError("blog.unstakd.com", "unstakd.com")).toMatch(/assigned automatically/);
    expect(customDomainError("a.www.unstakd.com", "unstakd.com")).toMatch(/assigned automatically/);
  });

  it("allows unrelated domains", () => {
    expect(customDomainError("photos.example.com", "unstakd.com")).toBeNull();
    expect(customDomainError("notunstakd.com", "unstakd.com")).toBeNull();
  });
});
