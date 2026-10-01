"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GENERAL } from "@/lib/categories";
import type { Article } from "@/components/ArticleCard";

export type Answer = {
    segments: Array<{ text: string; cites: number[] }>;
    sources: Array<{ n: number; url: string; title: string }>;
    related: Article[];
    truncated: boolean;
};

export type AskState =
    | { status: "idle" }
    | { status: "loading"; question: string }
    | { status: "done"; question: string; answer: Answer }
    | { status: "error"; question: string; title: string; message: string; retry: boolean };

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

export function useAsk() {
    const [state, setState] = useState<AskState>({ status: "idle" });
    const current = useRef<AbortController | null>(null);

    const reset = useCallback(() => {
        current.current?.abort();
        current.current = null;
        setState({ status: "idle" });
    }, []);

    const ask = useCallback(async (question: string, category: string): Promise<AskState | null> => {
        current.current?.abort();
        const controller = new AbortController();
        current.current = controller;
        const settle = (next: AskState) => {
            if (current.current !== controller) return null;
            setState(next);
            return next;
        };
        const failed = (title: string, message: string, retry: boolean) =>
            settle({ status: "error", question, title, message, retry });

        setState({ status: "loading", question });
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(category === GENERAL ? { q: question } : { q: question, category }),
                signal: controller.signal,
            });
            const body = await res.json();
            if (res.ok && isAnswer(body)) {
                return settle({ status: "done", question, answer: { ...body, related: body.related ?? [] } });
            }
            if (res.status === 429) return failed("Too many questions", `You can ask again after ${clock(body.resetAt)}.`, false);
            if (res.status === 503) return failed("Ask isn't available yet", body.error, false);
            return failed("Could not get an answer", body?.error ?? `HTTP ${res.status}`, true);
        } catch {
            return failed("Could not get an answer", "Check your connection.", true);
        }
    }, []);

    useEffect(() => () => current.current?.abort(), []);

    return { state, ask, reset };
}
