export function defaultHost(slug: string, appsDomain: string) {
  return `${slug}.${appsDomain}`;
}

// How visitors reach an app: https in production; in dev Caddy listens on http and a local port.
export function publicUrl(host: string) {
  const https = process.env.CADDY_HTTPS === "true";
  const port = process.env.APPS_PUBLIC_PORT;
  return `${https ? "https" : "http"}://${host}${port && port !== (https ? "443" : "80") ? `:${port}` : ""}`;
}

export function previewHost(slug: string, pr: number, appsDomain: string) {
  return `pr-${pr}-${slug}.${appsDomain}`;
}
