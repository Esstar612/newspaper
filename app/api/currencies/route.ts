// app/api/currencies/route.ts
//
// Proxies the Frankfurter currency list.
//
// The page used to fetch api.frankfurter.app directly from the browser. That host
// was retired and now 301s to api.frankfurter.dev, but the redirect carries no
// Access-Control-Allow-Origin header - and every hop of a CORS redirect chain must
// pass the CORS check before the browser will follow it, so the fetch just died.
// Going through the server sidesteps that whole class of breakage and lets us cache.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Exchange rate listings change about as often as new currencies are minted.
export const revalidate = 86400;

/** Enough to keep the picker usable if the provider is unreachable. */
const FALLBACK: Record<string, string> = {
    USD: "United States Dollar",
    EUR: "Euro",
    GBP: "British Pound",
    JPY: "Japanese Yen",
    CAD: "Canadian Dollar",
    AUD: "Australian Dollar",
    CHF: "Swiss Franc",
    CNY: "Chinese Renminbi Yuan",
    INR: "Indian Rupee",
};

export async function GET() {
    try {
        const res = await fetch("https://api.frankfurter.dev/v1/currencies", {
            next: { revalidate },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            throw new Error("Unexpected response shape");
        }

        const codes = Object.keys(data).sort();
        if (codes.length === 0) throw new Error("Empty currency list");

        return NextResponse.json({ currencies: data, codes });
    } catch (error) {
        // Degrade to the fallback rather than leaving the dropdown empty.
        return NextResponse.json({
            currencies: FALLBACK,
            codes: Object.keys(FALLBACK).sort(),
            degraded: true,
            error: error instanceof Error ? error.message : "Failed to fetch currencies",
        });
    }
}
