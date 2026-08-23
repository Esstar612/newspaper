// app/api/stocks/[symbol]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * marketdata.app returns every field as a single-element array
 * ({"s":"ok","last":[309.69],"bid":[309.55],...}), so unwrap before use.
 * The old code passed the raw object straight to the client, which is why the
 * page rendered tiles for `s: "ok"` and `bidSize` and never formatted anything.
 */
const num = (v: unknown): number | null => {
    const raw = Array.isArray(v) ? v[0] : v;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ symbol: string }> }
) {
    const { symbol } = await params;
    const { searchParams } = new URL(request.url);
    const currency = (searchParams.get("currency") || "USD").toUpperCase();

    try {
        const token = process.env.MARKET_DATA_API_TOKEN;
        if (!token) {
            return NextResponse.json(
                { error: "Market data API token not configured" },
                { status: 500 }
            );
        }

        // Symbols such as "BRK.A" must not be interpolated raw into the path.
        const stockURL = `https://api.marketdata.app/v1/stocks/quotes/${encodeURIComponent(
            symbol
        )}/?token=${token}`;
        const stockResponse = await fetch(stockURL, { cache: "no-store" });

        if (!stockResponse.ok) {
            throw new Error(`Quote lookup failed (HTTP ${stockResponse.status})`);
        }

        const raw = await stockResponse.json();

        // The provider signals failure in the body, not the status code.
        if (raw?.s && raw.s !== "ok") {
            throw new Error(raw.errmsg || `No quote available for ${symbol}`);
        }

        const last = num(raw?.last) ?? num(raw?.mid) ?? num(raw?.ask);
        if (last === null) throw new Error(`No price available for ${symbol}`);

        const quote = {
            symbol: (Array.isArray(raw?.symbol) ? raw.symbol[0] : raw?.symbol) ?? symbol,
            currency: "USD",
            last,
            change: num(raw?.change),
            changePercent: num(raw?.changepct),
            bid: num(raw?.bid),
            ask: num(raw?.ask),
            volume: num(raw?.volume),
            updated: num(raw?.updated),
            converted: null as null | { currency: string; last: number; rate: number },
        };

        if (currency && currency !== "USD") {
            const moneyURL = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${encodeURIComponent(
                currency
            )}`;
            const moneyResponse = await fetch(moneyURL, { next: { revalidate: 3600 } });

            if (!moneyResponse.ok) {
                throw new Error(`Currency conversion failed (HTTP ${moneyResponse.status})`);
            }

            const moneyData = await moneyResponse.json();
            const rate = moneyData?.rates?.[currency];

            if (typeof rate !== "number") {
                throw new Error(`No USD to ${currency} rate available`);
            }

            quote.converted = { currency, last: last * rate, rate };
        }

        return NextResponse.json(quote);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch stock data" },
            { status: 500 }
        );
    }
}
