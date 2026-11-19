import { promises as dns } from "node:dns";

export type Resolver = {
  resolveCname(host: string): Promise<string[]>;
  resolve4(host: string): Promise<string[]>;
};

export type DnsVerdict = "ok" | "elsewhere" | "missing";

// A hostname is ours if it CNAMEs (possibly via a chain) to the edge host, or its A records
// are the edge's addresses. Cloudflare-proxied records resolve elsewhere and count as "elsewhere".
export async function checkDns(hostname: string, edge: { host: string; ip: string }, resolver: Resolver = dns): Promise<DnsVerdict> {
  const edgeIps = new Set<string>(edge.ip ? [edge.ip] : []);
  if (!edge.ip) {
    for (const ip of await resolver.resolve4(edge.host).catch(() => [])) edgeIps.add(ip);
  }

  let name = hostname;
  for (let hops = 0; hops < 5; hops++) {
    const cnames = await resolver.resolveCname(name).catch(() => []);
    if (cnames.length === 0) break;
    const target = cnames[0].replace(/\.$/, "").toLowerCase();
    if (target === edge.host.toLowerCase()) return "ok";
    name = target;
  }

  const ips = await resolver.resolve4(hostname).catch(() => []);
  if (ips.length === 0) return "missing";
  return ips.some((ip) => edgeIps.has(ip)) ? "ok" : "elsewhere";
}
