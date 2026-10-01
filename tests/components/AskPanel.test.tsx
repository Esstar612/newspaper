// @vitest-environment jsdom
import "../setup.dom";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { server } from "../msw";
import { AskPanel } from "@/components/AskPanel";

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
    refused: false,
    truncated: false,
};

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

async function ask(category = "business", question = "What did the bank do?") {
    const user = userEvent.setup();
    render(<AskPanel category={category} />);
    await user.type(screen.getByRole("textbox", { name: "Ask about recent news" }), question);
    await user.click(screen.getByRole("button", { name: "Ask" }));
}

describe("AskPanel", () => {
    it("sends the question with the section and shows the answer with numbered sources", async () => {
        const sent = serve(answer);
        await ask();
        expect(await screen.findByText(/The bank held rates at 4% \[1\], which some analysts did not expect \[2\]\./)).toBeInTheDocument();
        expect(sent).toEqual([{ q: "What did the bank do?", category: "business" }]);
        const sources = within(screen.getByRole("list", { name: "Sources" })).getAllByRole("link");
        expect(sources.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
            ["Bank holds rates", "https://example.com/rates"],
            ["Analysts surprised", "https://example.com/analysts"],
        ]);
        expect(sources[0]).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("shows the question the answer belongs to, and locks the field while waiting", async () => {
        const user = userEvent.setup();
        server.use(
            http.post("*/api/ask", async () => {
                await delay(200);
                return HttpResponse.json(answer);
            })
        );
        render(<AskPanel category="business" />);
        const field = screen.getByRole("textbox", { name: "Ask about recent news" });
        await user.type(field, "What did the bank do?");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        expect(field).toHaveAttribute("readonly");
        await screen.findByText(/held rates/);
        expect(screen.getByRole("heading", { name: "What did the bank do?" })).toBeInTheDocument();
        expect(field).not.toHaveAttribute("readonly");
    });

    it("leaves the section out for Top Stories", async () => {
        const sent = serve(answer);
        await ask("general");
        await screen.findByText(/held rates/);
        expect(sent).toEqual([{ q: "What did the bank do?" }]);
    });

    it("renders the model's text as text, never as HTML", async () => {
        serve({ ...answer, segments: [{ text: '<img src=x onerror="alert(1)"> <a href="https://evil.example">click</a>', cites: [1] }] });
        await ask();
        await screen.findByText(/<img src=x/);
        expect(document.querySelector("img")).toBeNull();
        expect(screen.queryByRole("link", { name: "click" })).not.toBeInTheDocument();
    });

    it("says when the answer was cut short", async () => {
        serve({ ...answer, truncated: true });
        await ask();
        expect(await screen.findByText("This answer was cut short.")).toBeInTheDocument();
    });

    it("shows the no-match message without a source list", async () => {
        serve({ segments: [{ text: "No recent articles match that question.", cites: [] }], sources: [], refused: false, truncated: false, noMatch: true });
        await ask();
        expect(await screen.findByText("No recent articles match that question.")).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Sources" })).not.toBeInTheDocument();
    });

    it("explains the limit with its reset time", async () => {
        serve({ error: "Too many questions. Try again later.", scope: "ip", resetAt: "2026-10-01T15:00:00.000Z" }, 429);
        await ask();
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Too many questions");
        expect(alert).toHaveTextContent(new Date("2026-10-01T15:00:00.000Z").toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    });

    it("says Ask is not set up when the service returns 503", async () => {
        serve({ error: "Search is not set up yet." }, 503);
        await ask();
        expect(await screen.findByRole("alert")).toHaveTextContent("Ask isn't available yet");
    });

    it("shows a loading message while it waits", async () => {
        server.use(
            http.post("*/api/ask", async () => {
                await delay(200);
                return HttpResponse.json(answer);
            })
        );
        await ask();
        expect(screen.getByText("Finding an answer…")).toBeInTheDocument();
        expect(await screen.findByText(/held rates/)).toBeInTheDocument();
        expect(screen.queryByText("Finding an answer…")).not.toBeInTheDocument();
    });

    it.each([
        ["too short", "hi"],
        ["over 300 bytes", "日本".repeat(60)],
    ])("keeps Ask disabled for a question %s, as the server would reject it", async (_, question) => {
        const user = userEvent.setup();
        render(<AskPanel category="business" />);
        await user.type(screen.getByRole("textbox", { name: "Ask about recent news" }), question);
        expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
        if (question.length > 3) expect(screen.getByText("That question is too long. Please shorten it.")).toBeInTheDocument();
    });

    it("offers a retry after a failure", async () => {
        serve({ error: "The answer service is unavailable. Try again later." }, 502);
        await ask();
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not get an answer");
        serve(answer);
        await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText(/held rates/)).toBeInTheDocument();
    });
});

describe("AskPanel failures", () => {
    it("treats a reply without an answer shape as an error instead of crashing", async () => {
        serve({ error: "proxy says hi" });
        await ask();
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not get an answer");
    });

    it("retries the question that failed, even after the field is edited", async () => {
        const user = userEvent.setup();
        serve({ error: "The answer service is unavailable." }, 502);
        render(<AskPanel category="business" />);
        const field = screen.getByRole("textbox", { name: "Ask about recent news" });
        await user.type(field, "What did the bank do?");
        await user.click(screen.getByRole("button", { name: "Ask" }));
        await screen.findByRole("alert");
        await user.clear(field);
        await user.type(field, "hi");
        const sent = serve(answer);
        await user.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText(/held rates/)).toBeInTheDocument();
        expect(sent).toEqual([{ q: "What did the bank do?", category: "business" }]);
    });

    it("asks the reader to check their connection when the request cannot be sent", async () => {
        server.use(http.post("*/api/ask", () => HttpResponse.error()));
        await ask();
        expect(await screen.findByRole("alert")).toHaveTextContent("Check your connection.");
    });
});
