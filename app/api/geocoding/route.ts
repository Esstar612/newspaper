import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const must = (v: string | undefined, name: string) => {
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
};

export async function GET(req: NextRequest) {
    try {
        const key = must(process.env.WEATHER_API_KEY, "WEATHER_API_KEY");

        const { searchParams } = new URL(req.url);
        const q = (searchParams.get("q") || "").trim();

        if (!q) {
            return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });
        }

        // OpenWeatherMap Geocoding API
        const url = new URL("http://api.openweathermap.org/geo/1.0/direct");
        url.searchParams.set("q", q);
        url.searchParams.set("limit", "5");
        url.searchParams.set("appid", key);

        const res = await fetch(url.toString(), { cache: "no-store" });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return NextResponse.json(
                { error: `Geocoding failed (${res.status})`, details: text },
                { status: 502 }
            );
        }

        const data = await res.json();

        // Transform to simpler format
        const suggestions = data.map((item: any) => ({
            name: item.name,
            country: item.country,
            state: item.state,
            lat: item.lat,
            lon: item.lon,
        }));

        return NextResponse.json(suggestions);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Geocoding failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}