import { expect, test } from "./fixtures";

const headlines = (page: import("@playwright/test").Page) =>
    page.getByRole("tabpanel").getByRole("heading", { name: /^\w+ story \d+$/ });

test("a section tab drives the URL and survives a reload", async ({ page }) => {
    await page.goto("/news");
    await page.getByRole("tab", { name: "Business" }).click();
    await expect(page).toHaveURL(/\?category=business$/);
    await expect(page.getByRole("tab", { name: "Business" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText(/^20 articles · Newest story /)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tab", { name: "Business" })).toHaveAttribute("aria-selected", "true");
});

test("ArrowRight moves to the next section", async ({ page }) => {
    await page.goto("/news?category=business");
    await expect(page.getByText(/^20 articles · Newest story /)).toBeVisible();
    await page.getByRole("tab", { name: "Business" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\?category=technology$/);
    await expect(page.getByRole("tab", { name: "Technology" })).toHaveAttribute("aria-selected", "true");
});

test("Enter filters the grid to matches inside the section", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
        route.fulfill({ json: { segments: [{ text: "Rates held.", cites: [] }], sources: [], refused: false, truncated: false } })
    );
    await page.goto("/news?category=business");
    await expect(page.getByText(/^20 articles · Newest story /)).toBeVisible();
    const box = page.getByRole("combobox", { name: "Search headlines or ask a question" });
    await box.fill("rates");
    await expect(page.getByRole("option", { name: /Business story 01/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /World rates story/ })).toHaveCount(0);
    await box.press("Enter");
    await expect(page.getByText("Stories matching your question · 1")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("Central bank holds rates steady")).toBeVisible();
    await expect(page.getByRole("link", { name: "World rates story" })).toHaveCount(0);
    await expect(page.getByText(/Newest story/)).toHaveCount(0);
});

test("the open suggestion list causes no sideways scroll", async ({ page }) => {
    await page.goto("/news");
    await page.getByRole("combobox", { name: "Search headlines or ask a question" }).fill("story");
    await expect(page.getByRole("listbox")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
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
