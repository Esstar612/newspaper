"use client";

import { Fragment } from "react";
import { LABELS } from "@/lib/categories";
import { relativeTime } from "@/lib/format";
import type { AskState } from "@/lib/useAsk";
import { ArticleThumb } from "@/components/ArticleThumb";
import { ErrorBanner, Icon } from "@/components/ui";

type Props = {
    state: Exclude<AskState, { status: "idle" }>;
    category: string;
    onRetry: () => void;
    onClose: () => void;
};

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export function AnswerCard({ state, category, onRetry, onClose }: Props) {
    const sources = state.status === "done" ? state.answer.sources : [];
    const byN = new Map(sources.map((s) => [s.n, s]));

    return (
        <section
            aria-label="Answer"
            className="mb-8 grid gap-8 rounded-lg border border-line bg-surface p-5 sm:p-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
        >
            <div className={sources.length === 0 ? "lg:col-span-2" : undefined}>
                <div className="flex items-start justify-between gap-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
                        <Icon name="ask" size={14} />
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
                                {state.answer.segments.map((segment, i) => (
                                    <Fragment key={i}>
                                        {segment.text}
                                        {segment.cites.map((n) => (
                                            <a
                                                key={n}
                                                href={byN.get(n)?.url}
                                                aria-label={`Source ${n}`}
                                                {...external}
                                                className="ml-1 rounded bg-raised px-1.5 py-0.5 font-sans text-xs font-semibold text-accent no-underline"
                                            >
                                                {n}
                                            </a>
                                        ))}
                                    </Fragment>
                                ))}
                            </p>
                            {state.answer.truncated && <p className="text-sm text-ink-muted">This answer was cut short.</p>}
                            <p className="text-xs text-ink-subtle">
                                Summarized from article summaries only. Open the article for the full story.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {sources.length > 0 && (
                <div className="lg:border-l lg:border-line lg:pl-8">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Read the articles</p>
                    <ol aria-label="Sources" className="space-y-3">
                        {sources.map((s) => (
                            <li key={s.n}>
                                <a href={s.url} {...external} className="group flex gap-3.5 rounded-lg bg-raised p-3 no-underline">
                                    <ArticleThumb src={s.imageUrl} className="h-[72px] w-24 shrink-0 rounded" />
                                    <span className="flex min-w-0 flex-col gap-1.5">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                                            {[String(s.n), s.source, relativeTime(s.publishedAt)].filter(Boolean).join(" · ")}
                                        </span>
                                        <span className="font-serif font-semibold leading-snug text-ink">{s.title}</span>
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    );
}
