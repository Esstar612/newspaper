// @vitest-environment jsdom
import "../setup.dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "../msw";
import { makeArticle, makeArticles } from "../fixtures/articles";
import NewsPage from "@/app/news/page";

const replace = vi.fn();
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace }),
    useSearchParams: () => params,
}));

let requests: URL[] = [];

function serveNews(pages: Record<string, object>) {
    server.use(
        http.get("*/api/news", ({ request }) => {
            const url = new URL(request.url);
            requests.push(url);
            const key = [url.searchParams.get("q"), url.searchParams.get("cursor") ?? "first"].filter(Boolean).join(":");
            const body = pages[key];
            return HttpResponse.json(body ?? { articles: [], nextCursor: null });
        })
    );
}

const answer = (text: string) => ({ segments: [{ text, cites: [] }], sources: [], refused: false, truncated: false });

function serveAsk(body: object, status = 200) {
    const asked: unknown[] = [];
    server.use(
        http.post("*/api/ask", async ({ request }) => {
            asked.push(await request.json());
            return HttpResponse.json(body, { status });
        })
    );
    return asked;
}

const box = () => screen.getByRole("combobox", { name: "Search headlines or ask a question" });
const gridRequests = () => requests.filter((url) => url.searchParams.get("limit") === "20");

beforeEach(() => {
    replace.mockClear();
    params = new URLSearchParams();
    requests = [];
});

describe("News page", () => {
    it("moves to a section through the URL", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.click(screen.getByRole("tab", { name: "Business" }));
        expect(replace).toHaveBeenCalledWith("/news?category=business", { scroll: false });

        await user.click(screen.getByRole("tab", { name: "Top Stories" }));
        expect(replace).toHaveBeenLastCalledWith("/news", { scroll: false });
    });

    it("moves to the next tab with ArrowRight and focuses it", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        render(<NewsPage />);

        await screen.findByText("Story 01");
        screen.getByRole("tab", { name: "Top Stories" }).focus();
        await user.keyboard("{ArrowRight}");
        expect(replace).toHaveBeenLastCalledWith("/news?category=world", { scroll: false });
        await waitFor(() => expect(screen.getByRole("tab", { name: "World" })).toHaveFocus());
    });

    it("wraps from the first tab to the last with ArrowLeft", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        render(<NewsPage />);

        await screen.findByText("Story 01");
        screen.getByRole("tab", { name: "Top Stories" }).focus();
        await user.keyboard("{ArrowLeft}");
        expect(replace).toHaveBeenLastCalledWith("/news?category=sports", { scroll: false });
    });

    it("requests the section named in the URL", async () => {
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        render(<NewsPage />);

        await screen.findByText("Story 01");
        expect(requests[0].searchParams.get("category")).toBe("business");
        expect(requests[0].searchParams.get("limit")).toBe("20");
        expect(screen.getByRole("tab", { name: "Business" })).toHaveAttribute("aria-selected", "true");
    });

    it("appends the next page without duplicates, then hides Load more", async () => {
        const user = userEvent.setup();
        const first = makeArticles(20);
        const second = [first[19], ...makeArticles(24).slice(20)];
        serveNews({
            first: { articles: first, nextCursor: "c1" },
            c1: { articles: second, nextCursor: null },
        });
        render(<NewsPage />);

        await user.click(await screen.findByRole("button", { name: "Load more" }));
        await waitFor(() => expect(screen.getAllByRole("heading", { name: /^Story \d+$/ })).toHaveLength(24));
        expect(requests[1].searchParams.get("cursor")).toBe("c1");
        expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    });

    it("filters the grid to every match on Enter and keeps load-more, even when Ask fails", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({
            first: { articles: makeArticles(3), nextCursor: null },
            "rates:first": { articles: makeArticles(2, (i) => ({ title: `Match ${i}` })), nextCursor: "m1" },
            "rates:m1": { articles: [makeArticle(3, { title: "Match 3" })], nextCursor: null },
        });
        const asked = serveAsk({ error: "Search is not set up yet." }, 503);
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "rates{Enter}");
        expect(await screen.findByText("Stories matching your question · 2")).toBeInTheDocument();
        const filter = gridRequests().at(-1)!.searchParams;
        expect(filter.get("q")).toBe("rates");
        expect(filter.get("category")).toBe("business");
        expect(screen.queryByText("Story 01")).not.toBeInTheDocument();
        expect(screen.queryByText(/Newest story/)).not.toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("Ask isn't available yet");
        expect(asked).toEqual([{ q: "rates", category: "business" }]);

        await user.click(screen.getByRole("button", { name: "Load more" }));
        expect(await screen.findByText("Stories matching your question · 3")).toBeInTheDocument();
        expect(gridRequests().at(-1)!.searchParams.get("cursor")).toBe("m1");
        expect(gridRequests().at(-1)!.searchParams.get("q")).toBe("rates");
    });

    it("filters without asking when the query is too short to ask", async () => {
        const user = userEvent.setup();
        serveNews({
            first: { articles: makeArticles(3), nextCursor: null },
            "AI:first": { articles: makeArticles(1, () => ({ title: "AI story" })), nextCursor: null },
        });
        const asked = serveAsk(answer("unused"));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "AI{Enter}");
        expect(await screen.findByText("Stories matching your question · 1")).toBeInTheDocument();
        expect(screen.getByText("AI story")).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Answer" })).not.toBeInTheDocument();
        expect(asked).toEqual([]);
    });

    it("clears only the filter with Show all, and both with Close", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({
            first: { articles: makeArticles(3), nextCursor: null },
            "rates:first": { articles: makeArticles(1, () => ({ title: "Match 1" })), nextCursor: null },
        });
        serveAsk(answer("The bank held rates."));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "rates{Enter}");
        await screen.findByText("The bank held rates.");
        await user.click(screen.getByRole("button", { name: "Show all Business" }));
        expect(await screen.findByText("Story 01")).toBeInTheDocument();
        expect(screen.queryByText(/Stories matching your question/)).not.toBeInTheDocument();
        expect(screen.getByText("The bank held rates.")).toBeInTheDocument();

        await user.type(box(), "{Enter}");
        await screen.findByText("Stories matching your question · 1");
        await user.click(screen.getByRole("button", { name: "Close answer" }));
        expect(await screen.findByText("Story 01")).toBeInTheDocument();
        expect(screen.queryByText("The bank held rates.")).not.toBeInTheDocument();
        expect(screen.queryByText(/Stories matching your question/)).not.toBeInTheDocument();
    });

    it("shows the second answer when a new question replaces the first", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        server.use(
            http.post("*/api/ask", async ({ request }) => {
                const { q } = (await request.json()) as { q: string };
                return HttpResponse.json(answer(`Answer to ${q}`));
            })
        );
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "First question?{Enter}");
        await screen.findByText("Answer to First question?");
        await user.clear(box());
        await user.type(box(), "Second question?{Enter}");
        expect(await screen.findByText("Answer to Second question?")).toBeInTheDocument();
        expect(screen.queryByText("Answer to First question?")).not.toBeInTheDocument();
    });

    it("clears the filter and never shows a late answer after the section changes", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        let finished = false;
        server.use(
            http.post("*/api/ask", async () => {
                await delay(200);
                finished = true;
                return HttpResponse.json(answer("Too late."));
            })
        );
        const { rerender } = render(<NewsPage />);
        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByText("Finding an answer…");
        expect(await screen.findByText("Stories matching your question · 0")).toBeInTheDocument();

        params = new URLSearchParams("category=sports");
        rerender(<NewsPage />);
        await waitFor(() => expect(screen.queryByRole("region", { name: "Answer" })).not.toBeInTheDocument());
        await waitFor(() => expect(finished).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByText("Too late.")).not.toBeInTheDocument();
        expect(screen.queryByText(/Stories matching your question/)).not.toBeInTheDocument();
        expect(gridRequests().at(-1)!.searchParams.get("category")).toBe("sports");
        expect(gridRequests().at(-1)!.searchParams.has("q")).toBe(false);
        expect(box()).toHaveValue("");
    });

    it("retries the question that failed, even after the box is edited", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        serveAsk({ error: "The answer service is unavailable." }, 502);
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByRole("alert");
        await user.clear(box());
        await user.type(box(), "hi");
        const asked = serveAsk(answer("The bank held rates."));
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("The bank held rates.")).toBeInTheDocument();
        expect(asked).toEqual([{ q: "What did the bank do?", category: "business" }]);
    });

    it.each([
        [3, "3 articles · Newest story 2 hours ago"],
        [1, "1 article · Newest story 2 hours ago"],
    ])("counts %i loaded articles and dates the newest", async (count, line) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-28T14:00:00Z"));
        try {
            serveNews({ first: { articles: makeArticles(count).reverse(), nextCursor: null } });
            render(<NewsPage />);
            expect(await screen.findByText(line)).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows the reason when the feed fails", async () => {
        server.use(http.get("*/api/news", () => HttpResponse.json({ articles: [], error: "db down" }, { status: 500 })));
        render(<NewsPage />);

        expect(await screen.findByText("Could not load articles")).toBeInTheDocument();
        expect(screen.getByText("db down")).toBeInTheDocument();
    });
});
