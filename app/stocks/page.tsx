"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { NAME_BY_SYMBOL, RANGE_KEYS, type Quote, type Range } from "@/lib/stocks";
import { compactNumber, money, percent, relativeTime } from "@/lib/format";
import {
    Card,
    ErrorBanner,
    Icon,
    PageHeader,
    SelectField,
    Skeleton,
    cn,
} from "@/components/ui";
import type { PricePoint } from "@/components/PriceChart";

// Recharts touches the DOM on mount; keep it out of the server bundle.
const PriceChart = dynamic(() => import("@/components/PriceChart").then((m) => m.PriceChart), {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full sm:h-72" />,
});


/** Matches the watchlist route's own revalidate window; refetching sooner just re-renders identical numbers. */
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "watchlist:v1";

type CachedQuotes = { quotes: Quote[]; at: number };

function readCache(): CachedQuotes | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedQuotes;
        return Array.isArray(parsed?.quotes) && parsed.quotes.length ? parsed : null;
    } catch {
        // Private mode, disabled storage, or a stale shape — fall back to fetching.
        return null;
    }
}

function writeCache(quotes: Quote[]) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ quotes, at: Date.now() }));
    } catch {
        // Non-fatal: the page works without the cache, it just reloads each visit.
    }
}

function Change({ value, pct }: { value: number | null; pct: number | null }) {
    if (pct === null && value === null) return <span className="text-ink-subtle">—</span>;
    const up = (pct ?? value ?? 0) >= 0;
    return (
        <span className={cn("tabular inline-flex items-center gap-1", up ? "text-positive" : "text-negative")}>
            <Icon name={up ? "arrowUp" : "arrowDown"} size={14} />
            {pct !== null && <span>{percent(Math.abs(pct))}</span>}
            {value !== null && <span className="text-ink-subtle">({value >= 0 ? "+" : ""}{value.toFixed(2)})</span>}
        </span>
    );
}

export default function StocksPage() {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [selected, setSelected] = useState<string>("AAPL");
    const [currency, setCurrency] = useState("USD");
    const [currencies, setCurrencies] = useState<string[]>(["USD"]);
    const [rate, setRate] = useState(1);
    const [range, setRange] = useState<Range>("3m");
    const [points, setPoints] = useState<PricePoint[]>([]);
    const [chartError, setChartError] = useState("");
    const [refreshChart, setRefreshChart] = useState(0);
    const [asOf, setAsOf] = useState<string | null>(null);
    // Starts false: the cached paint below usually beats any network call.
    const [loadingQuotes, setLoadingQuotes] = useState(true);
    const [loadingChart, setLoadingChart] = useState(true);
    const [error, setError] = useState("");
    const [stale, setStale] = useState(false);
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);
    const [notice, setNotice] = useState("");

    // Every symbol in one cached request — see app/api/stocks/watchlist/route.ts.
    const loadQuotes = useCallback(async ({ background = false } = {}) => {
        // A background refresh keeps the existing rows on screen rather than
        // replacing them with skeletons; only a cold load has nothing to show.
        if (!background) setLoadingQuotes(true);
        setError("");
        try {
            const res = await fetch("/api/stocks/watchlist");
            const data = await res.json();

            // The route answers 200 with stale data and 503 only when there is
            // nothing at all to show.
            if (data?.quotes?.length) {
                setQuotes(data.quotes);
                setStale(Boolean(data.stale));
                setFetchedAt(Date.now());
                writeCache(data.quotes);
                if (!data.stale) setError("");
            } else if (background) {
                // Keep whatever is already on screen; a failed background refresh
                // should not wipe good rows.
                setError(data?.error || `HTTP ${res.status}`);
            } else {
                setQuotes([]);
                setStale(false);
                throw new Error(data?.error || `HTTP ${res.status}`);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load quotes");
        } finally {
            setLoadingQuotes(false);
        }
    }, []);

    /*
     * Paint from the last known prices immediately, and only go to the network if
     * they are older than the route's own cache window.
     *
     * Re-fetching from scratch on every visit showed skeletons for data that had
     * not changed — /api/stocks/watchlist is cached server-side for 5 minutes, so
     * a fresh visit inside that window was re-rendering identical numbers.
     */
    useEffect(() => {
        const cached = readCache();

        if (cached) {
            setQuotes(cached.quotes);
            setFetchedAt(cached.at);
            setLoadingQuotes(false);
        }

        const age = cached ? Date.now() - cached.at : Infinity;
        if (age > CACHE_TTL_MS) loadQuotes({ background: Boolean(cached) });
    }, [loadQuotes]);

    useEffect(() => {
        let cancelled = false;

        // Deliberately NOT gated on live quotes any more. That gate made sense while
        // candles came from the provider, but history now lives in our own database,
        // so a quote outage must not blank a chart whose data is sitting locally.

        (async () => {
            setLoadingChart(true);
            setChartError("");
            try {
                const res = await fetch(`/api/stocks/${encodeURIComponent(selected)}/candles?range=${range}`);
                const data = await res.json();
                if (cancelled) return;

                // A failed request is not the same as a symbol with no history.
                // Collapsing both into an empty array made the chart claim "not
                // enough history to chart" when the request had actually failed.
                if (!res.ok) {
                    setPoints([]);
                    setChartError(data?.error || `Request failed (${res.status})`);
                } else {
                    setPoints(data.points ?? []);
                    setAsOf(data.asOf ?? null);
                }
            } catch (e) {
                if (!cancelled) {
                    setPoints([]);
                    setChartError(e instanceof Error ? e.message : "Could not load price history");
                }
            } finally {
                if (!cancelled) setLoadingChart(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [selected, range, refreshChart]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/currencies");
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (cancelled) return;
                if (Array.isArray(data.codes) && data.codes.length) setCurrencies(data.codes);
                if (data.degraded) setNotice("Live currency list unavailable — showing common currencies.");
            } catch (e) {
                if (!cancelled) {
                    setNotice(e instanceof Error ? `Could not load currency list (${e.message}).` : "Could not load currency list.");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // One rate lookup drives the whole table, rather than converting per row.
    useEffect(() => {
        let cancelled = false;
        if (currency === "USD") {
            setRate(1);
            return;
        }
        (async () => {
            try {
                const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${currency}`);
                const data = await res.json();
                const r = data?.rates?.[currency];
                if (!cancelled) setRate(typeof r === "number" ? r : 1);
            } catch {
                if (!cancelled) setRate(1);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [currency]);

    const active = useMemo(() => quotes.find((q) => q.symbol === selected), [quotes, selected]);
    const convert = (v: number) => v * rate;
    const chartPoints = useMemo(
        () => (rate === 1 ? points : points.map((p) => ({ ...p, close: p.close * rate }))),
        [points, rate]
    );

    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-page px-4 py-8 sm:px-6">
                <PageHeader title="Markets" subtitle="Delayed prices with currency conversion" />

                <div className="mb-6 flex flex-wrap items-end gap-3 border-y border-line py-3">
                    <SelectField
                        label="Currency"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="w-40"
                    >
                        {currencies.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </SelectField>
                </div>

                {notice && !error && (
                    <div className="mb-5">
                        <ErrorBanner tone="warn" title="Heads up" message={notice} />
                    </div>
                )}
                {error && quotes.length === 0 && (
                    <div className="mb-5">
                        <ErrorBanner
                            title="Live market data is unavailable"
                            message={`${error}. Prices will return automatically once the provider responds.`}
                            onRetry={loadQuotes}
                        />
                    </div>
                )}

                {stale && quotes.length > 0 && (
                    <div className="mb-5">
                        <ErrorBanner
                            tone="warn"
                            title="Showing last known prices"
                            message="The market data provider is not responding, so these figures may be out of date."
                        />
                    </div>
                )}

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                    {/* Detail + chart */}
                    <Card className="order-2 lg:order-1 lg:self-start">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <p className="text-sm text-ink-muted">{NAME_BY_SYMBOL[selected] ?? selected}</p>
                                <h2 className="font-serif text-3xl font-semibold text-ink">{selected}</h2>
                            </div>
                            {active?.last != null && (
                                <div className="text-right">
                                    <p className="tabular text-3xl font-semibold text-ink">
                                        {money(convert(active.last), currency)}
                                    </p>
                                    <Change value={active.change} pct={active.changePercent} />
                                </div>
                            )}
                        </div>

                        <div className="mb-4 flex flex-wrap items-center gap-1">
                            {RANGE_KEYS.map((r) => (
                                <button
                                    key={r}
                                    onClick={() => setRange(r)}
                                    aria-pressed={range === r}
                                    className={cn(
                                        "rounded px-2.5 py-1 text-sm font-semibold uppercase transition-colors",
                                        range === r
                                            ? "bg-accent-strong text-accent-ink"
                                            : "text-ink-muted hover:bg-raised hover:text-ink"
                                    )}
                                >
                                    {r}
                                </button>
                            ))}
                            {asOf && (
                                <span className="ml-auto text-xs text-ink-subtle">
                                    Daily closes as of{" "}
                                    {new Date(asOf).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </span>
                            )}
                        </div>

                        {loadingChart ? (
                            <Skeleton className="h-64 w-full sm:h-72" />
                        ) : chartError ? (
                            <div className="grid h-64 place-items-center sm:h-72">
                                <div className="max-w-sm text-center">
                                    <p className="text-base font-semibold text-ink">
                                        Price history unavailable
                                    </p>
                                    <p className="mt-1 text-sm text-ink-muted">{chartError}</p>
                                    <button
                                        onClick={() => setRefreshChart((n) => n + 1)}
                                        className="mt-3 rounded border border-line px-3 py-1 text-sm font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                                    >
                                        Try again
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <PriceChart points={chartPoints} currency={currency} />
                        )}
                    </Card>

                    {/* Watchlist */}
                    <Card className="order-1 lg:order-2" padded={false}>
                        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                            <h2 className="font-serif text-xl font-semibold text-ink">Watchlist</h2>
                            <div className="flex items-center gap-2">
                                {fetchedAt && (
                                    <span className="text-2xs uppercase tracking-wide text-ink-subtle">
                                        {relativeTime(new Date(fetchedAt).toISOString())}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => loadQuotes({ background: quotes.length > 0 })}
                                    disabled={loadingQuotes}
                                    aria-label="Refresh prices"
                                    title="Refresh prices"
                                    className={cn(
                                        "grid h-8 w-8 place-items-center rounded text-ink-muted",
                                        "transition-colors hover:bg-raised hover:text-ink",
                                        "disabled:cursor-not-allowed disabled:opacity-50"
                                    )}
                                >
                                    <Icon name="refresh" size={16} />
                                </button>
                            </div>
                        </div>
                        {loadingQuotes ? (
                            <div className="space-y-3 p-4">
                                {Array.from({ length: 8 }, (_, i) => (
                                    <Skeleton key={i} className="h-9 w-full" />
                                ))}
                            </div>
                        ) : quotes.length === 0 ? (
                            <p className="px-4 py-10 text-center text-base text-ink-subtle">
                                No prices to show right now.
                            </p>
                        ) : (
                            <ul className="divide-y divide-line">
                                {quotes.map((q) => (
                                    <li key={q.symbol}>
                                        <button
                                            onClick={() => setSelected(q.symbol)}
                                            aria-current={q.symbol === selected ? "true" : undefined}
                                            className={cn(
                                                "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors",
                                                q.symbol === selected ? "bg-raised" : "hover:bg-raised"
                                            )}
                                        >
                                            <span className="min-w-0">
                                                <span className="block truncate text-base font-semibold text-ink">
                                                    {q.symbol}
                                                </span>
                                                <span className="block truncate text-xs text-ink-subtle">{q.name}</span>
                                            </span>
                                            <span className="shrink-0 text-right">
                                                <span className="tabular block text-base text-ink">
                                                    {q.last == null ? "—" : money(convert(q.last), currency)}
                                                </span>
                                                <span className="block text-xs">
                                                    <Change value={null} pct={q.changePercent} />
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {active?.volume != null && (
                            <p className="border-t border-line px-4 py-2.5 text-xs text-ink-subtle">
                                {selected} volume: <span className="tabular">{compactNumber(active.volume)}</span>
                            </p>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
