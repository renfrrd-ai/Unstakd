"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/forms/action-form";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Input } from "@/components/ui/field";

export type TokenState = { error?: string; token?: string; name?: string } | null;

// The token is only in this component's state: once the page reloads it's gone for good.
export function NewToken({ action }: { action: (s: TokenState, d: FormData) => Promise<TokenState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Token name" className="min-w-0 flex-1 basis-56">
          <Input name="name" placeholder="laptop" autoComplete="off" maxLength={40} required />
        </Field>
        <SubmitButton variant="primary" pendingLabel="Creating…">Create token</SubmitButton>
      </div>
      {state?.error && <p role="alert" className="m-0 text-[13px] text-err">{state.error}</p>}
      {state?.token && (
        <div role="status" className="flex flex-col gap-2 rounded-md border border-border bg-ok-bg p-3">
          <p className="m-0 text-[13px]">
            <span className="font-semibold">{state.name}</span> created. Copy it now: it won&apos;t be shown again.
          </p>
          <div className="flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-panel px-2 py-1 font-mono text-[13px]">{state.token}</code>
            <CopyButton value={state.token} />
          </div>
        </div>
      )}
    </form>
  );
}
