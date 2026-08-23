"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quote } from "@/lib/stocks";
import { money, percent } from "@/lib/format";
import { cn } from "@/components/ui";

/**
 * Client island on purpose.
 *
 * This used to be fetched server-side in app/page.tsx, but that page sets
 * `dynamic = "force-dynamic"`, which overrides fetch caching — so every single
 * homepage view made a live third-party call and blocked render on it (measured
 * at 300-590ms versus ~100ms for /news).
 *
 * Reading /api/stocks/watchlist instead means the route handler's own 5-minute
 * cache actually applies, the homepage renders news immediately, and a market
 * data outage can neither slow nor break the front page.
 */
export function MarketsStrip() {
    const [quotes, setQuotes] = useState<Quote[]>([]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const res = await fetch("/api/stocks/watchlist");
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.quotes)) setQuotes(data.quotes);
            } catch {
                // A ticker that fails should simply not appear. It is decoration on a
                // news front page, not a status panel.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    if (quotes.length === 0) return null;

    return (
        <section aria-label="Markets" className="border-y border-line">
            <div className="no-scrollbar flex gap-6 overflow-x-auto py-3">
                {quotes.map((q) => {
                    const up = (q.changePercent ?? 0) >= 0;
                    return (
                        <Link
                            key={q.symbol}
                            href="/stocks"
                            className="flex shrink-0 items-baseline gap-2 no-underline"
                        >
                            <span className="text-sm font-semibold text-ink">{q.symbol}</span>
                            <span className="tabular text-sm text-ink-muted">
                                {q.last == null ? "—" : money(q.last, "USD")}
                            </span>
                            {q.changePercent !== null && (
                                <span className={cn("tabular text-xs", up ? "text-positive" : "text-negative")}>
                                    {up ? "▲" : "▼"} {percent(Math.abs(q.changePercent))}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
