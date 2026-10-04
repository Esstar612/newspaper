"use client";

import { Fragment, useState, type FormEvent } from "react";
import { LABELS } from "@/lib/categories";
import { WHEN } from "@/lib/when";
import { relativeTime, utf8Bytes } from "@/lib/format";
import type { Answer, AskState, Thread } from "@/lib/useAsk";
import { ArticleThumb } from "@/components/ArticleThumb";
import { ErrorBanner, Icon, cn } from "@/components/ui";

type Props = {
    state: Exclude<AskState, { status: "idle" }>;
    category: string;
    onRetry: () => void;
    onClose: () => void;
    onFollowUp: (question: string) => void;
};

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

const used = (uses: number) => (uses === 2 ? "Used in both answers" : uses > 2 ? `Used in ${uses} answers` : "");

function AnswerText({ answer, urls }: { answer: Answer; urls: Map<number, string> }) {
    return (
        <p className="font-serif text-lg leading-relaxed text-ink">
            {answer.segments.map((segment, i) => (
                <Fragment key={i}>
                    {segment.text}
                    {segment.cites.map((n) => (
                        <a
                            key={n}
                            href={urls.get(n)}
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
    );
}

function EarlierTurn({ turn, urls }: { turn: Thread["turns"][number]; urls: Map<number, string> }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-b border-line pb-3">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(!open)}
                className="flex w-full items-center gap-3 py-1 text-left"
            >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold text-ink">{turn.question}</span>
                    {!open && (
                        <span className="truncate text-sm text-ink-muted">
                            {turn.answer.segments.map((s) => s.text).join("")}
                        </span>
                    )}
                </span>
                <Icon name="chevronDown" size={16} className={cn("shrink-0 text-ink-muted transition-transform", open && "rotate-180")} />
            </button>
            {open && (
                <div className="mt-2">
                    <AnswerText answer={turn.answer} urls={urls} />
                </div>
            )}
        </div>
    );
}

function FollowUpForm({ pending, onFollowUp }: { pending: boolean; onFollowUp: (question: string) => void }) {
    const [text, setText] = useState("");
    const question = text.trim();
    const size = utf8Bytes(question);

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (pending || size < 3 || size > 300) return;
        onFollowUp(question);
        setText("");
    };

    return (
        <div className="space-y-2">
            <form onSubmit={submit} className="flex gap-2">
                <label htmlFor="ask-follow-up" className="sr-only">
                    Ask a follow-up
                </label>
                <input
                    id="ask-follow-up"
                    type="text"
                    value={text}
                    readOnly={pending}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Ask a follow-up…"
                    autoComplete="off"
                    className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-raised px-3 text-base text-ink placeholder:text-ink-subtle"
                />
                <button
                    type="submit"
                    disabled={pending}
                    className="h-11 shrink-0 rounded-lg bg-accent-strong px-5 font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
                >
                    Ask
                </button>
            </form>
            {size > 300 && <p className="text-sm text-ink-muted">That question is too long. Please shorten it.</p>}
            <p className="text-xs text-ink-subtle">Follow-ups remember this thread. Use the box at the top to start a new topic.</p>
        </div>
    );
}

export function AnswerCard({ state, category, onRetry, onClose, onFollowUp }: Props) {
    const { thread } = state;
    const earlier = state.status === "done" ? thread.turns.slice(0, -1) : thread.turns;
    const count = earlier.length + 1;
    const urls = new Map(thread.sources.map((s) => [s.n, s.url]));

    return (
        <section
            aria-label={count > 1 ? "Answer thread" : "Answer"}
            className="mb-8 grid gap-8 rounded-lg border border-line bg-surface p-5 sm:p-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
        >
            <div className={cn("space-y-4", thread.sources.length === 0 && "lg:col-span-2")}>
                <div className="flex items-start justify-between gap-4">
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
                        <Icon name="ask" size={14} />
                        Summary answer · {LABELS[category] ?? category}
                        {thread.when !== "any" && ` · ${WHEN[thread.when]}`}
                        {count > 1 && ` · ${count} questions`}
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

                {earlier.map((turn, i) => (
                    <EarlierTurn key={i} turn={turn} urls={urls} />
                ))}

                <h2 className="font-serif text-2xl font-semibold text-ink">{state.question}</h2>

                <div aria-live="polite">
                    {state.status === "loading" && <p className="text-base text-ink-muted">Finding an answer…</p>}

                    {state.status === "error" && (
                        <ErrorBanner title={state.title} message={state.message} onRetry={state.retry ? onRetry : undefined} />
                    )}

                    {state.status === "done" && (
                        <div className="space-y-4">
                            <AnswerText answer={state.answer} urls={urls} />
                            {state.answer.truncated && <p className="text-sm text-ink-muted">This answer was cut short.</p>}
                            <p className="text-xs text-ink-subtle">
                                Summarized from article summaries only. Open the article for the full story.
                            </p>
                        </div>
                    )}
                </div>

                {thread.turns.length > 0 && <FollowUpForm pending={state.status === "loading"} onFollowUp={onFollowUp} />}
            </div>

            {thread.sources.length > 0 && (
                <div className="lg:border-l lg:border-line lg:pl-8">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Read the articles</p>
                    <ol aria-label="Sources" className="space-y-3">
                        {thread.sources.map((s) => (
                            <li key={s.n}>
                                <a href={s.url} {...external} className="group flex gap-3.5 rounded-lg bg-raised p-3 no-underline">
                                    <ArticleThumb src={s.imageUrl} className="h-[72px] w-24 shrink-0 rounded" />
                                    <span className="flex min-w-0 flex-col gap-1.5">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                                            {[String(s.n), s.source, relativeTime(s.publishedAt)].filter(Boolean).join(" · ")}
                                        </span>
                                        <span className="font-serif font-semibold leading-snug text-ink">{s.title}</span>
                                        {used(s.uses) && <span className="text-xs text-ink-muted">{used(s.uses)}</span>}
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ol>
                    {count > 1 && (
                        <p className="mt-3 text-xs text-ink-subtle">New articles a follow-up cites are added here, numbered in order.</p>
                    )}
                </div>
            )}
        </section>
    );
}
