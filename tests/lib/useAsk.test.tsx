// @vitest-environment jsdom
import "../setup.dom";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { server } from "../msw";
import { useAsk, type AskState } from "@/lib/useAsk";
import { utf8Bytes } from "@/lib/format";

const answer = (text: string, related: object[] = []) => ({ segments: [{ text, cites: [] }], sources: [], related, refused: false, truncated: false });

function serve(body: Record<string, unknown>, status = 200) {
    const sent: unknown[] = [];
    server.use(
        http.post("*/api/ask", async ({ request }) => {
            sent.push(await request.json());
            return HttpResponse.json(body, { status });
        })
    );
    return sent;
}

function track() {
    const states: AskState[] = [];
    const hook = renderHook(
        () => {
            const result = useAsk();
            states.push(result.state);
            return result;
        },
        { wrapper: StrictMode }
    );
    return { ...hook, states };
}

const settled = (result: { current: { state: AskState } }) =>
    waitFor(() => expect(["done", "error"]).toContain(result.current.state.status));

describe("useAsk", () => {
    it("sends one request per ask under Strict Mode", async () => {
        const sent = serve(answer("Rates held."));
        const { result } = track();
        act(() => void result.current.ask("What did the bank do?", "business"));
        expect(result.current.state).toEqual({ status: "loading", question: "What did the bank do?", thread: { turns: [], sources: [], when: "any" } });
        await settled(result);
        expect(result.current.state).toMatchObject({ status: "done", question: "What did the bank do?", answer: answer("Rates held.") });
        expect(sent).toEqual([{ q: "What did the bank do?", category: "business" }]);
    });

    it("leaves the section out for Top Stories", async () => {
        const sent = serve(answer("Rates held."));
        const { result } = track();
        act(() => void result.current.ask("What did the bank do?", "general"));
        await settled(result);
        expect(sent).toEqual([{ q: "What did the bank do?" }]);
    });

    it("explains the limit with its reset time and offers no retry", async () => {
        serve({ error: "Too many questions.", scope: "ip", resetAt: "2026-10-01T15:00:00.000Z" }, 429);
        const { result } = track();
        act(() => void result.current.ask("What did the bank do?", "business"));
        await settled(result);
        const time = new Date("2026-10-01T15:00:00.000Z").toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        expect(result.current.state).toEqual({
            status: "error",
            question: "What did the bank do?",
            title: "Too many questions",
            message: `You can ask again after ${time}.`,
            retry: false,
            thread: { turns: [], sources: [], when: "any" },
        });
    });

    it("says Ask is not set up on a 503", async () => {
        serve({ error: "Search is not set up yet." }, 503);
        const { result } = track();
        act(() => void result.current.ask("What did the bank do?", "business"));
        await settled(result);
        expect(result.current.state).toMatchObject({ title: "Ask isn't available yet", message: "Search is not set up yet.", retry: false });
    });

    it("offers a retry after a server failure", async () => {
        serve({ error: "The answer service is unavailable." }, 502);
        const { result } = track();
        act(() => void result.current.ask("What did the bank do?", "business"));
        await settled(result);
        expect(result.current.state).toMatchObject({ title: "Could not get an answer", message: "The answer service is unavailable.", retry: true });
    });

    it.each([
        ["no answer at all", { error: "proxy says hi" }],
        ["a segment without citations", { segments: [{ text: "ok" }], sources: [] }],
        ["a source that is not a source", { segments: [{ text: "ok", cites: [] }], sources: [null] }],
        ["a related story without a link", { segments: [{ text: "ok", cites: [] }], sources: [], related: [{ title: "No link" }] }],
    ])("treats a 200 with %s as an error, and resolves to that error", async (_, body) => {
        serve(body);
        const { result } = track();
        let resolved: AskState | null = null;
        await act(async () => {
            resolved = await result.current.ask("What did the bank do?", "business");
        });
        expect(result.current.state).toMatchObject({ status: "error", title: "Could not get an answer" });
        expect(resolved).toEqual(result.current.state);
    });

    it("resolves to the error state after a server failure", async () => {
        serve({ error: "The answer service is unavailable." }, 502);
        const { result } = track();
        let resolved: AskState | null = null;
        await act(async () => {
            resolved = await result.current.ask("What did the bank do?", "business");
        });
        expect(resolved).toMatchObject({ status: "error", retry: true });
    });

    it("reads a reply without related stories as having none", async () => {
        serve({ segments: [{ text: "Rates held.", cites: [] }], sources: [], refused: false, truncated: false });
        const { result } = track();
        let resolved: AskState | null = null;
        await act(async () => {
            resolved = await result.current.ask("What did the bank do?", "business");
        });
        expect(resolved).toMatchObject({ status: "done", answer: { related: [] } });
    });

    it("passes related stories through", async () => {
        const related = [{ _id: "r1", title: "Related", url: "https://example.com/r1", source: "BBC News" }];
        serve(answer("Rates held.", related));
        const { result } = track();
        act(() => void result.current.ask("What did the bank do?", "business"));
        await settled(result);
        expect(result.current.state).toMatchObject({ status: "done", answer: { related } });
    });

    it("asks the reader to check their connection when the request cannot be sent", async () => {
        server.use(http.post("*/api/ask", () => HttpResponse.error()));
        const { result } = track();
        act(() => void result.current.ask("What did the bank do?", "business"));
        await settled(result);
        expect(result.current.state).toMatchObject({ status: "error", message: "Check your connection.", retry: true });
    });

    it("replaces a slow answer with the next question's, without an error in between", async () => {
        const sent: string[] = [];
        const finished: string[] = [];
        server.use(
            http.post("*/api/ask", async ({ request }) => {
                const { q } = (await request.json()) as { q: string };
                sent.push(q);
                await delay(q === "First question?" ? 200 : 50);
                finished.push(q);
                return HttpResponse.json(answer(`Answer to ${q}`));
            })
        );
        const { result, states } = track();
        let first: Promise<AskState | null> = Promise.resolve(null);
        act(() => {
            first = result.current.ask("First question?", "business");
        });
        act(() => void result.current.ask("Second question?", "business"));
        expect(await first).toBeNull();
        await waitFor(() => expect(finished).toContain("First question?"));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(sent).toEqual(["First question?", "Second question?"]);
        expect(states.some((s) => s.status === "error")).toBe(false);
        expect(result.current.state).toMatchObject({ question: "Second question?", answer: answer("Answer to Second question?") });
    });

    it("drops an answer that lands after a reset", async () => {
        let finished = false;
        server.use(
            http.post("*/api/ask", async () => {
                await delay(100);
                finished = true;
                return HttpResponse.json(answer("Too late."));
            })
        );
        const { result, states } = track();
        act(() => void result.current.ask("What did the bank do?", "business"));
        act(() => result.current.reset());
        await waitFor(() => expect(finished).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(result.current.state).toEqual({ status: "idle" });
        expect(states.some((s) => s.status === "done" || s.status === "error")).toBe(false);
    });
});

const source = (n: number, id: string, extra: Record<string, unknown> = {}) => ({
    n,
    url: `https://example.com/${id}`,
    title: `Story ${id}`,
    source: "BBC News",
    ...extra,
});

function serveByQuestion(replies: Record<string, object>) {
    const sent: Array<{ q: string; category?: string; history?: Array<{ q: string; answer: string }> }> = [];
    server.use(
        http.post("*/api/ask", async ({ request }) => {
            const body = (await request.json()) as (typeof sent)[number];
            sent.push(body);
            return HttpResponse.json(replies[body.q]);
        })
    );
    return sent;
}

async function run(result: { current: ReturnType<typeof useAsk> }, step: (hook: ReturnType<typeof useAsk>) => Promise<AskState | null>) {
    let resolved: AskState | null = null;
    await act(async () => {
        resolved = await step(result.current);
    });
    return resolved as AskState | null;
}

describe("useAsk threads", () => {
    it("sends the earlier turns as plain-text history, oldest first, at most two", async () => {
        const sent = serveByQuestion({
            "First question?": { ...answer("First answer"), segments: [{ text: "First answer", cites: [1] }], sources: [source(1, "a")] },
            "Second question?": answer("Second answer."),
            "Third question?": answer("Third answer."),
            "Fourth question?": answer("Fourth answer."),
        });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business"));
        await run(result, (h) => h.followUp("Second question?", "business"));
        await run(result, (h) => h.followUp("Third question?", "business"));
        await run(result, (h) => h.followUp("Fourth question?", "business"));
        expect(sent[0]).toEqual({ q: "First question?", category: "business" });
        expect(sent[1].history).toEqual([{ q: "First question?", answer: "First answer" }]);
        expect(sent[2].history).toEqual([
            { q: "First question?", answer: "First answer" },
            { q: "Second question?", answer: "Second answer." },
        ]);
        expect(sent[3].history?.map((h) => h.q)).toEqual(["Second question?", "Third question?"]);
    });

    it("cuts a long earlier answer to 4,000 bytes on a character boundary", async () => {
        const long = "日本".repeat(1000);
        const sent = serveByQuestion({ "First question?": answer(long), "Second question?": answer("Short.") });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business"));
        await run(result, (h) => h.followUp("Second question?", "business"));
        const sentAnswer = sent[1].history![0].answer;
        expect(utf8Bytes(sentAnswer)).toBeLessThanOrEqual(4000);
        expect(long.startsWith(sentAnswer)).toBe(true);
    });

    it("leaves out an earlier turn whose answer has no text", async () => {
        const sent = serveByQuestion({
            "First question?": { ...answer(""), segments: [], truncated: true },
            "Second question?": answer("Second answer."),
        });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business"));
        await run(result, (h) => h.followUp("Second question?", "business"));
        expect(sent[1].history).toEqual([]);
    });

    it("keeps one number per source across the thread and counts the answers that use it", async () => {
        serveByQuestion({
            "First question?": {
                ...answer(""),
                segments: [{ text: "One", cites: [1] }, { text: " two", cites: [2] }],
                sources: [source(1, "a", { publishedAt: "2026-10-01T09:00:00.000Z" }), source(2, "b")],
            },
            "Second question?": {
                ...answer(""),
                segments: [{ text: "New", cites: [1] }, { text: " and old", cites: [2] }],
                sources: [source(1, "c"), source(2, "a")],
            },
        });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business"));
        const done = await run(result, (h) => h.followUp("Second question?", "business"));
        if (done?.status !== "done") throw new Error("expected an answer");
        expect(done.thread.turns.map((t) => t.question)).toEqual(["First question?", "Second question?"]);
        expect(done.thread.turns[1].answer.segments).toEqual([
            { text: "New", cites: [3] },
            { text: " and old", cites: [1] },
        ]);
        expect(done.thread.sources.map((s) => [s.n, s.url, s.uses])).toEqual([
            [1, "https://example.com/a", 2],
            [2, "https://example.com/b", 1],
            [3, "https://example.com/c", 1],
        ]);
        expect(done.thread.sources[0].publishedAt).toBe("2026-10-01T09:00:00.000Z");
    });

    it("keeps the earlier turns while a follow-up is pending or fails", async () => {
        serveByQuestion({ "First question?": answer("First answer.") });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business"));
        server.use(http.post("*/api/ask", () => HttpResponse.json({ error: "The answer service is unavailable." }, { status: 502 })));
        const failed = await run(result, (h) => h.followUp("Second question?", "business"));
        expect(failed).toMatchObject({ status: "error", question: "Second question?", retry: true });
        expect(failed!.status !== "idle" && failed!.thread.turns.map((t) => t.question)).toEqual(["First question?"]);
    });

    it("starts a new thread when the top box asks again", async () => {
        const sent = serveByQuestion({
            "First question?": answer("First answer."),
            "Second question?": answer("Second answer."),
            "New topic?": answer("New answer."),
        });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business"));
        await run(result, (h) => h.followUp("Second question?", "business"));
        const fresh = await run(result, (h) => h.ask("New topic?", "business"));
        expect(sent[2].history).toBeUndefined();
        expect(fresh!.status !== "idle" && fresh!.thread.turns.map((t) => t.question)).toEqual(["New topic?"]);
    });

    it("drops a follow-up's reply after a reset", async () => {
        serveByQuestion({ "First question?": answer("First answer.") });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business"));
        let finished = false;
        server.use(
            http.post("*/api/ask", async () => {
                await delay(100);
                finished = true;
                return HttpResponse.json(answer("Too late."));
            })
        );
        let pending: Promise<AskState | null> = Promise.resolve(null);
        act(() => {
            pending = result.current.followUp("Second question?", "business");
        });
        act(() => result.current.reset());
        expect(await pending).toBeNull();
        await waitFor(() => expect(finished).toBe(true));
        expect(result.current.state).toEqual({ status: "idle" });
    });
});

describe("useAsk windows", () => {
    it("sends the window it was asked with, and leaves it out for any time", async () => {
        const sent = serveByQuestion({ "First question?": answer("First."), "Other question?": answer("Other.") });
        const { result } = track();
        const done = await run(result, (h) => h.ask("First question?", "business", "week"));
        expect(sent[0]).toEqual({ q: "First question?", category: "business", when: "week" });
        expect(done!.status !== "idle" && done!.thread.when).toBe("week");
        await run(result, (h) => h.ask("Other question?", "business", "any"));
        expect(sent[1]).toEqual({ q: "Other question?", category: "business" });
    });

    it("keeps the thread's window for follow-ups", async () => {
        const sent = serveByQuestion({ "First question?": answer("First."), "Second question?": answer("Second.") });
        const { result } = track();
        await run(result, (h) => h.ask("First question?", "business", "month"));
        await run(result, (h) => h.followUp("Second question?", "business"));
        expect(sent[1]).toMatchObject({ q: "Second question?", when: "month" });
    });

    it("keeps the window on a failed first question", async () => {
        server.use(http.post("*/api/ask", () => HttpResponse.json({ error: "The answer service is unavailable." }, { status: 502 })));
        const { result } = track();
        const failed = await run(result, (h) => h.ask("First question?", "business", "week"));
        expect(failed!.status !== "idle" && failed!.thread.when).toBe("week");
    });
});
