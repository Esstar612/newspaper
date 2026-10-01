// @vitest-environment jsdom
import "../setup.dom";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnswerCard } from "@/components/AnswerCard";
import { PLACEHOLDER_IMAGE } from "@/lib/format";

type CardState = ComponentProps<typeof AnswerCard>["state"];

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
const done = (overrides: Partial<typeof answer> = {}): CardState => ({ status: "done", question, answer: { ...answer, ...overrides } });

function show(state: CardState) {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(<AnswerCard state={state} onRetry={onRetry} onClose={onClose} category="business" />);
    return { onRetry, onClose };
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
        show({ status: "loading", question });
        expect(screen.getByRole("heading", { name: question })).toBeInTheDocument();
        expect(screen.getByText("Finding an answer…")).toBeInTheDocument();
    });

    it("offers a retry when the error allows one", async () => {
        const { onRetry } = show({ status: "error", question, title: "Could not get an answer", message: "Check your connection.", retry: true });
        expect(screen.getByRole("alert")).toHaveTextContent("Could not get an answer");
        await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("offers no retry when the limit is reached", () => {
        show({ status: "error", question, title: "Too many questions", message: "You can ask again after 3:00 PM.", retry: false });
        expect(screen.getByRole("alert")).toHaveTextContent("You can ask again after 3:00 PM.");
        expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });

    it("closes", async () => {
        const { onClose } = show(done());
        await userEvent.setup().click(screen.getByRole("button", { name: "Close answer" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
