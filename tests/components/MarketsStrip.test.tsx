// @vitest-environment jsdom
import "../setup.dom";
import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../msw";
import { makeQuote } from "../fixtures/quotes";
import { MarketsStrip } from "@/components/MarketsStrip";

describe("MarketsStrip", () => {
    it("renders nothing when there are no quotes", async () => {
        let requested = false;
        server.use(
            http.get("*/api/stocks/watchlist", () => {
                requested = true;
                return HttpResponse.json({ quotes: [], stale: false, error: "Quotes unavailable" }, { status: 503 });
            })
        );
        const { container } = render(<MarketsStrip />);
        await waitFor(() => expect(requested).toBe(true));
        await act(async () => {});
        expect(container).toBeEmptyDOMElement();
    });

    it("shows each symbol with its direction", async () => {
        server.use(
            http.get("*/api/stocks/watchlist", () =>
                HttpResponse.json({
                    quotes: [makeQuote("AAPL", { changePercent: 0.015 }), makeQuote("MSFT", { changePercent: -0.005 })],
                    stale: false,
                })
            )
        );
        render(<MarketsStrip />);
        const aapl = await screen.findByRole("link", { name: /AAPL/ });
        const msft = screen.getByRole("link", { name: /MSFT/ });
        expect(aapl).toHaveAttribute("href", "/stocks");
        expect(aapl).toHaveTextContent("▲ 1.50%");
        expect(msft).toHaveTextContent("▼ 0.50%");
    });
});
