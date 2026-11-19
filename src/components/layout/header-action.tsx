"use client";

import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";

const actions: { match: (p: string) => boolean; href: string; label: string }[] = [
  { match: (p) => p === "/", href: "/new", label: "New project" },
  { match: (p) => p.startsWith("/databases"), href: "/databases/new", label: "New database" },
];

// The primary action in the top bar depends on the section, as in the reference design.
export function HeaderAction() {
  const pathname = usePathname();
  const action = actions.find((a) => a.match(pathname));
  if (!action) return null;
  return (
    <ButtonLink href={action.href} variant="primary">
      {action.label}
    </ButtonLink>
  );
}
