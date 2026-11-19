import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateKeyHex } from "./crypto";

const key = Buffer.from(generateKeyHex(), "hex");

describe("crypto", () => {
  it("round-trips values", () => {
    const value = "postgres://user:p@ss w0rd/db?x=ü";
    expect(decrypt(encrypt(value, key), key)).toBe(value);
  });

  it("uses a fresh IV per encryption", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("rejects tampered ciphertext", () => {
    const enc = encrypt("secret", key);
    const raw = Buffer.from(enc.slice(3), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decrypt(`v1:${raw.toString("base64")}`, key)).toThrow();
  });

  it("rejects the wrong key", () => {
    const other = Buffer.from(generateKeyHex(), "hex");
    expect(() => decrypt(encrypt("secret", key), other)).toThrow();
  });
});
