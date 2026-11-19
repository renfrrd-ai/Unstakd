import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, buttonClass } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { safeNext } from "@/server/oauth";
import { devAuthEnabled } from "@/server/session";

export const metadata: Metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  state: "That sign-in link expired. Try again.",
  github: "GitHub didn't complete the sign-in. Try again.",
  not_allowed: "This GitHub account isn't on the allowlist.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-4 sm:p-6">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pb-24">
        <Panel className="flex w-full max-w-sm flex-col gap-6 p-7">
          <div className="flex items-center gap-2.5 font-mono text-base font-bold">
            <span aria-hidden="true" className="inline-block h-4.5 w-2.5 bg-accent" />
            unstakd
          </div>
          <div>
            <h1 className="m-0 font-display text-[34px] leading-tight font-bold tracking-[-0.02em]">Sign in</h1>
            <p className="mt-2 text-muted">Push a repo, get a live app.</p>
          </div>
          <Suspense fallback={<div className="h-11" />}>
            <SignInActions searchParams={searchParams} />
          </Suspense>
        </Panel>
      </main>
    </div>
  );
}

async function SignInActions({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? errors[params.error] : undefined;
  const next = safeNext(typeof params.next === "string" ? params.next : null);

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="m-0 rounded-lg border border-err-border bg-err-bg px-3.5 py-2.5 text-err">
          {error}
        </p>
      )}
      {devAuthEnabled() ? (
        <form action="/api/auth/dev" method="post">
          <Button type="submit" variant="primary" className="w-full">Continue as dev user</Button>
          <p className="mt-3 font-mono text-xs text-muted">GITHUB_CLIENT_ID is unset, so local dev sign-in is on.</p>
        </form>
      ) : (
        <a href={`/api/auth/github?next=${encodeURIComponent(next)}`} className={buttonClass("primary", "md", "w-full")}>
          <GitHubIcon />
          Continue with GitHub
        </a>
      )}
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.3 1.9 1.3 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z" />
    </svg>
  );
}
