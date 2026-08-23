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
 * Last successful result, kept per warm serverless instance.
 *
 * marketdata.app 403s requests from Vercel's datacenter IPs (verified: every
 * endpoint returns 403 from production and 203 from a residential IP, with any
 * User-Agent, and with a valid, invalid, or absent token). Serving the last good
 * payload keeps the page useful across transient blocks instead of emptying it.
 */
let lastGood: { quotes: Quote[]; at: number } | null = null;

/** How long a stale payload is still worth showing. */
const STALE_TTL_MS = 6 * 60 * 60 * 1000;

export type QuotesResult = {
    quotes: Quote[];
    /** True when the provider failed and this is the previous good payload. */
    stale: boolean;
    /** Age of a stale payload, ms. */
    ageMs?: number;
    error?: string;
};

async function requestQuotes(revalidate: number): Promise<Quote[]> {
    const token = process.env.MARKET_DATA_API_TOKEN;
    if (!token) throw new Error("Market data API token not configured");

    const url =
        `https://api.marketdata.app/v1/stocks/bulkquotes/` +
        `?symbols=${encodeURIComponent(SYMBOL_LIST.join(","))}&token=${token}`;

    const res = await fetch(url, {
        next: { revalidate },
        signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 403) {
        // Distinct message: this is an origin block, not a bad key or a quota.
        throw new Error("Market data provider refused the request from this host (403)");
    }
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

/**
 * Single bulk quote fetch, shared by /api/stocks/watchlist and the front page so
 * they cannot drift into two different request patterns against a 100/day quota.
 *
 * Never throws: callers get either fresh quotes, the last good payload marked
 * stale, or an empty list with the reason. A markets strip that vanishes with no
 * explanation is worse than one that says why.
 */
export async function fetchQuotes(revalidate = 60): Promise<QuotesResult> {
    try {
        const quotes = await requestQuotes(revalidate);
        lastGood = { quotes, at: Date.now() };
        return { quotes, stale: false };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch quotes";

        if (lastGood && Date.now() - lastGood.at < STALE_TTL_MS) {
            return {
                quotes: lastGood.quotes,
                stale: true,
                ageMs: Date.now() - lastGood.at,
                error: message,
            };
        }
        return { quotes: [], stale: false, error: message };
    }
}
