import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "dashed";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-bold hover:brightness-110",
  secondary: "border border-border-strong bg-panel text-text font-semibold hover:bg-panel-2",
  ghost: "text-accent-text hover:underline",
  dashed: "border border-dashed border-border-strong text-text hover:bg-panel-2",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs rounded-md",
  md: "h-11 px-4 text-sm rounded-lg",
  lg: "h-13 px-5 text-[15px] rounded-lg",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
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
