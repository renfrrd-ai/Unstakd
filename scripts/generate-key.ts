import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateKeyHex } from "../src/lib/crypto";

const path = process.env.UNSTAKD_KEY_FILE ?? ".data/master.key";

if (existsSync(path)) {
  console.error(`${path} already exists; refusing to overwrite (it would make stored secrets unreadable).`);
  process.exit(1);
}

mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
writeFileSync(path, `${generateKeyHex()}\n`, { mode: 0o600 });
console.log(`Wrote ${path}. Keep it out of git and out of database backups.`);
