import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

// accent = top-bar CTA; primary = the main action inside a page (ink); secondary = soft chip;
// outline = bordered on panel; ghost = text link; dashed = add-something; danger = destructive.
type Variant = "accent" | "primary" | "secondary" | "outline" | "ghost" | "dashed" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  accent: "bg-accent text-accent-ink font-semibold hover:brightness-110",
  primary: "bg-ink text-on-ink font-semibold hover:opacity-90",
  secondary: "bg-panel-2 text-text font-medium hover:brightness-95 dark:hover:brightness-125",
  outline: "border border-border-strong bg-panel text-text font-medium hover:bg-panel-2",
  ghost: "text-accent-text font-medium hover:text-accent-strong",
  dashed: "border border-dashed border-border-dashed text-text font-medium hover:bg-panel-2",
  danger: "border border-err-border bg-panel text-err font-semibold hover:bg-err-bg",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs rounded-lg",
  md: "h-9.5 px-3.5 text-[13px] rounded-[10px]",
  lg: "h-12 px-5 text-[15px] rounded-xl",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    variant === "ghost" ? "h-auto px-0" : sizes[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
