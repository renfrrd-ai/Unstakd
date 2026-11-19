export type DnsRecord = { type: "CNAME" | "A"; name: string; value: string };

// Two labels = apex. Multi-part public suffixes (co.uk) are treated as subdomains; fine for one user.
export function isApex(hostname: string) {
  return hostname.split(".").length === 2;
}

export function requiredRecord(hostname: string, edgeHost: string, edgeIp: string): DnsRecord {
  if (isApex(hostname)) return { type: "A", name: "@", value: edgeIp || "<server IP>" };
  const labels = hostname.split(".");
  return { type: "CNAME", name: labels.slice(0, -2).join("."), value: edgeHost };
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeHostname(input: string): string | null {
  const h = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return HOSTNAME.test(h) ? h : null;
}
