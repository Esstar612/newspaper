// app/api/stocks/[symbol]/candles/route.ts
//
// Daily price history, served entirely from MongoDB.
//
// This route deliberately makes NO provider call. History is written once a day by
// /api/cron/refresh-candles; see models/CandleSeries.ts for why. Adding a live
// fallback here would reintroduce exactly the dependency that change removed, so
// a missing series returns empty points with a reason instead.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CandleSeries } from "@/models/CandleSeries";
import { RANGES, type Range } from "@/lib/stocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    const { symbol } = await params;
    const requested = request.nextUrl.searchParams.get("range") ?? "3m";
    const range: Range = requested in RANGES ? (requested as Range) : "3m";

    try {
        await connectDB();

        const series = await CandleSeries.findOne({ symbol: symbol.toUpperCase() })
            .select({ points: 1, fetchedAt: 1 })
            .lean();

        if (!series) {
            return NextResponse.json(
                {
                    symbol,
                    range,
                    points: [],
                    error: "No stored history for this symbol yet — it is written by the daily job.",
                },
                { status: 404 }
            );
        }

        // One stored year serves every range: each is just a tail of the same array.
        const cutoff = Date.now() - RANGES[range] * DAY_MS;
        const points = (series.points ?? []).filter((p) => p.t >= cutoff);

        return NextResponse.json({
            symbol,
            range,
            points,
            asOf: series.fetchedAt ?? null,
        });
    } catch (error) {
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Failed to read history",
                points: [],
            },
            { status: 500 }
        );
    }
}
