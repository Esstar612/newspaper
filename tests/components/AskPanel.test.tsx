// @vitest-environment jsdom
import "../setup.dom";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AskPanel } from "@/components/AskPanel";

type PanelState = ComponentProps<typeof AskPanel>["state"];

const answer = {
    segments: [
        { text: "The bank held rates at 4%", cites: [1] },
        { text: ", which some analysts did not expect", cites: [2] },
        { text: ".", cites: [] },
    ],
    sources: [
        { n: 1, url: "https://example.com/rates", title: "Bank holds rates" },
        { n: 2, url: "https://example.com/analysts", title: "Analysts surprised" },
    ],
    related: [],
    truncated: false,
};

const question = "What did the bank do?";
const done = (overrides: Partial<typeof answer> = {}): PanelState => ({ status: "done", question, answer: { ...answer, ...overrides } });

function show(state: PanelState) {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(<AskPanel state={state} onRetry={onRetry} onClose={onClose} category="business" />);
    return { onRetry, onClose };
}

describe("AskPanel", () => {
    it("shows the question, the answer and numbered sources", () => {
        show(done());
        const panel = screen.getByRole("region", { name: "Answer" });
        expect(within(panel).getByText("Summary answer · Business")).toBeInTheDocument();
        expect(within(panel).getByRole("heading", { name: question })).toBeInTheDocument();
        expect(within(panel).getByText(/The bank held rates at 4% \[1\], which some analysts did not expect \[2\]\./)).toBeInTheDocument();
        const sources = within(screen.getByRole("list", { name: "Sources" })).getAllByRole("link");
        expect(sources.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
            ["Bank holds rates", "https://example.com/rates"],
            ["Analysts surprised", "https://example.com/analysts"],
        ]);
        expect(sources[0]).toHaveAttribute("rel", "noopener noreferrer");
        expect(screen.getByText("Summarized from article summaries only. Open the article for the full story.")).toBeInTheDocument();
    });

    it("renders the model's text as text, never as HTML", () => {
        show(done({ segments: [{ text: '<img src=x onerror="alert(1)"> <a href="https://evil.example">click</a>', cites: [1] }] }));
        expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
        expect(document.querySelector("img")).toBeNull();
        expect(screen.queryByRole("link", { name: "click" })).not.toBeInTheDocument();
    });

    it("says when the answer was cut short", () => {
        show(done({ truncated: true }));
        expect(screen.getByText("This answer was cut short.")).toBeInTheDocument();
    });

    it("shows the no-match message without a source list", () => {
        show(done({ segments: [{ text: "No recent articles match that question.", cites: [] }], sources: [] }));
        expect(screen.getByText("No recent articles match that question.")).toBeInTheDocument();
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
