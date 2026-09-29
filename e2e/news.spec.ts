import { expect, test } from "./fixtures";

const headlines = (page: import("@playwright/test").Page) =>
    page.getByRole("tabpanel").getByRole("heading", { name: /^\w+ story \d+$/ });

test("a section tab drives the URL and survives a reload", async ({ page }) => {
    await page.goto("/news");
    await page.getByRole("tab", { name: "Business" }).click();
    await expect(page).toHaveURL(/\?category=business$/);
    await expect(page.getByRole("tab", { name: "Business" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Business · 20 articles")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tab", { name: "Business" })).toHaveAttribute("aria-selected", "true");
});

test("ArrowRight moves to the next section", async ({ page }) => {
    await page.goto("/news?category=business");
    await expect(page.getByText("Business · 20 articles")).toBeVisible();
    await page.getByRole("tab", { name: "Business" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\?category=technology$/);
    await expect(page.getByRole("tab", { name: "Technology" })).toHaveAttribute("aria-selected", "true");
});

test("search stays inside the section", async ({ page }) => {
    await page.goto("/news?category=business");
    await expect(page.getByText("Business · 20 articles")).toBeVisible();
    await page.getByRole("button", { name: "Search articles" }).click();
    await page.getByRole("textbox", { name: "Search articles" }).fill("rates");
    await page.getByRole("button", { name: "Go" }).click();
    await expect(page.getByText(/1 result for “rates” in Business/)).toBeVisible();
    await expect(page.getByRole("link", { name: "World rates story" })).toHaveCount(0);
});

test("load more appends the rest of the section once", async ({ page }) => {
    await page.goto("/news?category=business");
    await expect(headlines(page)).toHaveCount(20);
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(headlines(page)).toHaveCount(30);
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
    const titles = await headlines(page).allTextContents();
    expect(new Set(titles).size).toBe(30);
});
