import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type OwmPlace = {
    name?: string;
    country?: string;
    state?: string;
    lat?: number;
    lon?: number;
};

const must = (v: string | undefined, name: string) => {
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
};

export async function GET(req: NextRequest) {
    try {
        const key = must(process.env.WEATHER_API_KEY, "WEATHER_API_KEY");

        const { searchParams } = new URL(req.url);
        const q = (searchParams.get("q") || "").trim();
        const lat = searchParams.get("lat");
        const lon = searchParams.get("lon");

        // Two modes: forward (?q=name) and reverse (?lat=&lon=).
        //
        // Reverse exists so coordinates resolve to a place name that OpenWeather's
        // own forward search will find again. Third-party reverse geocoders return
        // administrative areas ("Metro Vancouver Regional District") that are not in
        // OpenWeather's index, so the resulting name is unsearchable.
        let url: URL;

        if (lat !== null && lon !== null) {
            const latNum = Number(lat);
            const lonNum = Number(lon);

            if (!Number.isFinite(latNum) || Math.abs(latNum) > 90 ||
                !Number.isFinite(lonNum) || Math.abs(lonNum) > 180) {
                return NextResponse.json({ error: "Invalid ?lat= / ?lon=" }, { status: 400 });
            }

            url = new URL("https://api.openweathermap.org/geo/1.0/reverse");
            url.searchParams.set("lat", String(latNum));
            url.searchParams.set("lon", String(lonNum));
        } else if (q) {
            url = new URL("https://api.openweathermap.org/geo/1.0/direct");
            url.searchParams.set("q", q);
        } else {
            return NextResponse.json(
                { error: "Missing ?q= or ?lat= and ?lon=" },
                { status: 400 }
            );
        }

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

        const data: unknown = await res.json();
        if (!Array.isArray(data)) return NextResponse.json([]);

        const suggestions = (data as OwmPlace[])
            .filter((item) => typeof item?.name === "string" && item.name.trim() !== "")
            .map((item) => ({
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
