import { test as base, expect } from "@playwright/test";
import { makeQuote } from "../tests/fixtures/quotes";
import { ORIGIN } from "../playwright.config";

export const QUOTES = [
    makeQuote("AAPL", { changePercent: 0.015 }),
    makeQuote("MSFT", { changePercent: -0.005 }),
    makeQuote("GOOGL", { changePercent: 0.002 }),
];

export const WEATHER = {
    location: "London",
    temperature: 14.2,
    condition: "Clouds",
    description: "broken clouds",
    icon: "04d",
    humidity: 71,
    time: "3:00 PM",
};

export const FORECAST = {
    city: "London",
    timezone: 3600,
    list: Array.from({ length: 40 }, (_, i) => {
        const dt = Date.parse("2026-09-30T00:00:00Z") / 1000 + i * 3 * 3600;
        return {
            dt,
            dt_txt: new Date(dt * 1000).toISOString().replace("T", " ").slice(0, 19),
            main: { temp: 12 + (i % 8), humidity: 60 + (i % 10) },
            weather: [{ main: "Clouds", description: "broken clouds", icon: "04d" }],
        };
    }),
};

export const PLACES = [
    { name: "London", country: "GB", lat: 51.5073, lon: -0.1276 },
    { name: "London", country: "CA", state: "Ontario", lat: 42.9832, lon: -81.2433 },
];

const PIXEL = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
);

export const test = base.extend<{ offOrigin: string[] }>({
    offOrigin: [
        async ({ page }, run) => {
            const blocked: string[] = [];
            await page.route(
                (url) => url.origin !== ORIGIN && url.protocol !== "data:",
                (route) => {
                    blocked.push(route.request().url());
                    return route.abort();
                }
            );
            await page.route("**/api/stocks/watchlist", (route) => route.fulfill({ json: { quotes: QUOTES, stale: false } }));
            await page.route("**/api/currencies", (route) => route.fulfill({ json: { codes: ["USD", "EUR", "GBP"] } }));
            await page.route(/\/api\/weather\?/, (route) => route.fulfill({ json: WEATHER }));
            await page.route(/\/api\/forecast\?/, (route) => route.fulfill({ json: FORECAST }));
            await page.route(/\/api\/geocoding\?/, (route) => route.fulfill({ json: PLACES }));
            await page.route("https://api.frankfurter.dev/**", (route) => route.fulfill({ json: { rates: { EUR: 0.5 } } }));
            await page.route("https://openweathermap.org/img/wn/**", (route) =>
                route.fulfill({ contentType: "image/png", body: PIXEL })
            );
            await run(blocked);
            expect(blocked, "requests that left the origin").toEqual([]);
        },
        { auto: true },
    ],
});

export { expect };
