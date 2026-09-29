// @vitest-environment jsdom
import "../setup.dom";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../msw";
import { makeQuote } from "../fixtures/quotes";
import { useQuotes } from "@/lib/useQuotes";

const CACHE_KEY = "watchlist:v1";
const quotes = [makeQuote("AAPL"), makeQuote("MSFT")];
const cached = [makeQuote("NVDA")];

const seedCache = (ageMs: number) =>
    localStorage.setItem(CACHE_KEY, JSON.stringify({ quotes: cached, at: Date.now() - ageMs }));

const respond = (body: object, status = 200) =>
    server.use(http.get("*/api/stocks/watchlist", () => HttpResponse.json(body, { status })));

describe("useQuotes", () => {
    it("loads quotes on a cold start", async () => {
        respond({ quotes, stale: false });
        const { result } = renderHook(() => useQuotes());
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.quotes.map((q) => q.symbol)).toEqual(["AAPL", "MSFT"]);
    });

    it("serves a fresh cache without a request", async () => {
        let called = false;
        server.use(
            http.get("*/api/stocks/watchlist", () => {
                called = true;
                return HttpResponse.json({ quotes, stale: false });
            })
        );
        seedCache(0);
        const { result } = renderHook(() => useQuotes());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.quotes.map((q) => q.symbol)).toEqual(["NVDA"]);
        expect(result.current.error).toBe("");
        expect(called).toBe(false);
    });

    it("shows an expired cache, then replaces it and rewrites the cache", async () => {
        respond({ quotes, stale: false });
        seedCache(6 * 60 * 1000);
        const { result } = renderHook(() => useQuotes());
        expect(result.current.quotes.map((q) => q.symbol)).toEqual(["NVDA"]);
        expect(result.current.loading).toBe(false);
        await waitFor(() => expect(result.current.quotes.map((q) => q.symbol)).toEqual(["AAPL", "MSFT"]));
        expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).quotes).toHaveLength(2);
    });

    it("reports stale data from the route", async () => {
        respond({ quotes, stale: true });
        const { result } = renderHook(() => useQuotes());
        await waitFor(() => expect(result.current.stale).toBe(true));
    });

    it("keeps cached rows when a background refresh fails", async () => {
        respond({ quotes: [], stale: false, error: "Quotes unavailable" }, 503);
        seedCache(6 * 60 * 1000);
        const { result } = renderHook(() => useQuotes());
        await waitFor(() => expect(result.current.error).toBe("Quotes unavailable"));
        expect(result.current.quotes.map((q) => q.symbol)).toEqual(["NVDA"]);
    });

    it("shows the error when a cold load fails", async () => {
        respond({ quotes: [], stale: false, error: "Quotes unavailable" }, 503);
        const { result } = renderHook(() => useQuotes());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.quotes).toEqual([]);
        expect(result.current.error).toBe("Quotes unavailable");
    });
});
