import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ConfigureForm } from "@/components/projects/configure-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { newSlugSchema } from "@/lib/validation";
import { db, schema as s } from "@/db";
import { timeAgo } from "@/lib/format";
import { appInfo, githubAppConfigured, listAppRepos } from "@/server/github-app";
import { inspectRepo, parseRepo } from "@/server/repo-inspect";
import { List, ListRow } from "@/components/ui/panel";
import { Pill } from "@/components/ui/pill";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage({ searchParams }: PageProps<"/new">) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-300 flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <BrandMark />
          <div className="flex items-center gap-3.5">
            <Link href="/" className="text-muted hover:text-text">Cancel</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-300 flex-col gap-7 px-4 py-8 sm:px-8">
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Steps searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

function StepPills({ current }: { current: 1 | 2 }) {
  const steps = ["repo", "configure", "deploy"];
  return (
    <ol aria-label="Steps" className="m-0 flex list-none flex-wrap gap-2 p-0 font-mono text-xs">
      {steps.map((label, i) => {
        const n = i + 1;
        return (
          <li
            key={label}
            aria-current={n === current ? "step" : undefined}
            className={cn(
              "rounded-full px-3.5 py-2",
              n < current && "bg-panel-2 text-muted",
              n === current && "bg-accent font-bold text-accent-ink",
              n > current && "border border-border-strong text-muted",
            )}
          >
            {n} · {label}
            {n < current ? " ✓" : ""}
          </li>
        );
      })}
    </ol>
  );
}

async function Steps({ searchParams }: { searchParams: PageProps<"/new">["searchParams"] }) {
  await requireUser();
  const params = await searchParams;
  const raw = typeof params.repo === "string" ? params.repo : "";
  const repo = raw ? parseRepo(raw) : null;

  if (!repo) {
    return (
      <>
        <div>
          <StepPills current={1} />
          <h1 className="mt-5 mb-0 font-display text-[40px] leading-tight font-bold tracking-[-0.03em]">Deploy a repo</h1>
          <p className="mt-2 mb-0 text-muted">Pick a repo the Unstakd GitHub App can see (private ones included), or paste any public repo.</p>
        </div>
        <Suspense fallback={<Skeleton className="h-64 max-w-2xl" />}>
          <RepoPicker />
        </Suspense>
        <Panel className="max-w-2xl p-6">
          <form method="get" className="flex flex-col gap-3">
            <label htmlFor="repo" className="text-[13px] text-muted">Or a public repository</label>
            <div className="flex flex-wrap gap-2">
              <Input id="repo" name="repo" mono required defaultValue={raw} placeholder="owner/name or https://github.com/owner/name" className="min-w-0 flex-1" autoComplete="off" />
              <Button type="submit" variant="primary">Continue</Button>
            </div>
            {raw && <p role="alert" className="m-0 text-[13px] text-err">That doesn&apos;t look like a GitHub repository.</p>}
          </form>
        </Panel>
      </>
    );
  }

  let info;
  try {
    info = await inspectRepo(repo);
  } catch (e) {
    return (
      <>
        <StepPills current={1} />
        <Panel className="max-w-2xl border-err-border p-6">
          <p role="alert" className="m-0 text-err">{(e as Error).message}</p>
          <Link href="/new" className="mt-3 inline-block text-accent-text hover:underline">← Try another repo</Link>
        </Panel>
      </>
    );
  }

  const suggested = newSlugSchema.safeParse(repo.split("/")[1].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40));
  return (
    <ConfigureForm
      repo={info.repo}
      branch={info.defaultBranch}
      detected={info.detected}
      suggestedSlug={suggested.success ? suggested.data : ""}
      appsDomain={env().APPS_DOMAIN}
      steps={<StepPills current={2} />}
    />
  );
}

async function RepoPicker() {
  await requireUser();
  if (!githubAppConfigured()) {
    return (
      <Panel className="max-w-2xl p-5 text-muted">
        Private repos and this list need the Unstakd GitHub App. Set it up under{" "}
        <Link href="/server" className="text-accent-text hover:underline">Server → GitHub App</Link>.
      </Panel>
    );
  }
  let repos, installUrl;
  try {
    [repos, { installUrl }] = await Promise.all([listAppRepos(), appInfo()]);
  } catch (e) {
    return (
      <Panel className="max-w-2xl border-err-border p-5">
        <p role="alert" className="m-0 text-err">Couldn&apos;t list repos from GitHub: {(e as Error).message}</p>
      </Panel>
    );
  }
  const used = new Map((await db().select({ repo: s.projects.repo, slug: s.projects.slug }).from(s.projects)).map((p) => [p.repo.toLowerCase(), p.slug]));
  return (
    <section aria-labelledby="repos-h" className="flex max-w-2xl flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="repos-h" className="m-0 text-base font-semibold">Your repositories</h2>
        <a href={installUrl} className="text-[13px] text-accent-text hover:underline">Add repos on GitHub ↗</a>
      </div>
      {repos.length === 0 ? (
        <Panel className="p-5 text-muted">The App isn&apos;t installed on any repos yet. Use “Add repos on GitHub”.</Panel>
      ) : (
        <List className="max-h-[420px] overflow-y-auto">
          {repos.map((r) => (
            <ListRow key={r.repo} href={`/new?repo=${encodeURIComponent(r.repo)}`}>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="truncate font-mono text-[13px]">{r.repo}</span>
                {r.private && <Pill tone="neutral">private</Pill>}
                {used.has(r.repo.toLowerCase()) && <span className="text-[13px] text-muted">on {used.get(r.repo.toLowerCase())}</span>}
              </span>
              <span className="text-[13px] text-muted">{r.pushedAt ? `pushed ${timeAgo(new Date(r.pushedAt))}` : "empty"}</span>
            </ListRow>
          ))}
        </List>
      )}
    </section>
  );
}
