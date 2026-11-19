import { z } from "zod";

export const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export const slugSchema = z.string().trim().toLowerCase().regex(SLUG, "Use 1–40 lowercase letters, numbers or dashes");
export const envKeySchema = z.string().trim().regex(ENV_KEY, "Keys use letters, numbers and _ and can't start with a number");

export const SIZES = {
  small: { label: "Small · 0.5 CPU · 256 MB", cpu: 0.5, memoryMb: 256 },
  medium: { label: "Medium · 1 CPU · 512 MB", cpu: 1, memoryMb: 512 },
  large: { label: "Large · 2 CPU · 1 GB", cpu: 2, memoryMb: 1024 },
} as const;
export type Size = keyof typeof SIZES;

export function sizeOf(cpu: number, memoryMb: number): Size {
  return (Object.keys(SIZES) as Size[]).find((k) => SIZES[k].cpu === cpu && SIZES[k].memoryMb === memoryMb) ?? "medium";
}

// Parses KEY=value lines; supports `export`, quotes and comments. Returns entries and bad line numbers.
export function parseDotEnv(text: string): { entries: [string, string][]; invalid: number[] } {
  const entries: [string, string][] = [];
  const invalid: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^(?:export\s+)?([^=\s]+)\s*=\s*(.*)$/.exec(line);
    if (!m || !ENV_KEY.test(m[1])) return void invalid.push(i + 1);
    let value = m[2];
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) value = quoted[1] === '"' ? quoted[2].replace(/\\n/g, "\n") : quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    entries.push([m[1], value]);
  });
  return { entries, invalid };
}

export type FormState = { error?: string; ok?: string } | null;
