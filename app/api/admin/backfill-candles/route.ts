// app/api/admin/backfill-candles/route.ts
//
// Populates price history on demand, so the chart works immediately after deploy
// rather than waiting for the first scheduled run. Same work as
// /api/cron/refresh-candles, but gated on the admin token instead of CRON_SECRET.
// Idempotent — safe to re-run.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CandleSeries } from "@/models/CandleSeries";
import { SYMBOL_LIST, fetchCandles, HISTORY_DAYS, type CandlePoint } from "@/lib/stocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bearer = (req: NextRequest) =>
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(req: NextRequest) {
    const expected = process.env.ADMIN_INGEST_TOKEN;
    if (!expected) {
        return NextResponse.json({ error: "ADMIN_INGEST_TOKEN not configured" }, { status: 500 });
    }
    if (bearer(req) !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const now = new Date();
    const results: Array<{ symbol: string; points: number; error?: string }> = [];
    const ops: Parameters<typeof CandleSeries.bulkWrite>[0] = [];

    // Sequential, for the same single-IP reason as the cron.
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
            results.push({
                symbol,
                points: 0,
                error: e instanceof Error ? e.message : "Fetch failed",
            });
        }

        await sleep(250);
    }

    const result = ops.length ? await CandleSeries.bulkWrite(ops, { ordered: false }) : null;

    // Post-run census, so it is obvious whether every symbol now has history.
    const stored = await CandleSeries.find({}).select({ symbol: 1, points: 1 }).lean();
    const pointsPerSymbol = Object.fromEntries(
        stored.map((s) => [s.symbol, (s.points ?? []).length])
    );

    return NextResponse.json({
        status: "ok",
        timestamp: now,
        symbols: results,
        failedSymbols: results.filter((r) => r.error).length,
        db: {
            upserted: result?.upsertedCount ?? 0,
            matched: result?.matchedCount ?? 0,
            modified: result?.modifiedCount ?? 0,
        },
        pointsPerSymbol,
    });
}

export const POST = run;
// GET is allowed too - it is idempotent, and it makes the populate easy to trigger by hand.
export const GET = run;
