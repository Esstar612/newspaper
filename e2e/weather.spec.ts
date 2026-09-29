import { expect, test } from "./fixtures";

test("searching for a city shows its conditions and forecast", async ({ page }) => {
    await page.goto("/weather");
    const weather = page.waitForRequest((r) => new URL(r.url()).searchParams.get("q") === "London" && r.url().includes("/api/weather"));
    const forecast = page.waitForRequest((r) => new URL(r.url()).searchParams.get("q") === "London" && r.url().includes("/api/forecast"));

    await page.getByRole("combobox", { name: "City" }).fill("Lon");
    await page.getByRole("option", { name: "London, GB", exact: true }).click();

    await Promise.all([weather, forecast]);
    await expect(page.getByText("London", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "broken clouds" })).toBeVisible();
    await expect(page.getByText("14°", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "5-day forecast" })).toBeVisible();
});

test.describe("with location granted", () => {
    test.use({ permissions: ["geolocation"], geolocation: { latitude: 51.5, longitude: -0.12 } });

    test("loads the local weather on arrival", async ({ page }) => {
        const reverse = page.waitForRequest((r) => {
            const url = new URL(r.url());
            return url.pathname === "/api/geocoding" && url.searchParams.get("lat") === "51.5" && url.searchParams.get("lon") === "-0.12";
        });
        await page.goto("/weather");
        await reverse;
        await expect(page.getByRole("img", { name: "broken clouds" })).toBeVisible();
        await expect(page.getByRole("combobox", { name: "City" })).toHaveValue("London");
    });
});
