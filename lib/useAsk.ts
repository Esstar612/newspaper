"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GENERAL } from "@/lib/categories";
import { cutToBytes } from "@/lib/format";
import type { When } from "@/lib/when";
import type { Article } from "@/components/ArticleCard";

type Source = { n: number; url: string; title: string; source?: string; publishedAt?: string; imageUrl?: string };

export type Answer = {
    segments: Array<{ text: string; cites: number[] }>;
    sources: Source[];
    related: Article[];
    truncated: boolean;
};

export type Thread = {
    turns: Array<{ question: string; answer: Answer }>;
    sources: Array<Source & { uses: number }>;
    when: When;
};

export type AskState =
    | { status: "idle" }
    | { status: "loading"; question: string; thread: Thread }
    | { status: "done"; question: string; answer: Answer; thread: Thread }
    | { status: "error"; question: string; title: string; message: string; retry: boolean; thread: Thread };

type History = Array<{ q: string; answer: string }>;

const EMPTY: Thread = { turns: [], sources: [], when: "any" };
const MAX_HISTORY = 2;
const MAX_ANSWER_BYTES = 4_000;

const isAnswer = (body: unknown): body is Answer => {
    const b = body as Answer | null;
    return (
        Array.isArray(b?.segments) &&
        Array.isArray(b?.sources) &&
        b.segments.every((s) => typeof s?.text === "string" && Array.isArray(s.cites)) &&
        b.sources.every((s) => typeof s?.n === "number" && typeof s.url === "string" && typeof s.title === "string") &&
        (b.related === undefined ||
            (Array.isArray(b.related) && b.related.every((a) => typeof a?.url === "string" && typeof a.title === "string")))
    );
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const plainText = (answer: Answer) => answer.segments.map((s) => s.text).join("");

function addTurn(thread: Thread, question: string, answer: Answer): { thread: Thread; answer: Answer } {
    const sources = thread.sources.map((s) => ({ ...s }));
    const number = new Map<number, number>();
    for (const s of answer.sources) {
        let known = sources.find((t) => t.url === s.url);
        if (!known) {
            known = { ...s, n: sources.length + 1, uses: 0 };
            sources.push(known);
        }
        known.uses++;
        number.set(s.n, known.n);
    }
    const remapped: Answer = {
        ...answer,
        segments: answer.segments.map((s) => ({ ...s, cites: s.cites.flatMap((n) => number.get(n) ?? []) })),
        sources: answer.sources.flatMap((s) => sources.find((t) => t.url === s.url) ?? []),
    };
    return {
        thread: { turns: [...thread.turns, { question, answer: remapped }], sources, when: thread.when },
        answer: remapped,
    };
}

export function useAsk() {
    const [state, setState] = useState<AskState>({ status: "idle" });
    const current = useRef<AbortController | null>(null);
    const thread = useRef<Thread>(EMPTY);

    const reset = useCallback(() => {
        current.current?.abort();
        current.current = null;
        thread.current = EMPTY;
        setState({ status: "idle" });
    }, []);

    const send = useCallback(async (question: string, category: string, earlier: Thread): Promise<AskState | null> => {
        current.current?.abort();
        const controller = new AbortController();
        current.current = controller;
        const settle = (next: AskState) => {
            if (current.current !== controller) return null;
            setState(next);
            return next;
        };
        const failed = (title: string, message: string, retry: boolean) =>
            settle({ status: "error", question, title, message, retry, thread: earlier });

        const history: History = earlier.turns
            .slice(-MAX_HISTORY)
            .map((t) => ({ q: t.question, answer: cutToBytes(plainText(t.answer), MAX_ANSWER_BYTES) }))
            .filter((h) => h.answer);

        setState({ status: "loading", question, thread: earlier });
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    q: question,
                    ...(category === GENERAL ? {} : { category }),
                    ...(earlier.when === "any" ? {} : { when: earlier.when }),
                    ...(earlier.turns.length ? { history } : {}),
                }),
                signal: controller.signal,
            });
            const body = await res.json();
            if (res.ok && isAnswer(body)) {
                if (current.current !== controller) return null;
                const next = addTurn(earlier, question, { ...body, related: body.related ?? [] });
                thread.current = next.thread;
                return settle({ status: "done", question, answer: next.answer, thread: next.thread });
            }
            if (res.status === 429) return failed("Too many questions", `You can ask again after ${clock(body.resetAt)}.`, false);
            if (res.status === 503) return failed("Ask isn't available yet", body.error, false);
            return failed("Could not get an answer", body?.error ?? `HTTP ${res.status}`, true);
        } catch {
            return failed("Could not get an answer", "Check your connection.", true);
        }
    }, []);

    const ask = useCallback(
        (question: string, category: string, when: When = "any") => {
            const fresh: Thread = { ...EMPTY, when };
            thread.current = fresh;
            return send(question, category, fresh);
        },
        [send]
    );

    const followUp = useCallback(
        (question: string, category: string) => send(question, category, thread.current),
        [send]
    );

    useEffect(() => () => current.current?.abort(), []);

    return { state, ask, followUp, reset };
}
