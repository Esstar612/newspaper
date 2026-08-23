// app/api/stocks/watchlist/route.ts
//
// One `bulkquotes` call for every tracked symbol, cached.
//
// The free tier is 100 requests/day (x-api-ratelimit-limit). Fanning out one
// request per symbol would burn the quota in ten page loads. The fetch itself
// lives in lib/stocks.ts so the front page shares it rather than reimplementing.
import { NextResponse } from "next/server";
import { fetchQuotes } from "@/lib/stocks";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
    try {
        return NextResponse.json({ quotes: await fetchQuotes(revalidate) });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch quotes", quotes: [] },
            { status: 500 }
        );
    }
}
