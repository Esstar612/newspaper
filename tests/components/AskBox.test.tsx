// @vitest-environment jsdom
import "../setup.dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "../msw";
import { makeArticle } from "../fixtures/articles";
import { AskBox } from "@/components/AskBox";
import type { When } from "@/lib/when";

const finished: string[] = [];

function serveMatches(titles: Record<string, string[]> = {}) {
    const requests: URL[] = [];
    finished.length = 0;
    server.use(
        http.get("*/api/news", async ({ request }) => {
            const url = new URL(request.url);
            requests.push(url);
            const q = url.searchParams.get("q") ?? "";
            if (q === "slow") await delay(200);
            finished.push(q);
            const list = titles[q] ?? [];
            return HttpResponse.json({ articles: list.map((title, i) => makeArticle(i + 1, { title })), nextCursor: null });
        })
    );
    return requests;
}

function setup(category = "business", onSubmit = vi.fn(), when: When = "any", onWhenChange = vi.fn()) {
    const user = userEvent.setup();
    render(<AskBox category={category} onSubmit={onSubmit} debounceMs={0} when={when} onWhenChange={onWhenChange} />);
    const box = screen.getByRole("combobox", { name: "Search headlines or ask a question" });
    return { user, box, onSubmit };
}

afterEach(() => vi.restoreAllMocks());

describe("AskBox", () => {
    it("opens a list with the Ask option first and the keyboard hints", async () => {
        serveMatches();
        const { user, box } = setup();
        expect(box).toHaveAttribute("aria-expanded", "false");
        await user.type(box, "What did the bank do?");
        expect(box).toHaveAttribute("aria-expanded", "true");
        expect(box).toHaveAttribute("aria-autocomplete", "list");
        const options = within(screen.getByRole("listbox")).getAllByRole("option");
        expect(options[0]).toHaveTextContent("Ask: “What did the bank do?”");
        expect(options[0]).toHaveAttribute("aria-selected", "true");
        expect(box).toHaveAttribute("aria-activedescendant", options[0].id);
        const list = screen.getByRole("listbox");
        expect(box).toHaveAttribute("aria-controls", list.id);
        expect(screen.getByText("Enter also shows related stories")).toBeInTheDocument();
        expect(screen.getByText("Esc to close")).toBeInTheDocument();
    });

    it("asks for 5 headline matches in the active section", async () => {
        const requests = serveMatches({ rates: ["Bank holds rates"] });
        const { user, box } = setup();
        await user.type(box, "rates");
        expect(await screen.findByRole("option", { name: /Bank holds rates/ })).toHaveAttribute("href", "https://example.com/story-01");
        const last = requests.at(-1)!.searchParams;
        expect(last.get("q")).toBe("rates");
        expect(last.get("limit")).toBe("5");
        expect(last.get("category")).toBe("business");
    });

    it("leaves the section out of the match request for Top Stories", async () => {
        const requests = serveMatches({ rates: ["Bank holds rates"] });
        const { user, box } = setup("general");
        await user.type(box, "rates");
        await screen.findByRole("option", { name: /Bank holds rates/ });
        expect(requests.at(-1)!.searchParams.has("category")).toBe(false);
        expect(screen.getByText("in Top Stories")).toBeInTheDocument();
    });

    it("shows only the latest query's matches when an earlier one answers late", async () => {
        serveMatches({ slow: ["Old headline"], slowly: ["New headline"] });
        const { user, box } = setup();
        await user.type(box, "slow");
        await user.type(box, "ly");
        expect(await screen.findByRole("option", { name: /New headline/ })).toBeInTheDocument();
        await waitFor(() => expect(finished).toContain("slow"));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByRole("option", { name: /Old headline/ })).not.toBeInTheDocument();
    });

    it("submits the trimmed query on Enter by default", async () => {
        serveMatches({ rates: ["Bank holds rates"] });
        const { user, box, onSubmit } = setup();
        await user.type(box, "  rates  ");
        await screen.findByRole("option", { name: /Bank holds rates/ });
        await user.keyboard("{Enter}");
        expect(onSubmit).toHaveBeenCalledWith("rates");
        expect(box).toHaveAttribute("aria-expanded", "false");
    });

    it("opens the highlighted article on Enter instead of asking", async () => {
        serveMatches({ rates: ["Bank holds rates"] });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const { user, box, onSubmit } = setup();
        await user.type(box, "rates");
        const article = await screen.findByRole("option", { name: /Bank holds rates/ });
        await user.keyboard("{ArrowDown}");
        expect(article).toHaveAttribute("aria-selected", "true");
        expect(box).toHaveAttribute("aria-activedescendant", article.id);
        expect(article).toHaveAttribute("target", "_blank");
        await user.keyboard("{Enter}");
        expect(click).toHaveBeenCalledTimes(1);
        expect(click.mock.contexts[0]).toBe(article);
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("wraps ArrowUp from the Ask option to the last article", async () => {
        serveMatches({ rates: ["First", "Second"] });
        const { user, box } = setup();
        await user.type(box, "rates");
        await screen.findByRole("option", { name: /Second/ });
        await user.keyboard("{ArrowUp}");
        expect(screen.getByRole("option", { name: /Second/ })).toHaveAttribute("aria-selected", "true");
    });

    it("closes the list on Escape", async () => {
        serveMatches();
        const { user, box } = setup();
        await user.type(box, "rates");
        await user.keyboard("{Escape}");
        expect(box).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("cancels the pending headline lookup when the query is submitted", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {
            const fetchSpy = vi.spyOn(globalThis, "fetch");
            const onSubmit = vi.fn();
            render(<AskBox category="business" onSubmit={onSubmit} debounceMs={100} when="any" onWhenChange={vi.fn()} />);
            const box = screen.getByRole("combobox", { name: "Search headlines or ask a question" });
            fireEvent.change(box, { target: { value: "rates" } });
            fireEvent.submit(box.closest("form")!);
            vi.advanceTimersByTime(1000);
            expect(onSubmit).toHaveBeenCalledWith("rates");
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("refuses a question over 300 bytes", async () => {
        serveMatches();
        const { user, box, onSubmit } = setup();
        await user.click(box);
        await user.paste("日本".repeat(60));
        await user.keyboard("{Enter}");
        expect(screen.getByText("That question is too long. Please shorten it.")).toBeInTheDocument();
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it("focuses the box when / is pressed outside a field", async () => {
        serveMatches();
        const { user, box } = setup();
        expect(screen.getByText("in Business")).toBeInTheDocument();
        await user.keyboard("/");
        expect(box).toHaveFocus();
        expect(box).toHaveValue("");
    });

    it("leaves / alone while typing in another field", async () => {
        serveMatches();
        const user = userEvent.setup();
        render(
            <>
                <input aria-label="Other field" />
                <AskBox category="business" onSubmit={vi.fn()} debounceMs={0} when="any" onWhenChange={vi.fn()} />
            </>
        );
        const other = screen.getByRole("textbox", { name: "Other field" });
        await user.type(other, "a/b");
        expect(other).toHaveFocus();
        expect(other).toHaveValue("a/b");
    });
});

describe("AskBox before any results", () => {
    it("submits with the Ask button too", async () => {
        serveMatches();
        const { user, box, onSubmit } = setup();
        await user.type(box, "rates");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        expect(onSubmit).toHaveBeenCalledWith("rates");
        await waitFor(() => expect(box).toHaveAttribute("aria-expanded", "false"));
    });
});

describe("AskBox window", () => {
    it("offers the four windows in a select named When", async () => {
        serveMatches();
        const onWhenChange = vi.fn();
        const { user } = setup("business", vi.fn(), "any", onWhenChange);
        const select = screen.getByRole("combobox", { name: "When" });
        expect([...select.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["Any time", "Past week", "Past month", "Past year"]);
        expect(select).toHaveValue("any");
        await user.selectOptions(select, "Past week");
        expect(onWhenChange).toHaveBeenCalledWith("week");
    });

    it("asks for headline matches within the window", async () => {
        const requests = serveMatches({ rates: ["Bank holds rates"] });
        const { user, box } = setup("business", vi.fn(), "week");
        await user.type(box, "rates");
        await screen.findByRole("option", { name: /Bank holds rates/ });
        expect(requests.at(-1)!.searchParams.get("when")).toBe("week");
    });

    it("sends no window for any time", async () => {
        const requests = serveMatches({ rates: ["Bank holds rates"] });
        const { user, box } = setup();
        await user.type(box, "rates");
        await screen.findByRole("option", { name: /Bank holds rates/ });
        expect(requests.at(-1)!.searchParams.has("when")).toBe(false);
    });
});
