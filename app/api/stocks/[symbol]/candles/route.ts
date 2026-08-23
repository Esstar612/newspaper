// app/api/stocks/[symbol]/candles/route.ts
//
// Daily OHLC history for the price chart. Cached for the same quota reason as
// the watchlist route — see lib/stocks.ts.
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600;

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGES: Record<string, number> = {
    "1m": 31,
    "3m": 93,
    "6m": 186,
    "1y": 366,
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    const { symbol } = await params;
    const range = request.nextUrl.searchParams.get("range") ?? "3m";
    const days = RANGES[range] ?? RANGES["3m"];

    try {
        const token = process.env.MARKET_DATA_API_TOKEN;
        if (!token) {
            return NextResponse.json({ error: "Market data API token not configured" }, { status: 500 });
        }

        const to = new Date();
        const from = new Date(to.getTime() - days * DAY_MS);
        const iso = (d: Date) => d.toISOString().slice(0, 10);

        const url =
            `https://api.marketdata.app/v1/stocks/candles/D/${encodeURIComponent(symbol)}/` +
            `?from=${iso(from)}&to=${iso(to)}&token=${token}`;

        const res = await fetch(url, { next: { revalidate } });
        if (!res.ok) throw new Error(`History lookup failed (HTTP ${res.status})`);

        const raw = await res.json();
        // "no_data" is a legitimate answer for a symbol with no candles in range.
        if (raw?.s === "no_data") return NextResponse.json({ symbol, range, points: [] });
        if (raw?.s && raw.s !== "ok") throw new Error(raw.errmsg || "No history available");

        const t: unknown = raw?.t;
        const c: unknown = raw?.c;
        if (!Array.isArray(t) || !Array.isArray(c)) throw new Error("Unexpected response shape");

        const points = t
            .map((sec, i) => ({
                t: Number(sec) * 1000,
                close: typeof c[i] === "number" ? (c[i] as number) : null,
            }))
            .filter((p): p is { t: number; close: number } => p.close !== null);

        return NextResponse.json({ symbol, range, points });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch history", points: [] },
            { status: 500 }
        );
    }
}
