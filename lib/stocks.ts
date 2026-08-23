// lib/stocks.ts
/**
 * The tracked symbols, shared by the watchlist route and the page.
 *
 * marketdata.app's free tier allows 100 requests/day, so the watchlist is fetched
 * with a single `bulkquotes` call rather than one request per symbol — ten
 * per-symbol calls per page load would exhaust the daily quota in ten visits.
 */
export const SYMBOLS = [
    { symbol: "AAPL", name: "Apple" },
    { symbol: "MSFT", name: "Microsoft" },
    { symbol: "GOOGL", name: "Alphabet" },
    { symbol: "AMZN", name: "Amazon" },
    { symbol: "META", name: "Meta Platforms" },
    { symbol: "TSLA", name: "Tesla" },
    { symbol: "BRK.A", name: "Berkshire Hathaway" },
    { symbol: "BABA", name: "Alibaba" },
    { symbol: "V", name: "Visa" },
    { symbol: "JNJ", name: "Johnson & Johnson" },
] as const;

export const SYMBOL_LIST = SYMBOLS.map((s) => s.symbol);

export const NAME_BY_SYMBOL: Record<string, string> = Object.fromEntries(
    SYMBOLS.map((s) => [s.symbol, s.name])
);

export type Quote = {
    symbol: string;
    name: string;
    last: number | null;
    change: number | null;
    changePercent: number | null;
    volume: number | null;
    updated: number | null;
};

/** marketdata.app returns parallel arrays, one entry per requested symbol. */
const at = (v: unknown, i: number): number | null => {
    if (!Array.isArray(v)) return null;
    const n = v[i];
    return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/**
 * Single bulk quote fetch, shared by /api/stocks/watchlist and the front page so
 * they cannot drift into two different request patterns against a 100/day quota.
 */
export async function fetchQuotes(revalidate = 60): Promise<Quote[]> {
    const token = process.env.MARKET_DATA_API_TOKEN;
    if (!token) throw new Error("Market data API token not configured");

    const url =
        `https://api.marketdata.app/v1/stocks/bulkquotes/` +
        `?symbols=${encodeURIComponent(SYMBOL_LIST.join(","))}&token=${token}`;

    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) throw new Error(`Quote lookup failed (HTTP ${res.status})`);

    const raw = await res.json();
    // The provider signals failure in the body, not the status code.
    if (raw?.s && raw.s !== "ok") throw new Error(raw.errmsg || "No quotes available");

    const symbols: unknown = raw?.symbol;
    if (!Array.isArray(symbols)) throw new Error("Unexpected response shape");

    return symbols.map((sym, i) => ({
        symbol: String(sym),
        name: NAME_BY_SYMBOL[String(sym)] ?? String(sym),
        last: at(raw.last, i) ?? at(raw.mid, i),
        change: at(raw.change, i),
        changePercent: at(raw.changepct, i),
        volume: at(raw.volume, i),
        updated: at(raw.updated, i),
    }));
}
