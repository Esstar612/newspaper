// @vitest-environment jsdom
import "../setup.dom";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { server } from "../msw";
import { useAsk, type AskState } from "@/lib/useAsk";

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
        expect(result.current.state).toEqual({ status: "loading", question: "What did the bank do?" });
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
