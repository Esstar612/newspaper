// components/ui/Field.tsx
"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { cn } from "./cn";

// Replaces four byte-identical field styles. Critically, this wires label->control:
// the two selects on /stocks had <label> elements with no htmlFor and selects with
// no id, so they were visually labelled but programmatically orphaned.

const CONTROL = cn(
    "w-full rounded border border-line bg-raised px-3 text-ink",
    "h-10 text-base transition-colors",
    "hover:border-line-strong",
    "placeholder:text-ink-subtle"
);

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
    return (
        <label
            htmlFor={htmlFor}
            className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-subtle"
        >
            {children}
        </label>
    );
}

export function SelectField({
    label,
    className,
    children,
    ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
    const id = useId();
    return (
        <div className={className}>
            <Label htmlFor={id}>{label}</Label>
            <select id={id} className={cn(CONTROL, "cursor-pointer")} {...props}>
                {children}
            </select>
        </div>
    );
}

export function TextField({
    label,
    hideLabel = false,
    className,
    ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hideLabel?: boolean }) {
    const id = useId();
    return (
        <div className={className}>
            {hideLabel ? (
                // Visually hidden but still announced — a placeholder is not a label.
                <label htmlFor={id} className="sr-only">
                    {label}
                </label>
            ) : (
                <Label htmlFor={id}>{label}</Label>
            )}
            <input id={id} className={CONTROL} {...props} />
        </div>
    );
}
