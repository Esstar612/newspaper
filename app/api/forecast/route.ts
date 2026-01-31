import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ForecastItem = {
    dt: number;
    dt_txt: string;
    main: { temp: number; humidity: number };
    weather: { main: string; description: string; icon: string }[];
};

type ForecastResponse = {
    city: { name: string; timezone: number };
    list: ForecastItem[];
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

        const url = new URL("https://api.openweathermap.org/data/2.5/forecast");

        // Support both city name and coordinates
        if (lat && lon) {
            url.searchParams.set("lat", lat);
            url.searchParams.set("lon", lon);
        } else if (q) {
            url.searchParams.set("q", q);
        } else {
            return NextResponse.json({ error: "Missing ?q= or ?lat= and ?lon=" }, { status: 400 });
        }

        url.searchParams.set("appid", key);
        url.searchParams.set("units", "metric");

        const res = await fetch(url.toString(), { cache: "no-store" });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return NextResponse.json(
                { error: `OpenWeather forecast failed (${res.status})`, details: text },
                { status: 502 }
            );
        }

        const data: ForecastResponse = await res.json();

        return NextResponse.json({
            city: data.city?.name ?? q,
            timezone: data.city?.timezone ?? 0,
            list: (data.list ?? []).map((x) => ({
                dt: x.dt,
                dt_txt: x.dt_txt,
                main: {
                    temp: x.main?.temp ?? 0,
                    humidity: x.main?.humidity ?? 0,
                },
                weather: x.weather ?? [],
            })),
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Forecast failed";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}