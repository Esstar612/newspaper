"use client";

import { useState, type FormEvent } from "react";
import { GENERAL } from "@/lib/categories";
import { Button, ErrorBanner, TextField } from "@/components/ui";

type Answer = {
    segments: Array<{ text: string; cites: number[] }>;
    sources: Array<{ n: number; url: string; title: string }>;
    truncated: boolean;
};

type State =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; question: string; answer: Answer }
    | { status: "error"; title: string; message: string; retry: string | null };

const bytes = (text: string) => new TextEncoder().encode(text.trim()).length;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function AskPanel({ category }: { category: string }) {
    const [question, setQuestion] = useState("");
    const [state, setState] = useState<State>({ status: "idle" });
    const size = bytes(question);
    const valid = size >= 3 && size <= 300;

    async function ask(q: string) {
        setState({ status: "loading" });
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(category === GENERAL ? { q } : { q, category }),
            });
            const body = await res.json();
            if (res.ok && Array.isArray(body?.segments) && Array.isArray(body?.sources)) {
                return setState({ status: "done", question: q, answer: body });
            }
            if (res.status === 429) {
                return setState({
                    status: "error",
                    title: "Too many questions",
                    message: `You can ask again after ${clock(body.resetAt)}.`,
                    retry: null,
                });
            }
            if (res.status === 503) {
                return setState({ status: "error", title: "Ask isn't available yet", message: body.error, retry: null });
            }
            setState({ status: "error", title: "Could not get an answer", message: body?.error ?? `HTTP ${res.status}`, retry: q });
        } catch {
            setState({ status: "error", title: "Could not get an answer", message: "Check your connection.", retry: q });
        }
    }

    const submit = (e: FormEvent) => {
        e.preventDefault();
        if (valid) ask(question.trim());
    };

    return (
        <section aria-label="Ask about recent news" className="mb-8 rounded-lg border border-line bg-surface p-5">
            <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <TextField
                    label="Ask about recent news"
                    hideLabel
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    readOnly={state.status === "loading"}
                    placeholder="Ask a question about this section…"
                    className="min-w-0 flex-1"
                />
                <Button type="submit" disabled={state.status === "loading" || !valid}>
                    Ask
                </Button>
            </form>
            {size > 300 && <p className="mt-2 text-sm text-ink-muted">That question is too long. Please shorten it.</p>}

            <div aria-live="polite" className="mt-4">
                {state.status === "loading" && <p className="text-base text-ink-muted">Finding an answer…</p>}

                {state.status === "error" && (
                    <ErrorBanner title={state.title} message={state.message} onRetry={state.retry ? () => ask(state.retry!) : undefined} />
                )}

                {state.status === "done" && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-ink-muted">{state.question}</h3>
                        <p className="text-lg leading-relaxed text-ink">
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
                    </div>
                )}
            </div>
        </section>
    );
}
