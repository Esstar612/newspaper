// components/ui/States.tsx
import type { ReactNode } from "react";
import { cn } from "./cn";

// Replaces three page headers, three empty states, three error banners and two
// loading blocks that were each copy-pasted with small unintended drift
// (maxWidth 1400 vs 1200, emoji 48px vs 64px, <h2> vs styled <p>).

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="mb-6">
            <h1 className="font-serif text-4xl font-semibold text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-lg text-ink-muted">{subtitle}</p>}
        </div>
    );
}

export function EmptyState({
    title,
    hint,
    icon,
}: {
    title: string;
    hint?: ReactNode;
    icon?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center px-5 py-20 text-center">
            {icon && <div className="mb-4 text-ink-subtle">{icon}</div>}
            <p className="text-xl font-semibold text-ink">{title}</p>
            {hint && <p className="mt-2 max-w-sm text-base text-ink-muted">{hint}</p>}
        </div>
    );
}

export function ErrorBanner({
    title = "Something went wrong",
    message,
    onRetry,
    tone = "danger",
}: {
    title?: string;
    message: string;
    onRetry?: () => void;
    tone?: "danger" | "warn";
}) {
    const danger = tone === "danger";
    return (
        <div
            role="alert"
            className={cn(
                "rounded border p-4 text-base",
                danger
                    ? "border-danger-line bg-danger-bg text-danger-ink"
                    : "border-warn-line bg-warn-bg text-warn-ink"
            )}
        >
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm opacity-90">{message}</p>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className={cn(
                        "mt-3 rounded border px-3 py-1 text-sm font-semibold transition-colors",
                        danger
                            ? "border-danger-line hover:bg-danger-line/20"
                            : "border-warn-line hover:bg-warn-line/20"
                    )}
                >
                    Try again
                </button>
            )}
        </div>
    );
}

export function Skeleton({ className }: { className?: string }) {
    return <div className={cn("animate-pulse rounded bg-raised", className)} />;
}
