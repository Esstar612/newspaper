// app/api/cron/refresh-candles/route.ts
//
// Writes daily price history into MongoDB so the chart never calls the provider.
//
// marketdata.app permits one active IP per account and states that serverless is
// unsupported, because rotating outbound IPs look like multiple devices. Fetching
// history per request meant 40 upstream calls (10 symbols x 4 ranges) from
// scattered lambda IPs. This runs once a day in a single invocation — one IP,
// ten sequential calls — and every chart read is then served from the database.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CandleSeries } from "@/models/CandleSeries";
import { SYMBOL_LIST, fetchCandles, HISTORY_DAYS, type CandlePoint } from "@/lib/stocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Small gap between calls so a run never looks like a burst. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();

        const now = new Date();
        const results: Array<{ symbol: string; points: number; error?: string }> = [];
        const ops: Parameters<typeof CandleSeries.bulkWrite>[0] = [];

        // Sequential on purpose — see the note in lib/stocks.ts. Ten calls at a few
        // hundred milliseconds each sits comfortably inside maxDuration.
        for (const symbol of SYMBOL_LIST) {
            try {
                const points: CandlePoint[] = await fetchCandles(symbol, HISTORY_DAYS);
                results.push({ symbol, points: points.length });

                if (points.length > 0) {
                    ops.push({
                        updateOne: {
                            filter: { symbol },
                            update: { $set: { symbol, points, fetchedAt: now } },
                            upsert: true,
                        },
                    });
                }
            } catch (e) {
                // Per-symbol errors are reported rather than swallowed, so a symbol
                // that stops working is visible instead of silently empty.
                results.push({
                    symbol,
                    points: 0,
                    error: e instanceof Error ? e.message : "Fetch failed",
                });
            }

            await sleep(250);
        }

        const result = ops.length ? await CandleSeries.bulkWrite(ops, { ordered: false }) : null;
        const failed = results.filter((r) => r.error);

        return NextResponse.json({
            status: failed.length === SYMBOL_LIST.length ? "failed" : "success",
            timestamp: now,
            symbols: results,
            failedSymbols: failed.length,
            db: {
                upserted: result?.upsertedCount ?? 0,
                matched: result?.matchedCount ?? 0,
                modified: result?.modifiedCount ?? 0,
            },
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Candle refresh failed" },
            { status: 500 }
        );
    }
}
