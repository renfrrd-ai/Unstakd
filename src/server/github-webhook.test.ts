import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./github-webhook";

const body = JSON.stringify({ ref: "refs/heads/main" });
const sign = (secret: string, b = body) => `sha256=${createHmac("sha256", secret).update(b).digest("hex")}`;

describe("verifySignature", () => {
  it("accepts a correct signature", () => expect(verifySignature("s3cret", body, sign("s3cret"))).toBe(true));
  it("rejects a wrong secret, tampered body, or missing header", () => {
    expect(verifySignature("s3cret", body, sign("other"))).toBe(false);
    expect(verifySignature("s3cret", body + " ", sign("s3cret"))).toBe(false);
    expect(verifySignature("s3cret", body, null)).toBe(false);
    expect(verifySignature("s3cret", body, "sha1=abc")).toBe(false);
  });
  it("refuses everything when no secret is configured", () => expect(verifySignature("", body, sign(""))).toBe(false));
});
