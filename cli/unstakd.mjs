#!/usr/bin/env node
// Unstakd CLI. No dependencies: needs Node 20+. Talks to the dashboard's /api/v1 with a token
// created on the Server page. Config lives in ~/.config/unstakd/config.json (or UNSTAKD_URL/UNSTAKD_TOKEN).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const CONFIG = path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "unstakd", "config.json");
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const [dim, red, green, yellow, bold] = [c(2), c(31), c(32), c(33), c(1)];

const HELP = `unstakd — deploy from the terminal

  unstakd login <dashboard-url>          save the URL and an API token (from Server → API tokens)
  unstakd init                           link this git repo to its project (writes .unstakd.json)
  unstakd projects                       list projects
  unstakd status <project>               live version and recent deploys
  unstakd deploy <project> [--detach]    redeploy the branch head and follow the build log
  unstakd logs <project> [number]        follow a deploy's build log (latest by default)
  unstakd rollback <project> [number]    go back to deploy #number (default: the one before live)
  unstakd env <project>                  list env vars (secret values stay hidden)
  unstakd env set <project> K=V… [--plain]   set vars (secret unless --plain); redeploy to apply
  unstakd env rm <project> K…            remove vars

  Inside a repo linked with \`unstakd init\`, <project> can be left out.
`;

class CliError extends Error {}

async function loadConfig() {
  const file = await readFile(CONFIG, "utf8").then(JSON.parse, () => ({}));
  const url = process.env.UNSTAKD_URL || file.url;
  const token = process.env.UNSTAKD_TOKEN || file.token;
  if (!url || !token) throw new CliError("not logged in: run `unstakd login <dashboard-url>`");
  return { url: url.replace(/\/+$/, ""), token };
}

async function call(cfg, method, route, body) {
  let res;
  try {
    res = await fetch(`${cfg.url}/api/v1${route}`, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new CliError(`can't reach ${cfg.url} (${e.cause?.code ?? e.message})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new CliError(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}

const STATUS = {
  live: green("● live"),
  superseded: dim("○ superseded"),
  queued: yellow("◌ queued"),
  building: yellow("◐ building"),
  deploying: yellow("◑ deploying"),
  failed: red("✕ failed"),
  cancelled: dim("⊘ cancelled"),
};
const HEALTH = { live: green("live"), building: yellow("building"), attention: red("needs attention"), standby: dim("standby"), new: dim("new") };
const status = (s) => STATUS[s] ?? s;
const ago = (iso) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const pad = (s, n) => s + " ".repeat(Math.max(0, n - s.replace(/\x1b\[\d+m/g, "").length));
const describe = (d) => `#${d.number} ${status(d.status)}  ${dim(d.commit ?? "")} ${d.message ?? ""}`.trimEnd();

async function follow(cfg, deployment) {
  console.log(dim(`following deploy #${deployment.number} (Ctrl-C stops watching, the deploy keeps going)`));
  const levels = { err: red, warn: yellow, step: bold };
  let next = 0;
  for (;;) {
    const r = await call(cfg, "GET", `/deployments/${deployment.id}/logs?after=${next}`);
    for (const l of r.lines) console.log((levels[l.level] ?? ((s) => s))(l.text));
    next = r.next;
    if (r.done) {
      // The log can gain its last lines just after the status flips; read once more.
      const tail = await call(cfg, "GET", `/deployments/${deployment.id}/logs?after=${next}`);
      for (const l of tail.lines) console.log((levels[l.level] ?? ((s) => s))(l.text));
      console.log(`\ndeploy #${deployment.number}: ${status(r.status)}`);
      return r.status === "live";
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
}

const LINK = ".unstakd.json";
const gitRoot = () => {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const linked = async () => {
  const root = gitRoot();
  return root ? (await readFile(path.join(root, LINK), "utf8").then(JSON.parse, () => ({}))).project : undefined;
};

// Takes the project from args[0] when it names one, otherwise from .unstakd.json. Returns [slug, rest].
async function target(cfg, args) {
  const { projects } = await call(cfg, "GET", "/projects");
  if (args[0] && projects.some((p) => p.slug === args[0])) return [args[0], args.slice(1)];
  const link = await linked();
  if (link) return [link, args];
  if (args[0] && !/[=]/.test(args[0]) && !/^\d+$/.test(args[0])) throw new CliError(`no project "${args[0]}"`);
  throw new CliError("which project? Pass its name, or run `unstakd init` in its repo");
}

const need = (v, what) => {
  if (!v) throw new CliError(`missing ${what}. Run \`unstakd help\``);
  return v;
};

const commands = {
  async login([url]) {
    url = need(url, "dashboard URL").replace(/\/+$/, "");
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    let token = process.env.UNSTAKD_TOKEN;
    if (!token) {
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      token = (await rl.question("API token (Server → API tokens): ")).trim();
      rl.close();
    }
    const { projects } = await call({ url, token }, "GET", "/projects");
    await mkdir(path.dirname(CONFIG), { recursive: true, mode: 0o700 });
    await writeFile(CONFIG, JSON.stringify({ url, token }, null, 2) + "\n", { mode: 0o600 });
    console.log(`${green("✓")} logged in to ${url} (${projects.length} project${projects.length === 1 ? "" : "s"}). Saved to ${dim(CONFIG)}`);
  },

  async init() {
    const cfg = await loadConfig();
    const root = need(gitRoot(), "git repo (run this inside one)");
    let remote;
    try {
      remote = execFileSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8" }).trim();
    } catch {
      throw new CliError("this repo has no `origin` remote");
    }
    const repo = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(remote)?.[1];
    if (!repo) throw new CliError(`origin isn't a GitHub repo: ${remote}`);
    const { projects } = await call(cfg, "GET", "/projects");
    const p = projects.find((x) => x.repo.toLowerCase() === repo.toLowerCase());
    if (!p) throw new CliError(`no project deploys ${repo} yet. Create it at ${cfg.url}/new`);
    await writeFile(path.join(root, LINK), JSON.stringify({ project: p.slug }, null, 2) + "\n");
    console.log(`${green("✓")} linked ${repo} to ${bold(p.slug)} (${p.url}). Wrote ${LINK}; commit it or add it to .gitignore.`);
  },

  async projects() {
    const cfg = await loadConfig();
    const { projects } = await call(cfg, "GET", "/projects");
    if (!projects.length) return console.log(dim("no projects yet"));
    const w = Math.max(...projects.map((p) => p.slug.length)) + 2;
    for (const p of projects) console.log(`${pad(bold(p.slug), w)}${pad(HEALTH[p.health] ?? p.health, 18)}${dim(p.url)}`);
  },

  async status(args) {
    const cfg = await loadConfig();
    const [slug] = await target(cfg, args);
    const { project: p, deployments } = await call(cfg, "GET", `/projects/${slug}`);
    console.log(`${bold(p.name)}  ${HEALTH[p.health] ?? p.health}\n${dim("repo")}  ${p.repo}@${p.branch}\n${dim("url")}   ${p.url}\n`);
    for (const d of deployments) console.log(`${describe(d)}  ${dim(ago(d.createdAt))}`);
  },

  async deploy(args, flags) {
    const cfg = await loadConfig();
    const [slug] = await target(cfg, args);
    const { deployment } = await call(cfg, "POST", `/projects/${slug}/deploy`);
    console.log(`${green("✓")} queued deploy #${deployment.number} of ${bold(slug)}`);
    if (!flags.has("--detach") && !(await follow(cfg, deployment))) process.exitCode = 1;
  },

  async logs(args) {
    const cfg = await loadConfig();
    const [slug, [number]] = await target(cfg, args);
    const { deployments } = await call(cfg, "GET", `/projects/${slug}`);
    const d = number ? deployments.find((x) => x.number === Number(number)) : deployments[0];
    if (!d) throw new CliError(number ? `no deploy #${number} among the last ${deployments.length}` : "no deploys yet");
    if (!(await follow(cfg, d))) process.exitCode = 1;
  },

  async rollback(args, flags) {
    const cfg = await loadConfig();
    const [slug, [number]] = await target(cfg, args);
    const body = number ? { number: Number(number) } : {};
    const { deployment, target: to } = await call(cfg, "POST", `/projects/${slug}/rollback`, body);
    console.log(`${green("✓")} rolling back ${bold(slug)} to #${to} as deploy #${deployment.number}`);
    if (!flags.has("--detach") && !(await follow(cfg, deployment))) process.exitCode = 1;
  },

  async env(args) {
    const cfg = await loadConfig();
    const [sub, ...after] = ["ls", "set", "rm"].includes(args[0]) ? args : ["ls", ...args];
    const [slug, rest] = await target(cfg, after);
    const route = `/projects/${slug}/env`;
    if (sub === "ls") {
      const { vars } = await call(cfg, "GET", route);
      if (!vars.length) return console.log(dim("no env vars"));
      for (const v of vars) console.log(`${bold(v.key)}=${v.secret ? dim("•••••• (secret)") : v.value}`);
    } else if (sub === "set") {
      const vars = {};
      for (const pair of rest.filter((a) => !a.startsWith("--"))) {
        const i = pair.indexOf("=");
        if (i < 1) throw new CliError(`expected KEY=value, got "${pair}"`);
        vars[pair.slice(0, i)] = pair.slice(i + 1);
      }
      const { saved } = await call(cfg, "PUT", route, { vars, secret: !rest.includes("--plain") });
      console.log(`${green("✓")} saved ${saved.join(", ")}. Run \`unstakd deploy ${slug}\` to apply.`);
    } else {
      const { removed } = await call(cfg, "DELETE", route, { keys: need(rest.length && rest, "keys") });
      console.log(removed.length ? `${green("✓")} removed ${removed.join(", ")}` : dim("nothing to remove"));
    }
  },

  help() {
    process.stdout.write(HELP);
  },
};
commands.ls = commands.projects;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [cmd = "help", ...args] = argv.filter((a) => !a.startsWith("--") || a === "--plain");
const run = commands[cmd] ?? (cmd === "-h" || flags.has("--help") ? commands.help : null);
if (!run) {
  console.error(`unknown command "${cmd}"\n\n${HELP}`);
  process.exit(2);
}
try {
  await run(args, flags);
} catch (e) {
  if (!(e instanceof CliError)) throw e;
  console.error(`${red("error:")} ${e.message}`);
  process.exit(1);
}
