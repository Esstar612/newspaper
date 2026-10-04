import type { Article } from "@/components/ArticleCard";

const BASE = Date.parse("2026-09-28T12:00:00Z");

export const PIXEL_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
export const PIXEL_IMAGE = `data:image/png;base64,${PIXEL_PNG_BASE64}`;

export function makeArticle(i: number, overrides: Partial<Article> = {}): Article {
    const n = String(i).padStart(2, "0");
    return {
        _id: `a${n}`,
        title: `Story ${n}`,
        description: `Description for story ${n}`,
        url: `https://example.com/story-${n}`,
        imageUrl: PIXEL_IMAGE,
        source: "BBC",
        publishedAt: new Date(BASE - i * 60_000).toISOString(),
        tags: ["world"],
        ...overrides,
    };
}

export const makeArticles = (count: number, overrides: (i: number) => Partial<Article> = () => ({})) =>
    Array.from({ length: count }, (_, i) => makeArticle(i + 1, overrides(i + 1)));
