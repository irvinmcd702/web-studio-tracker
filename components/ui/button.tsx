import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

/**
 * Four variants, no more. Primary is the accent, secondary is the outline,
 * ghost is for icon rows, danger is for the two or three destructive actions
 * in the whole app. Every one carries hover, focus, active and disabled.
 */
const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--color-brand)] text-[var(--color-on-brand)] hover:bg-[var(--color-brand-hover)] active:brightness-95",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-[var(--color-hover)] hover:border-[var(--color-line-strong)] active:bg-[var(--color-hover-strong)]",
  ghost:
    "bg-transparent text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)] active:bg-[var(--color-hover-strong)]",
  danger:
    "bg-[var(--color-danger)] text-[var(--color-on-danger)] hover:bg-[var(--color-danger-hover)] active:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9.5 px-4 text-sm gap-2",
};

export const buttonClass = (variant: Variant = "primary", size: Size = "md") =>
  cn(
    "inline-flex items-center justify-center rounded-[var(--radius-field)] font-medium",
    "transition-[background-color,border-color,color,filter] duration-[var(--dur-fast)] ease-[var(--ease-out)]",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)]",
    "disabled:pointer-events-none disabled:opacity-45",
    variants[variant],
    sizes[size],
  );

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(buttonClass(variant, size), className)} {...props} />
  );
}
