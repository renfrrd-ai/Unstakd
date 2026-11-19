import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { env } from "./env";

const VERSION = "v1";
let key: Buffer | undefined;

function masterKey(): Buffer {
  if (!key) {
    const hex = readFileSync(env().UNSTAKD_KEY_FILE, "utf8").trim();
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("UNSTAKD_KEY_FILE must hold 32 bytes as 64 hex chars");
    key = Buffer.from(hex, "hex");
  }
  return key;
}

// Output: "v1:" + base64(iv | authTag | ciphertext)
export function encrypt(plaintext: string, k: Buffer = masterKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64")}`;
}

export function decrypt(payload: string, k: Buffer = masterKey()): string {
  const [version, data] = payload.split(":", 2);
  if (version !== VERSION || !data) throw new Error("Unknown ciphertext format");
  const buf = Buffer.from(data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function generateKeyHex(): string {
  return randomBytes(32).toString("hex");
}
