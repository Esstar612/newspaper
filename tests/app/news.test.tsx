// @vitest-environment jsdom
import "../setup.dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../msw";
import { makeArticles } from "../fixtures/articles";
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
            const body = pages[url.searchParams.get("cursor") ?? "first"];
            return HttpResponse.json(body ?? { articles: [], nextCursor: null });
        })
    );
}

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

    it("searches within the active section", async () => {
        const user = userEvent.setup();
        params = new URLSearchParams("category=business");
        serveNews({ first: { articles: makeArticles(2), nextCursor: null } });
        render(<NewsPage />);

        await user.click(await screen.findByRole("button", { name: "Search articles" }));
        await user.type(screen.getByRole("textbox", { name: "Search articles" }), "rates");
        await user.click(screen.getByRole("button", { name: "Go" }));

        const summary = await screen.findByText(/results for/);
        expect(summary).toHaveTextContent(/2 results for “rates” in Business/);
        const search = requests.at(-1)!.searchParams;
        expect(search.get("q")).toBe("rates");
        expect(search.get("category")).toBe("business");
    });

    it("shows the reason when the feed fails", async () => {
        server.use(http.get("*/api/news", () => HttpResponse.json({ articles: [], error: "db down" }, { status: 500 })));
        render(<NewsPage />);

        expect(await screen.findByText("Could not load articles")).toBeInTheDocument();
        expect(screen.getByText("db down")).toBeInTheDocument();
    });
});
