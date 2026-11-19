import { describe, expect, it } from "vitest";
import { hashToken } from "./api-auth";

describe("hashToken", () => {
  it("is a stable sha256 hex digest", () => {
    expect(hashToken("unst_abc")).toBe(hashToken("unst_abc"));
    expect(hashToken("unst_abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("unst_abc")).not.toBe(hashToken("unst_abd"));
  });
});
