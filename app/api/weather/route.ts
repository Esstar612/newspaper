import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type WeatherResponse = {
  name: string;
  dt: number;
  timezone: number;
  weather: { main: string; description: string; icon: string }[];
  main: { temp: number; humidity: number };
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

    const url = new URL("https://api.openweathermap.org/data/2.5/weather");

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
          { error: `OpenWeather failed (${res.status})`, details: text },
          { status: 502 }
      );
    }

    const data: WeatherResponse = await res.json();

    const localTime = new Date((data.dt + data.timezone) * 1000).toLocaleTimeString("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    });

    return NextResponse.json({
      location: data.name,
      temperature: data.main.temp,
      condition: data.weather?.[0]?.main ?? "",
      description: data.weather?.[0]?.description ?? "",
      icon: data.weather?.[0]?.icon ?? "",
      humidity: data.main.humidity,
      time: localTime,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Weather failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}