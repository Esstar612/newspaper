"use client";

import { LABELS } from "@/lib/categories";
import type { AskState } from "@/lib/useAsk";
import { ErrorBanner, Icon } from "@/components/ui";

type Props = {
    state: Exclude<AskState, { status: "idle" }>;
    category: string;
    onRetry: () => void;
    onClose: () => void;
};

export function AskPanel({ state, category, onRetry, onClose }: Props) {
    return (
        <section aria-label="Answer" className="mb-8 rounded-lg border border-line bg-surface p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                    Summary answer · {LABELS[category] ?? category}
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close answer"
                    className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-raised hover:text-ink"
                >
                    <Icon name="close" size={18} />
                </button>
            </div>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-ink">{state.question}</h2>

            <div aria-live="polite" className="mt-4">
                {state.status === "loading" && <p className="text-base text-ink-muted">Finding an answer…</p>}

                {state.status === "error" && (
                    <ErrorBanner title={state.title} message={state.message} onRetry={state.retry ? onRetry : undefined} />
                )}

                {state.status === "done" && (
                    <div className="space-y-4">
                        <p className="font-serif text-lg leading-relaxed text-ink">
                            {state.answer.segments.map((s) => s.text + s.cites.map((n) => ` [${n}]`).join("")).join("")}
                        </p>
                        {state.answer.truncated && <p className="text-sm text-ink-muted">This answer was cut short.</p>}
                        {state.answer.sources.length > 0 && (
                            <ol aria-label="Sources" className="space-y-1 text-sm">
                                {state.answer.sources.map((s) => (
                                    <li key={s.n}>
                                        <span className="text-ink-subtle">[{s.n}] </span>
                                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                                            {s.title}
                                        </a>
                                    </li>
                                ))}
                            </ol>
                        )}
                        <p className="text-xs text-ink-subtle">
                            Summarized from article summaries only. Open the article for the full story.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
