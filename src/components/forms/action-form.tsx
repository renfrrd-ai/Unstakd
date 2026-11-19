"use client";

import { useActionState, useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { FormState } from "@/lib/validation";

type Action = (state: FormState, data: FormData) => Promise<FormState>;

// Form bound to a server action that returns { error } or { ok }; resets on success.
export function ActionForm({ action, children, className, resetOnSuccess = true }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={cn("flex flex-col gap-3", className)}>
      {children}
      {state?.error && <p role="alert" className="m-0 text-[13px] text-err">{state.error}</p>}
      {state?.ok && <p role="status" className="m-0 text-[13px] text-accent-text">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({ pendingLabel, children, ...props }: ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
