import { expect, QUOTES, test } from "./fixtures";
import { seedArticles } from "./global-setup";

const [newest, newestWithPicture] = seedArticles().map((a) => a.title);

test("leads with the newest story that has a picture, then 9 features and 12 briefs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "The Newspaper" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(22);
    const brief = page.getByRole("region", { name: "In brief" });
    await expect(brief.getByRole("article")).toHaveCount(12);
    const lead = page.getByRole("article").first();
    await expect(lead.getByRole("heading", { level: 2 })).toHaveText(newestWithPicture);
    await expect(brief.getByRole("heading", { name: newest })).toBeVisible();
    await expect(page.getByRole("article").getByRole("heading", { level: 3 })).toHaveCount(21);
});

test("shows the markets strip", async ({ page }) => {
    await page.goto("/");
    const markets = page.getByRole("region", { name: "Markets" });
    for (const q of QUOTES) await expect(markets.getByRole("link", { name: new RegExp(q.symbol) })).toBeVisible();
});

test("browse all sections opens the news page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Browse all sections" }).click();
    await expect(page).toHaveURL(/\/news$/);
    await expect(page.getByRole("tab", { name: "Top Stories" })).toHaveAttribute("aria-selected", "true");
});

test("does not scroll sideways", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Markets" }).getByRole("link")).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
