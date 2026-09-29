import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/weather/route";
import { server } from "../msw";

const OPENWEATHER = "https://api.openweathermap.org/data/2.5/weather";

const currentWeather = {
    weather: [{ id: 800, main: "Clear", description: "clear sky", icon: "01d" }],
    main: { temp: 16.2, feels_like: 15.8, humidity: 55 },
    dt: 1727640000,
    timezone: -18000,
    name: "Chicago",
};

const get = (query: string) => GET(new NextRequest(`http://localhost/api/weather${query}`));

beforeEach(() => vi.stubEnv("WEATHER_API_KEY", "test-key"));
afterEach(() => vi.unstubAllEnvs());

it("maps OpenWeather's response into the page's shape", async () => {
    let upstream: URL | undefined;
    server.use(
        http.get(OPENWEATHER, ({ request }) => {
            upstream = new URL(request.url);
            return HttpResponse.json(currentWeather);
        }),
    );

    const res = await get("?q=Chicago");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
        location: "Chicago",
        temperature: 16.2,
        condition: "Clear",
        description: "clear sky",
        icon: "01d",
        humidity: 55,
    });
    expect(body.time).toMatch(/^3:00\sPM$/);
    expect(upstream?.searchParams.get("q")).toBe("Chicago");
    expect(upstream?.searchParams.get("appid")).toBe("test-key");
    expect(upstream?.searchParams.get("units")).toBe("metric");
});

it("prefers coordinates over a city name", async () => {
    let upstream: URL | undefined;
    server.use(
        http.get(OPENWEATHER, ({ request }) => {
            upstream = new URL(request.url);
            return HttpResponse.json(currentWeather);
        }),
    );

    await get("?q=Chicago&lat=41.88&lon=-87.63");

    expect(upstream?.searchParams.get("lat")).toBe("41.88");
    expect(upstream?.searchParams.get("lon")).toBe("-87.63");
    expect(upstream?.searchParams.has("q")).toBe(false);
});

it("rejects a request with no location", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing ?q= or ?lat= and ?lon=" });
});

it("reports an upstream failure as a 502", async () => {
    server.use(http.get(OPENWEATHER, () => HttpResponse.json({ cod: "404", message: "city not found" }, { status: 404 })));

    const res = await get("?q=Nowhere");

    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("OpenWeather failed (404)");
});

it("returns empty condition fields when OpenWeather sends no weather entry", async () => {
    server.use(http.get(OPENWEATHER, () => HttpResponse.json({ ...currentWeather, weather: [] })));

    const body = await (await get("?q=Chicago")).json();

    expect(body).toMatchObject({ condition: "", description: "", icon: "" });
});

it("fails clearly when the API key is missing", async () => {
    vi.stubEnv("WEATHER_API_KEY", undefined);

    const res = await get("?q=Chicago");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Missing env var: WEATHER_API_KEY" });
});
