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
    const result = await fetchQuotes(revalidate);

    // 200 with stale data beats 500 with nothing; 503 when there is genuinely
    // nothing to show, so the client can say why rather than spin.
    const status = result.quotes.length > 0 ? 200 : 503;
    return NextResponse.json(result, { status });
}
