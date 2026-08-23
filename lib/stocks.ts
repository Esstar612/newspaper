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
 * marketdata.app intermittently 403s requests from Vercel's datacenter IPs —
 * measured at 0/13 success during one window and 20/20 shortly after, with the
 * same token and quota remaining. It is transient, not a permanent block, so the
 * fix is to retry and to hold on to a good payload rather than to swap provider.
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

/** Status codes worth retrying: the intermittent origin block, rate limits, and 5xx. */
const RETRYABLE = new Set([403, 408, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, revalidate: number, attempts = 3): Promise<Response> {
    let last: Response | null = null;

    for (let i = 0; i < attempts; i++) {
        // Only the first attempt may be served from cache; a retry must go out.
        const res = await fetch(url, {
            ...(i === 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
            signal: AbortSignal.timeout(8_000),
        });

        if (res.ok) return res;
        last = res;
        if (!RETRYABLE.has(res.status)) break;

        // Short backoff: this runs inside a request, so the budget is tight.
        if (i < attempts - 1) await sleep(300 * (i + 1));
    }

    if (last?.status === 403) {
        throw new Error("Market data provider refused the request from this host (403)");
    }
    throw new Error(`Quote lookup failed (HTTP ${last?.status ?? "unknown"})`);
}

async function requestQuotes(revalidate: number): Promise<Quote[]> {
    const token = process.env.MARKET_DATA_API_TOKEN;
    if (!token) throw new Error("Market data API token not configured");

    const url =
        `https://api.marketdata.app/v1/stocks/bulkquotes/` +
        `?symbols=${encodeURIComponent(SYMBOL_LIST.join(","))}&token=${token}`;

    // The block is transient and clears within seconds, so a couple of quick
    // retries convert most failures into successes. Without this the user has to
    // click "Try again" repeatedly, which is what the server should be doing.
    const res = await fetchWithRetry(url, revalidate);

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
