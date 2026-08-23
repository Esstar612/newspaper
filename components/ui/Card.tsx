// components/ui/Card.tsx
import type { ReactNode } from "react";
import { cn } from "./cn";

// Replaces the `#1e293b` + radius + `rgba(255,255,255,0.1)` container that was
// written out 17 times across 5 files — three times in ten consecutive lines on
// the weather page.
export function Card({
    children,
    className,
    padded = true,
    as: Tag = "div",
}: {
    children: ReactNode;
    className?: string;
    padded?: boolean;
    as?: "div" | "section" | "article" | "aside";
}) {
    return (
        <Tag
            className={cn(
                "rounded-lg border border-line bg-surface",
                padded && "p-5",
                className
            )}
        >
            {children}
        </Tag>
    );
}
