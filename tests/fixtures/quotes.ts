import type { Quote } from "@/lib/stocks";

export function makeQuote(symbol: string, overrides: Partial<Quote> = {}): Quote {
    return {
        symbol,
        name: `${symbol} Inc.`,
        last: 200,
        change: 2,
        changePercent: 0.01,
        volume: 1_000_000,
        updated: Date.parse("2026-09-28T20:00:00Z") / 1000,
        ...overrides,
    };
}
