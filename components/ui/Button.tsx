// components/ui/Button.tsx
"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

// Replaces five primary buttons that had five different paddings and two radii,
// plus their JS onMouseOver handlers — hover and focus are now CSS, so they work
// for keyboard users too.
type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
    primary: "bg-accent-strong text-accent-ink hover:brightness-110",
    secondary: "bg-raised text-ink border border-line hover:border-line-strong",
    ghost: "text-ink-muted hover:text-ink hover:bg-raised",
};

const SIZES: Record<Size, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-base",
};

export function Button({
    children,
    variant = "primary",
    size = "md",
    className,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    variant?: Variant;
    size?: Size;
}) {
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center gap-2 rounded font-semibold",
                "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                VARIANTS[variant],
                SIZES[size],
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
}
