"use client";

import { useCallback, useEffect, useState } from "react";
import type { Quote } from "@/lib/stocks";

/**
 * Shared quote loading for the watchlist and the front-page ticker.
 *
 * Both surfaces want the same thing: show the last known prices immediately, and
 * only go to the network when they are genuinely old. Refetching on every visit
 * meant skeletons (or an empty ticker) for numbers that had not changed —
 * /api/stocks/watchlist is cached server-side for five minutes, so a visit inside
 * that window was re-rendering identical values.
 *
 * Note this costs nothing in provider credits either way: the underlying
 * bulkquotes call is billed at zero, and the route's cache means at most one
 * upstream request per five minutes regardless of how many people visit.
 */

/** Matches the watchlist route's revalidate window. */
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

type RefreshOptions = { background?: boolean };

export function useQuotes() {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [stale, setStale] = useState(false);
    const [error, setError] = useState("");
    const [fetchedAt, setFetchedAt] = useState<number | null>(null);

    const refresh = useCallback(async ({ background = false }: RefreshOptions = {}) => {
        // A background refresh keeps the existing rows on screen rather than
        // replacing them with skeletons; only a cold load has nothing to show.
        if (!background) setLoading(true);
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
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const cached = readCache();

        if (cached) {
            setQuotes(cached.quotes);
            setFetchedAt(cached.at);
            setLoading(false);
        }

        const age = cached ? Date.now() - cached.at : Infinity;
        if (age > CACHE_TTL_MS) refresh({ background: Boolean(cached) });
    }, [refresh]);

    return { quotes, loading, stale, error, fetchedAt, refresh };
}

/** Derived from the implementation, so it cannot drift out of sync. */
export type UseQuotes = ReturnType<typeof useQuotes>;
