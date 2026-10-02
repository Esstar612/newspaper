// @vitest-environment jsdom
import "../setup.dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

const answer = (text: string, related: object[] = []) => ({ segments: [{ text, cites: [] }], sources: [], related, refused: false, truncated: false });
const relatedStories = (...titles: string[]) => titles.map((title, i) => makeArticle(40 + i, { title, tags: ["business"] }));

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

    it("keeps the whole section under the answer when a question matches no headline", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        serveAsk(answer("The bank held rates."));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        expect(await screen.findByText("The bank held rates.")).toBeInTheDocument();
        await waitFor(() => expect(gridRequests().at(-1)!.searchParams.has("q")).toBe(false));
        expect(await screen.findByText("Story 01")).toBeInTheDocument();
        expect(screen.queryByText(/Stories matching your question/)).not.toBeInTheDocument();
        expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
        expect(gridRequests().map((u) => u.searchParams.get("q"))).toEqual([null, "What did the bank do?", null]);
    });

    it("keeps the latest query's grid when an earlier one answers late", async () => {
        const user = userEvent.setup();
        let slowDone = false;
        let pending = 0;
        server.use(
            http.get("*/api/news", async ({ request }) => {
                const url = new URL(request.url);
                requests.push(url);
                const q = url.searchParams.get("q");
                pending++;
                try {
                    if (q === "Slow question here") {
                        await delay(200);
                        slowDone = true;
                        return HttpResponse.json({ articles: [], nextCursor: null });
                    }
                    if (q === "rates") return HttpResponse.json({ articles: makeArticles(1, () => ({ title: "Rates match" })), nextCursor: null });
                    return HttpResponse.json({ articles: makeArticles(3), nextCursor: null });
                } finally {
                    pending--;
                }
            })
        );
        serveAsk(answer("An answer."));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "Slow question here{Enter}");
        await user.clear(box());
        await user.type(box(), "rates{Enter}");
        expect(await screen.findByText("Stories matching your question · 1")).toBeInTheDocument();
        await waitFor(() => expect(slowDone).toBe(true));
        await waitFor(() => expect(pending).toBe(0));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.getByText("Stories matching your question · 1")).toBeInTheDocument();
        expect(screen.getByText("Rates match")).toBeInTheDocument();
    });

    it("restores the section when a retried question still matches nothing", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        let failed = false;
        server.use(
            http.get("*/api/news", ({ request }) => {
                const url = new URL(request.url);
                if (!url.searchParams.has("q") || failed) return;
                failed = true;
                requests.push(url);
                return HttpResponse.json({ articles: [], error: "db down" }, { status: 500 });
            })
        );
        serveAsk(answer("An answer."));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        expect(await screen.findByText("Could not load articles")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Story 01")).toBeInTheDocument();
        expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Stories matching your question/)).not.toBeInTheDocument();
    });

    it("keeps the question so Try again re-runs it when the section fallback fails", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        let filtered = 0;
        let section = 0;
        server.use(
            http.get("*/api/news", ({ request }) => {
                const url = new URL(request.url);
                requests.push(url);
                if (url.searchParams.get("limit") !== "20") return HttpResponse.json({ articles: [], nextCursor: null });
                if (url.searchParams.get("q")) {
                    filtered++;
                    if (filtered === 1) return HttpResponse.json({ articles: [], nextCursor: null });
                    return HttpResponse.json({ articles: makeArticles(1, () => ({ title: "Bank story" })), nextCursor: null });
                }
                section++;
                if (section === 2) return HttpResponse.json({ articles: [], error: "db down" }, { status: 500 });
                return HttpResponse.json({ articles: makeArticles(3), nextCursor: null });
            })
        );
        serveAsk(answer("An answer."));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        expect(await screen.findByText("db down")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Stories matching your question · 1")).toBeInTheDocument();
        expect(gridRequests().at(-1)!.searchParams.get("q")).toBe("What did the bank do?");
        expect([filtered, section]).toEqual([2, 2]);
    });

    it("shows the loading state for a search started during Load more", async () => {
        const user = userEvent.setup();
        server.use(
            http.get("*/api/news", async ({ request }) => {
                const url = new URL(request.url);
                requests.push(url);
                if (url.searchParams.get("cursor")) await delay(300);
                if (url.searchParams.get("q")) {
                    await delay(100);
                    return HttpResponse.json({ articles: makeArticles(1, () => ({ title: "Match" })), nextCursor: null });
                }
                return HttpResponse.json({ articles: makeArticles(20), nextCursor: "c1" });
            })
        );
        render(<NewsPage />);

        await user.click(await screen.findByRole("button", { name: "Load more" }));
        await user.type(box(), "AI{Enter}");
        expect(screen.getByLabelText("Loading articles")).toBeInTheDocument();
        expect(await screen.findByText("Match")).toBeInTheDocument();
    });

    it("hides Load more while a new search is loading", async () => {
        const user = userEvent.setup();
        server.use(
            http.get("*/api/news", async ({ request }) => {
                const url = new URL(request.url);
                requests.push(url);
                if (url.searchParams.get("q")) {
                    await delay(200);
                    return HttpResponse.json({ articles: makeArticles(1, () => ({ title: "Match" })), nextCursor: null });
                }
                return HttpResponse.json({ articles: makeArticles(20), nextCursor: "c1" });
            })
        );
        render(<NewsPage />);

        await screen.findByRole("button", { name: "Load more" });
        await user.type(box(), "AI{Enter}");
        expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
        expect(await screen.findByText("Match")).toBeInTheDocument();
    });

    it("still says there are no results for a search that does not ask", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "AI{Enter}");
        expect(await screen.findByText("No results for “AI”")).toBeInTheDocument();
        expect(screen.getByText("Stories matching your question · 0")).toBeInTheDocument();
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

    it("keeps the first question's related stories through a follow-up, without reloading the grid", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        const asked: Array<{ q: string; history?: unknown[] }> = [];
        server.use(
            http.post("*/api/ask", async ({ request }) => {
                const body = (await request.json()) as { q: string; history?: unknown[] };
                asked.push(body);
                return body.q === "What did the bank do?"
                    ? HttpResponse.json(answer("The bank held rates.", relatedStories("Related one")))
                    : HttpResponse.json(answer("Inflation is slowing.", relatedStories("Follow-up related")));
            })
        );
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByText("Stories related to your question · 1");
        const newsRequests = requests.length;
        await user.type(screen.getByRole("textbox", { name: "Ask a follow-up" }), "Why did it hold?{Enter}");
        expect(await screen.findByText("Inflation is slowing.")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Answer thread" })).toBeInTheDocument();
        expect(screen.getByText("Stories related to your question · 1")).toBeInTheDocument();
        expect(screen.getByText("Related one")).toBeInTheDocument();
        expect(screen.queryByText("Follow-up related")).not.toBeInTheDocument();
        expect(requests).toHaveLength(newsRequests);
        expect(asked[1]).toEqual({ q: "Why did it hold?", category: "business", history: [{ q: "What did the bank do?", answer: "The bank held rates." }] });
    });

    it("retries a failed follow-up as a follow-up", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        serveAsk(answer("The bank held rates.", relatedStories("Related one")));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByText("Related one");
        serveAsk({ error: "The answer service is unavailable." }, 502);
        await user.type(screen.getByRole("textbox", { name: "Ask a follow-up" }), "Why did it hold?{Enter}");
        await screen.findByRole("alert");
        const asked = serveAsk(answer("Inflation is slowing."));
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Inflation is slowing.")).toBeInTheDocument();
        expect(asked).toEqual([{ q: "Why did it hold?", history: [{ q: "What did the bank do?", answer: "The bank held rates." }] }]);
        expect(screen.getByText("Related one")).toBeInTheDocument();
    });

    it("shows the stories related to an answered question in place of the section", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(20), nextCursor: "c1" } });
        serveAsk(answer("The bank held rates.", relatedStories("Related one", "Related two")));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        expect(await screen.findByText("Stories related to your question · 2")).toBeInTheDocument();
        const panel = screen.getByRole("tabpanel");
        expect(within(panel).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Related one", "Related two"]);
        expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
        expect(screen.queryByText(/Newest story/)).not.toBeInTheDocument();
        expect(gridRequests().some((u) => u.searchParams.has("q"))).toBe(false);
    });

    it("keeps the section while the answer is pending", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        server.use(
            http.post("*/api/ask", async () => {
                await delay(200);
                return HttpResponse.json(answer("Later.", relatedStories("Related one")));
            })
        );
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByText("Finding an answer…");
        expect(screen.getByText("Story 01")).toBeInTheDocument();
        expect(screen.getByText(/3 articles · Newest story/)).toBeInTheDocument();
        expect(await screen.findByText("Related one")).toBeInTheDocument();
        expect(gridRequests()).toHaveLength(1);
    });

    it("restores the section with Show all and keeps the answer; Close clears both", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        serveAsk(answer("The bank held rates.", relatedStories("Related one")));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByText("Stories related to your question · 1");
        await user.click(screen.getByRole("button", { name: "Show all Business" }));
        expect(screen.getByText("Story 01")).toBeInTheDocument();
        expect(screen.queryByText("Related one")).not.toBeInTheDocument();
        expect(screen.getByText("The bank held rates.")).toBeInTheDocument();
        expect(gridRequests()).toHaveLength(1);

        await user.type(box(), "{Enter}");
        await screen.findByText("Stories related to your question · 1");
        await user.click(screen.getByRole("button", { name: "Close answer" }));
        expect(screen.getByText("Story 01")).toBeInTheDocument();
        expect(screen.queryByText("Related one")).not.toBeInTheDocument();
        expect(screen.queryByText("The bank held rates.")).not.toBeInTheDocument();
    });

    it.each([
        ["a 503", () => HttpResponse.json({ error: "Search is not set up yet." }, { status: 503 })],
        ["a 429", () => HttpResponse.json({ error: "Too many questions.", scope: "ip", resetAt: "2026-10-01T15:00:00.000Z" }, { status: 429 })],
        ["a 502", () => HttpResponse.json({ error: "The answer service is unavailable." }, { status: 502 })],
        ["a network failure", () => HttpResponse.error()],
        ["an answer with no related stories", () => HttpResponse.json(answer("No recent articles match that question."))],
    ])("falls back to the keyword filter after %s", async (_, respond) => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({
            first: { articles: makeArticles(3), nextCursor: null },
            "rates:first": { articles: makeArticles(1, () => ({ title: "Rates match" })), nextCursor: null },
        });
        server.use(http.post("*/api/ask", respond));
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "rates{Enter}");
        expect(await screen.findByText("Stories matching your question · 1")).toBeInTheDocument();
        expect(screen.getByText("Rates match")).toBeInTheDocument();
        const filter = gridRequests().at(-1)!.searchParams;
        expect([filter.get("q"), filter.get("category")]).toEqual(["rates", "business"]);
    });

    it("shows the related stories of a refused answer too", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        serveAsk({ ...answer("The results do not say."), refused: true, related: relatedStories("Nearest story") });
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        expect(await screen.findByText("Stories related to your question · 1")).toBeInTheDocument();
        expect(screen.getByText("Nearest story")).toBeInTheDocument();
    });

    it("shows only the newest question's related stories", async () => {
        const user = userEvent.setup();
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        let finished = false;
        server.use(
            http.post("*/api/ask", async ({ request }) => {
                const { q } = (await request.json()) as { q: string };
                if (q === "First question?") {
                    await delay(200);
                    finished = true;
                    return HttpResponse.json(answer("Old.", relatedStories("Old related")));
                }
                return HttpResponse.json(answer("New.", relatedStories("New related")));
            })
        );
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "First question?{Enter}");
        await user.clear(box());
        await user.type(box(), "Second question?{Enter}");
        expect(await screen.findByText("New related")).toBeInTheDocument();
        await waitFor(() => expect(finished).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByText("Old related")).not.toBeInTheDocument();
        expect(screen.getByText("New related")).toBeInTheDocument();
    });

    it("clears an earlier keyword filter before asking", async () => {
        const user = userEvent.setup();
        serveNews({
            first: { articles: makeArticles(3), nextCursor: null },
            "AI:first": { articles: makeArticles(1, () => ({ title: "AI story" })), nextCursor: null },
        });
        server.use(
            http.post("*/api/ask", async () => {
                await delay(200);
                return HttpResponse.json(answer("Later.", relatedStories("Related one")));
            })
        );
        render(<NewsPage />);

        await screen.findByText("Story 01");
        await user.type(box(), "AI{Enter}");
        await screen.findByText("Stories matching your question · 1");
        await user.clear(box());
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByText("Finding an answer…");
        expect(await screen.findByText("Story 01")).toBeInTheDocument();
        expect(screen.queryByText(/Stories matching your question/)).not.toBeInTheDocument();
        expect(gridRequests().at(-1)!.searchParams.has("q")).toBe(false);
        expect(screen.getByText("Finding an answer…")).toBeInTheDocument();
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

    it("never shows a late answer or its related stories after the section changes", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(3), nextCursor: null } });
        let finished = false;
        server.use(
            http.post("*/api/ask", async () => {
                await delay(200);
                finished = true;
                return HttpResponse.json(answer("Too late.", relatedStories("Late related")));
            })
        );
        const { rerender } = render(<NewsPage />);
        await screen.findByText("Story 01");
        await user.type(box(), "What did the bank do?{Enter}");
        await screen.findByText("Finding an answer…");

        params = new URLSearchParams("category=sports");
        rerender(<NewsPage />);
        await waitFor(() => expect(screen.queryByRole("region", { name: "Answer" })).not.toBeInTheDocument());
        await waitFor(() => expect(finished).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByText("Too late.")).not.toBeInTheDocument();
        expect(screen.queryByText("Late related")).not.toBeInTheDocument();
        expect(screen.queryByText(/Stories (matching|related to) your question/)).not.toBeInTheDocument();
        expect(gridRequests().at(-1)!.searchParams.get("category")).toBe("sports");
        expect(gridRequests().some((u) => u.searchParams.has("q"))).toBe(false);
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
        const asked = serveAsk(answer("The bank held rates.", relatedStories("Bank related")));
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("The bank held rates.")).toBeInTheDocument();
        expect(asked).toEqual([{ q: "What did the bank do?", category: "business" }]);
        expect(await screen.findByText("Stories related to your question · 1")).toBeInTheDocument();
        expect(screen.getByText("Bank related")).toBeInTheDocument();
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
