// @vitest-environment jsdom
import "../setup.dom";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerCard } from "@/components/AnswerCard";
import { PLACEHOLDER_IMAGE } from "@/lib/format";

type CardState = ComponentProps<typeof AnswerCard>["state"];
type Answer = Extract<CardState, { status: "done" }>["answer"];
type Thread = CardState["thread"];

const EMPTY: Thread = { turns: [], sources: [], when: "any" };

const threadOf = (...turns: Array<{ question: string; answer: Answer }>): Thread => {
    const sources: Thread["sources"] = [];
    for (const t of turns)
        for (const s of t.answer.sources) {
            const known = sources.find((x) => x.url === s.url);
            if (known) known.uses++;
            else sources.push({ ...s, uses: 1 });
        }
    return { turns, sources, when: "any" };
};

const answer = {
    segments: [
        { text: "The bank held rates at 4%", cites: [1] },
        { text: ", which some analysts did not expect", cites: [2] },
        { text: ".", cites: [] },
    ],
    sources: [
        {
            n: 1,
            url: "https://example.com/rates",
            title: "Bank holds rates",
            source: "The New York Times",
            publishedAt: "2026-09-28T09:00:00.000Z",
            imageUrl: "https://example.com/rates.jpg",
        },
        { n: 2, url: "https://example.com/analysts", title: "Analysts surprised", source: "BBC News" },
    ],
    related: [],
    truncated: false,
};

const question = "What did the bank do?";
const done = (overrides: Partial<typeof answer> = {}): CardState => {
    const full = { ...answer, ...overrides };
    return { status: "done", question, answer: full, thread: threadOf({ question, answer: full }) };
};

function show(state: CardState) {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    const onFollowUp = vi.fn();
    const view = render(<AnswerCard state={state} onRetry={onRetry} onClose={onClose} onFollowUp={onFollowUp} category="business" />);
    return { onRetry, onClose, onFollowUp, view };
}

describe("AnswerCard", () => {
    it("shows the question and the answer with numbered source links inline", () => {
        show(done());
        const card = screen.getByRole("region", { name: "Answer" });
        expect(within(card).getByText("Summary answer · Business")).toBeInTheDocument();
        expect(within(card).getByRole("heading", { name: question })).toBeInTheDocument();
        const body = within(card).getByText(/The bank held rates at 4%/);
        expect(body).toHaveTextContent("The bank held rates at 4%1, which some analysts did not expect2.");
        const inline = within(body).getAllByRole("link");
        expect(inline.map((a) => [a.getAttribute("aria-label"), a.textContent, a.getAttribute("href")])).toEqual([
            ["Source 1", "1", "https://example.com/rates"],
            ["Source 2", "2", "https://example.com/analysts"],
        ]);
        expect(inline[0]).toHaveAttribute("rel", "noopener noreferrer");
        expect(screen.getByText("Summarized from article summaries only. Open the article for the full story.")).toBeInTheDocument();
    });

    it("leaves out the follow-up sources note on a single answer", () => {
        show(done());
        expect(screen.queryByText("New articles a follow-up cites are added here, numbered in order.")).not.toBeInTheDocument();
    });

    it("lists the articles to read with number, outlet, age and title", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-28T12:00:00Z"));
        try {
            show(done());
            expect(screen.getByText("Read the articles")).toBeInTheDocument();
            const cards = within(screen.getByRole("list", { name: "Sources" })).getAllByRole("link");
            expect(cards.map((a) => a.getAttribute("href"))).toEqual(["https://example.com/rates", "https://example.com/analysts"]);
            expect(cards[0]).toHaveTextContent("1 · The New York Times · 3 hours ago");
            expect(cards[0]).toHaveTextContent("Bank holds rates");
            expect(cards[1]).toHaveTextContent("2 · BBC News");
            expect(cards[0]).toHaveAttribute("rel", "noopener noreferrer");
            expect(cards[0].querySelector("img")).toHaveAttribute("src", "https://example.com/rates.jpg");
            expect(cards[1].querySelector("img")).toHaveAttribute("src", PLACEHOLDER_IMAGE);
        } finally {
            vi.useRealTimers();
        }
    });

    it("renders the model's text as text, never as HTML", () => {
        show(done({ segments: [{ text: '<img src=x onerror="alert(1)"> <a href="https://evil.example">click</a>', cites: [1] }] }));
        expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
        expect(document.querySelector('img[src="x"]')).toBeNull();
        expect(screen.queryByRole("link", { name: "click" })).not.toBeInTheDocument();
    });

    it("says when the answer was cut short", () => {
        show(done({ truncated: true }));
        expect(screen.getByText("This answer was cut short.")).toBeInTheDocument();
    });

    it("shows the no-match message without the articles column", () => {
        show(done({ segments: [{ text: "No recent articles match that question.", cites: [] }], sources: [] }));
        expect(screen.getByText("No recent articles match that question.")).toBeInTheDocument();
        expect(screen.queryByText("Read the articles")).not.toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Sources" })).not.toBeInTheDocument();
    });

    it("shows a loading message with the question while it waits", () => {
        show({ status: "loading", question, thread: EMPTY });
        expect(screen.getByRole("heading", { name: question })).toBeInTheDocument();
        expect(screen.getByText("Finding an answer…")).toBeInTheDocument();
    });

    it("offers a retry when the error allows one", async () => {
        const { onRetry } = show({ status: "error", question, title: "Could not get an answer", message: "Check your connection.", retry: true, thread: EMPTY });
        expect(screen.getByRole("alert")).toHaveTextContent("Could not get an answer");
        await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("offers no retry when the limit is reached", () => {
        show({ status: "error", question, title: "Too many questions", message: "You can ask again after 3:00 PM.", retry: false, thread: EMPTY });
        expect(screen.getByRole("alert")).toHaveTextContent("You can ask again after 3:00 PM.");
        expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });

    it("closes", async () => {
        const { onClose } = show(done());
        await userEvent.setup().click(screen.getByRole("button", { name: "Close answer" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

const first = { question: "What did the bank do?", answer: { ...answer } };
const second = {
    question: "Why did it hold?",
    answer: {
        segments: [
            { text: "Inflation is slowing", cites: [1] },
            { text: ", a new report says", cites: [3] },
            { text: ".", cites: [] },
        ],
        sources: [answer.sources[0], { n: 3, url: "https://example.com/inflation", title: "Inflation slows", source: "BBC News" }],
        related: [],
        truncated: false,
    },
};
const threaded = (): CardState => ({ status: "done", question: second.question, answer: second.answer, thread: threadOf(first, second) });

describe("AnswerCard threads", () => {
    it("names the thread, counts its questions and shows the newest answer", () => {
        show(threaded());
        const card = screen.getByRole("region", { name: "Answer thread" });
        expect(within(card).getByText("Summary answer · Business · 2 questions")).toBeInTheDocument();
        expect(within(card).getByRole("heading", { name: "Why did it hold?" })).toBeInTheDocument();
        const body = within(card).getByText(/Inflation is slowing/);
        expect(within(body).getAllByRole("link").map((a) => [a.getAttribute("aria-label"), a.getAttribute("href")])).toEqual([
            ["Source 1", "https://example.com/rates"],
            ["Source 3", "https://example.com/inflation"],
        ]);
    });

    it("collapses an earlier turn to one line that expands", async () => {
        show(threaded());
        const earlier = screen.getByRole("button", { name: /What did the bank do\?/ });
        expect(earlier).toHaveAttribute("aria-expanded", "false");
        expect(earlier).toHaveTextContent("The bank held rates at 4%, which some analysts did not expect.");
        expect(screen.queryByRole("link", { name: "Source 2" })).not.toBeInTheDocument();
        await userEvent.setup().click(earlier);
        expect(earlier).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "Source 2" })).toHaveAttribute("href", "https://example.com/analysts");
    });

    it("lists every source in the thread once, with how many answers used it", () => {
        show(threaded());
        const cards = within(screen.getByRole("list", { name: "Sources" })).getAllByRole("link");
        expect(cards.map((a) => a.getAttribute("href"))).toEqual([
            "https://example.com/rates",
            "https://example.com/analysts",
            "https://example.com/inflation",
        ]);
        expect(cards[0]).toHaveTextContent("Used in both answers");
        expect(cards[1]).not.toHaveTextContent(/Used in/);
        expect(screen.getByText("New articles a follow-up cites are added here, numbered in order.")).toBeInTheDocument();
    });

    it("says how many answers used a source once there are more than two", () => {
        const third = { ...second, question: "And next?" };
        show({ status: "done", question: third.question, answer: third.answer, thread: threadOf(first, second, third) });
        expect(within(screen.getByRole("list", { name: "Sources" })).getAllByRole("link")[0]).toHaveTextContent("Used in 3 answers");
    });

    it("sends a follow-up and clears the field", async () => {
        const user = userEvent.setup();
        const { onFollowUp } = show(done());
        const field = screen.getByRole("textbox", { name: "Ask a follow-up" });
        await user.type(field, "  Why did it hold?  {Enter}");
        expect(onFollowUp).toHaveBeenCalledWith("Why did it hold?");
        expect(field).toHaveValue("");
        expect(screen.getByText("Follow-ups remember this thread. Use the box at the top to start a new topic.")).toBeInTheDocument();
    });

    it("refuses a follow-up outside 3 to 300 bytes", async () => {
        const user = userEvent.setup();
        const { onFollowUp } = show(done());
        const field = screen.getByRole("textbox", { name: "Ask a follow-up" });
        await user.type(field, "hi{Enter}");
        await user.clear(field);
        await user.click(field);
        await user.paste("日本".repeat(60));
        await user.keyboard("{Enter}");
        expect(onFollowUp).not.toHaveBeenCalled();
        expect(screen.getByText("That question is too long. Please shorten it.")).toBeInTheDocument();
    });

    it("keeps the earlier turns and locks the field while a follow-up is pending", () => {
        show({ status: "loading", question: "Why did it hold?", thread: threadOf(first) });
        expect(screen.getByRole("button", { name: /What did the bank do\?/ })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Why did it hold?" })).toBeInTheDocument();
        expect(screen.getByText("Finding an answer…")).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Ask a follow-up" })).toHaveAttribute("readonly");
        expect(screen.getByText("Summary answer · Business · 2 questions")).toBeInTheDocument();
    });

    it("offers no follow-up before the first answer lands", () => {
        show({ status: "loading", question, thread: EMPTY });
        expect(screen.queryByRole("textbox", { name: "Ask a follow-up" })).not.toBeInTheDocument();
    });
});

describe("AnswerCard window", () => {
    it("names a chosen window in the label, before the question count", () => {
        const one = done();
        if (one.status !== "done") throw new Error("expected done");
        const { view } = show({ ...one, thread: { ...one.thread, when: "week" } });
        expect(screen.getByText("Summary answer · Business · Past week")).toBeInTheDocument();
        view.unmount();
        const two = threaded();
        if (two.status !== "done") throw new Error("expected done");
        show({ ...two, thread: { ...two.thread, when: "week" } });
        expect(screen.getByText("Summary answer · Business · Past week · 2 questions")).toBeInTheDocument();
    });

    it("never names any time", () => {
        show(done());
        expect(screen.getByText("Summary answer · Business")).toBeInTheDocument();
        expect(screen.queryByText(/Any time/)).not.toBeInTheDocument();
    });
});
