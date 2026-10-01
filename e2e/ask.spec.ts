import { expect, test } from "./fixtures";

const answer = {
    segments: [
        { text: "Business story 01 was the top story", cites: [1] },
        { text: " and a central bank held rates", cites: [2] },
        { text: ".", cites: [] },
    ],
    sources: [
        { n: 1, url: "https://example.com/story-01", title: "Business story 01" },
        { n: 2, url: "https://example.com/story-02", title: "Business story 02" },
    ],
    refused: false,
    truncated: false,
};

test("asks a question about the open section and links the sources", async ({ page }) => {
    const sent: unknown[] = [];
    await page.route("**/api/ask", async (route) => {
        sent.push(route.request().postDataJSON());
        await route.fulfill({ json: answer });
    });
    await page.goto("/news?category=business");
    await page.getByRole("button", { name: "Ask a question" }).click();
    await page.getByRole("textbox", { name: "Ask about recent news" }).fill("What happened in business?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    await expect(page.getByText("Business story 01 was the top story [1] and a central bank held rates [2].")).toBeVisible();
    const sources = page.getByRole("list", { name: "Sources" }).getByRole("link");
    await expect(sources).toHaveCount(2);
    await expect(sources.first()).toHaveAttribute("href", "https://example.com/story-01");
    expect(sent).toEqual([{ q: "What happened in business?", category: "business" }]);
});

test("explains the limit when too many questions are asked", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
        route.fulfill({ status: 429, json: { error: "Too many questions.", scope: "ip", resetAt: "2026-10-01T15:00:00.000Z" } })
    );
    await page.goto("/news");
    await page.getByRole("button", { name: "Ask a question" }).click();
    await page.getByRole("textbox", { name: "Ask about recent news" }).fill("What happened today?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByRole("region", { name: "Ask about recent news" }).getByRole("alert")).toContainText("Too many questions");
});
