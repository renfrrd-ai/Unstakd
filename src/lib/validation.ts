import { z } from "zod";

export const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
export const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

export const slugSchema = z.string().trim().toLowerCase().regex(SLUG, "Use 1–40 lowercase letters, numbers or dashes");
// Subdomains an app must not take: the platform's own hosts, mail/DNS conventions, names that
// would look official (phishing), and pr-<n>-* which preview deploys use.
export const RESERVED_SLUGS = new Set([
  "dash", "dashboard", "edge", "www", "app", "apps", "api", "admin", "status", "docs", "cdn", "static", "assets",
  "mail", "email", "webmail", "smtp", "imap", "pop", "pop3", "mx", "autoconfig", "autodiscover",
  "ns", "ns1", "ns2", "ns3", "dns", "ftp", "sftp", "ssh", "vpn", "git", "registry",
  "auth", "login", "signin", "sso", "oauth", "account", "accounts", "billing", "support", "help", "security",
  "internal", "localhost", "root", "unstakd",
]);
export const isReservedSlug = (slug: string) => RESERVED_SLUGS.has(slug) || /^pr-\d+-/.test(slug);
export const newSlugSchema = slugSchema.refine((v) => !isReservedSlug(v), "That name is reserved (platform, mail, DNS or preview addresses); pick another");
// Static mode: blank means auto-detect (stored as null).
export const buildCommandSchema = z
  .string()
  .trim()
  .max(500, "Keep the build command under 500 characters")
  .transform((v) => v || null);
export const outputDirSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^[\w./-]*$/, "Output directory: letters, numbers, . / - and _ only")
  .refine((v) => !v.split("/").includes("..") && !v.startsWith("/"), "Output directory must be inside the repo")
  .transform((v) => v.replace(/^\.\/+/, "").replace(/\/+$/, "") || null);
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
