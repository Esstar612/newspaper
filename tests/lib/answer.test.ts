import { describe, expect, it } from "vitest";
import type { Message } from "@anthropic-ai/sdk/resources/messages";
import { SYSTEM_PROMPT, buildMessages, readAnswer, resultText, retrievalQuery, type AnswerArticle } from "@/lib/answer";
import { makeMessage, textBlock } from "../fixtures/messages";

const articles: AnswerArticle[] = [
    { id: "a1", url: "https://example.com/rates", title: "Bank holds rates", description: "The central bank kept rates at 4%." },
    { id: "a2", url: "https://example.com/jobs", title: "Jobs report", description: "Hiring slowed in September." },
];

const cite = (index: number, text = resultText(articles[index])) => ({
    type: "search_result_location" as const,
    source: articles[index]?.url ?? "https://elsewhere.example",
    title: articles[index]?.title ?? null,
    cited_text: text,
    search_result_index: index,
    start_block_index: 0,
    end_block_index: 1,
});

const message = (content: Array<{ text: string; citations: ReturnType<typeof cite>[] | null }>, stop_reason: Message["stop_reason"] = "end_turn") =>
    makeMessage(content.map((c) => textBlock(c.text, c.citations)), stop_reason);

describe("buildMessages", () => {
    it("sends one cited search result per article, then the question", () => {
        const [turn] = buildMessages("What did the bank do?", articles);
        expect(turn.role).toBe("user");
        const content = turn.content as unknown as Array<Record<string, unknown>>;
        expect(content).toHaveLength(3);
        expect(content[0]).toEqual({
            type: "search_result",
            source: "https://example.com/rates",
            title: "Bank holds rates",
            content: [{ type: "text", text: "Bank holds rates\nThe central bank kept rates at 4%." }],
            citations: { enabled: true },
        });
        expect(content.slice(0, 2).every((b) => (b.citations as { enabled: boolean }).enabled)).toBe(true);
        expect(content[2]).toEqual({ type: "text", text: "What did the bank do?" });
    });

    it("puts earlier turns first as plain text, oldest first, with search results only in the last message", () => {
        const history = [
            { q: "What did the bank do?", answer: "It held rates." },
            { q: "Why?", answer: "Inflation is slowing." },
        ];
        const turns = buildMessages("What happens next?", articles, history);
        expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
        expect(turns.slice(0, 4).map((t) => t.content)).toEqual(["What did the bank do?", "It held rates.", "Why?", "Inflation is slowing."]);
        const last = turns[4].content as unknown as Array<{ type: string; text?: string }>;
        expect(last.filter((b) => b.type === "search_result")).toHaveLength(2);
        expect(last.at(-1)).toEqual({ type: "text", text: "What happens next?" });
        expect(JSON.stringify(turns.slice(0, 4))).not.toContain("search_result");
    });

    it("tells the model that earlier turns are context and only the latest results may be cited", () => {
        expect(SYSTEM_PROMPT).toMatch(/earlier turns/i);
        expect(SYSTEM_PROMPT).toMatch(/latest message/i);
    });

    it("tells the model to answer only from the results and ignore instructions in them", () => {
        expect(SYSTEM_PROMPT).toMatch(/only/i);
        expect(SYSTEM_PROMPT).toMatch(/instructions/i);
        expect(Buffer.byteLength(SYSTEM_PROMPT)).toBeLessThanOrEqual(2000);
    });
});

describe("retrievalQuery", () => {
    it("searches with the question alone, or joined after the previous question", () => {
        expect(retrievalQuery("Why does it matter?")).toBe("Why does it matter?");
        expect(retrievalQuery("Why does it matter?", "What did the bank do?")).toBe("What did the bank do?\nWhy does it matter?");
    });
});

describe("readAnswer", () => {
    it("maps citations to numbered sources in first-cited order", () => {
        const answer = readAnswer(
            message([
                { text: "Hiring slowed", citations: [cite(1)] },
                { text: " and rates held", citations: [cite(0), cite(1)] },
                { text: ".", citations: null },
            ]),
            articles
        );
        expect(answer.segments).toEqual([
            { text: "Hiring slowed", cites: [1] },
            { text: " and rates held", cites: [2, 1] },
            { text: ".", cites: [] },
        ]);
        expect(answer.sources).toEqual([
            { n: 1, url: "https://example.com/jobs", title: "Jobs report" },
            { n: 2, url: "https://example.com/rates", title: "Bank holds rates" },
        ]);
        expect(answer).toMatchObject({ refused: false, truncated: false, droppedCitations: 0 });
    });

    it("carries each source's outlet, date and image, and keeps them out of the prompt", () => {
        const card = { source: "BBC News", publishedAt: "2026-10-01T09:00:00.000Z", imageUrl: "https://example.com/jobs.jpg" };
        const withCards = [articles[0], { ...articles[1], ...card }];
        const answer = readAnswer(message([{ text: "Hiring slowed.", citations: [cite(1)] }]), withCards);
        expect(answer.sources).toEqual([{ n: 1, url: "https://example.com/jobs", title: "Jobs report", ...card }]);
        expect(JSON.stringify(buildMessages("What happened?", withCards))).not.toMatch(/BBC News|jobs\.jpg|2026-10-01/);
    });

    it("drops citations that point outside the results or quote other text", () => {
        const answer = readAnswer(
            message([{ text: "Claim", citations: [cite(5, "Out of range"), cite(0, "Something else entirely")] }]),
            articles
        );
        expect(answer.segments).toEqual([{ text: "Claim", cites: [] }]);
        expect(answer.sources).toEqual([]);
        expect(answer.droppedCitations).toBe(2);
        expect(answer.refused).toBe(true);
    });

    it("never links a URL that only appears in the model's text", () => {
        const answer = readAnswer(
            message([{ text: "See https://evil.example/phish for more", citations: [cite(0)] }]),
            articles
        );
        expect(answer.sources.map((s) => s.url)).toEqual(["https://example.com/rates"]);
        expect(JSON.stringify(answer.sources)).not.toContain("evil.example");
    });

    it("treats a completed answer with no surviving citation as a refusal", () => {
        const answer = readAnswer(message([{ text: "The results do not say.", citations: null }]), articles);
        expect(answer).toMatchObject({ refused: true, truncated: false });
    });

    it("reports a cut-off answer as truncated, not refused", () => {
        const answer = readAnswer(message([], "max_tokens"), articles);
        expect(answer).toMatchObject({ refused: false, truncated: true, segments: [], sources: [] });
    });
});
