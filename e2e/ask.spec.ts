import { expect, test } from "./fixtures";

const answer = {
    segments: [
        { text: "Business story 01 was the top story", cites: [1] },
        { text: " and a central bank held rates", cites: [2] },
        { text: ".", cites: [] },
    ],
    sources: [
        { n: 1, url: "https://example.com/story-01", title: "Business story 01", source: "The New York Times", publishedAt: "2026-09-28T11:00:00.000Z", imageUrl: "" },
        { n: 2, url: "https://example.com/story-02", title: "Business story 02", source: "BBC", publishedAt: "2026-09-28T10:00:00.000Z", imageUrl: "" },
    ],
    related: ["05", "06"].map((n) => ({
        _id: `related-${n}`,
        title: `Business story ${n}`,
        description: `Description for business story ${n}`,
        url: `https://example.com/related-${n}`,
        imageUrl: "",
        source: "BBC",
        publishedAt: "2026-09-28T11:00:00.000Z",
        tags: ["business"],
    })),
    refused: false,
    truncated: false,
};

test("shows headline matches, then asks with Enter and links the sources", async ({ page }) => {
    const sent: unknown[] = [];
    await page.route("**/api/ask", async (route) => {
        sent.push(route.request().postDataJSON());
        await route.fulfill({ json: answer });
    });
    await page.goto("/news?category=business");
    const box = page.getByRole("combobox", { name: "Search headlines or ask a question" });
    await box.fill("rates");
    await expect(page.getByRole("option", { name: "Ask: “rates”" })).toBeVisible();
    await expect(page.getByRole("option", { name: /Business story 01/ })).toBeVisible();
    await box.press("Escape");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await box.press("Enter");

    const card = page.getByRole("region", { name: "Answer" });
    await expect(card.getByText(/Business story 01 was the top story/)).toBeVisible();
    await expect(card.getByRole("link", { name: "Source 1" })).toHaveAttribute("href", "https://example.com/story-01");
    await expect(card.getByRole("link", { name: "Source 2" })).toHaveAttribute("href", "https://example.com/story-02");
    const sources = card.getByRole("list", { name: "Sources" }).getByRole("link");
    await expect(sources).toHaveCount(2);
    await expect(sources.first()).toHaveAttribute("href", "https://example.com/story-01");
    await expect(sources.first()).toContainText("1 · The New York Times");
    await expect(page.getByText("Stories related to your question · 2")).toBeVisible();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("heading")).toHaveCount(2);
    await expect(panel.getByRole("heading", { name: "Business story 05" })).toBeVisible();
    expect(sent).toEqual([{ q: "rates", category: "business" }]);
});

test("explains the limit when too many questions are asked", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
        route.fulfill({ status: 429, json: { error: "Too many questions.", scope: "ip", resetAt: "2026-10-01T15:00:00.000Z" } })
    );
    await page.goto("/news");
    const box = page.getByRole("combobox", { name: "Search headlines or ask a question" });
    await box.fill("What happened today?");
    await box.press("Enter");
    await expect(page.getByRole("region", { name: "Answer" }).getByRole("alert")).toContainText("Too many questions");
});
