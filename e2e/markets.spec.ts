import { expect, QUOTES, test } from "./fixtures";

const row = (page: import("@playwright/test").Page, symbol: string) =>
    page.getByRole("button", { name: new RegExp(`^${symbol}\\b`) });

test("the watchlist lists every quote, selects AAPL, and loads its chart", async ({ page }) => {
    await page.goto("/stocks");
    for (const q of QUOTES) await expect(row(page, q.symbol)).toBeVisible();
    await expect(row(page, "AAPL")).toHaveAttribute("aria-current", "true");
    await expect(page.getByRole("heading", { level: 2, name: "AAPL" })).toBeVisible();
    await expect(page.locator(".recharts-wrapper svg").first()).toBeVisible();
});

test("picking a symbol and a range redraws the chart from stored history", async ({ page }) => {
    await page.goto("/stocks");
    const curve = page.locator(".recharts-area-curve").first();
    await expect(curve).toHaveAttribute("d", /\S/);
    const aapl3m = await curve.getAttribute("d");

    const msft = page.waitForResponse((r) => r.url().includes("/api/stocks/MSFT/candles?range=3m"));
    await row(page, "MSFT").click();
    expect((await msft).status()).toBe(200);
    await expect(page.getByRole("heading", { level: 2, name: "MSFT" })).toBeVisible();
    await expect(curve).not.toHaveAttribute("d", aapl3m!);
    const msft3m = await curve.getAttribute("d");

    const year = page.waitForResponse((r) => r.url().includes("/api/stocks/MSFT/candles?range=1y"));
    await page.getByRole("button", { name: "1y", exact: true }).click();
    const res = await year;
    expect(res.status()).toBe(200);
    const body: { points?: Array<{ t: number; close: number }> } = await res.json();
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points!.length).toBeGreaterThan(0);
    await expect(page.getByRole("button", { name: "1y", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(curve).not.toHaveAttribute("d", msft3m!);
});

test("switching to EUR converts the watchlist", async ({ page }) => {
    await page.goto("/stocks");
    await expect(row(page, "AAPL")).toBeVisible();
    await page.getByLabel("Currency").selectOption("EUR");
    const expected = await page.evaluate(() =>
        new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(100)
    );
    await expect(row(page, "AAPL")).toContainText(expected);
});

test("a quote outage shows a retry and keeps the chart", async ({ page }) => {
    await page.route("**/api/stocks/watchlist", (route) =>
        route.fulfill({ status: 503, json: { quotes: [], stale: false, error: "Quotes unavailable" } })
    );
    await page.goto("/stocks");
    await expect(page.getByText("Live market data is unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator(".recharts-wrapper svg").first()).toBeVisible();
});
