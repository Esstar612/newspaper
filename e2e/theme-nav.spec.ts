import { expect, test } from "./fixtures";

const html = (page: import("@playwright/test").Page) => page.locator("html");

test.describe("dark system theme", () => {
    test.use({ colorScheme: "dark" });

    test("starts dark, and a light choice survives a reload", async ({ page }) => {
        await page.goto("/news");
        await expect(html(page)).not.toHaveClass(/\blight\b/);
        await page.getByRole("button", { name: "Switch to light theme" }).click();
        await expect(html(page)).toHaveClass(/\blight\b/);
        await page.reload();
        await expect(html(page)).toHaveClass(/\blight\b/);
        await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
    });
});

test.describe("light system theme", () => {
    test.use({ colorScheme: "light" });

    test("starts light with no stored choice", async ({ page }) => {
        await page.goto("/news");
        await expect(html(page)).toHaveClass(/\blight\b/);
    });
});

test("the section nav reaches every section", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Sections" });
    for (const [name, path] of [["News", "/news"], ["Stocks", "/stocks"], ["Weather", "/weather"]]) {
        await nav.getByRole("link", { name }).click();
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await expect(nav.getByRole("link", { name })).toHaveAttribute("aria-current", "page");
    }
});
