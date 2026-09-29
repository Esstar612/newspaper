import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { fetchFeed, mergeArticles, normalizeUrl, parseFeed, type FeedSpec, type NormalizedArticle } from "@/lib/feeds";
import { server } from "../msw";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

const bbc: FeedSpec = {
    category: "technology",
    source: "BBC News",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
};
const nyt: FeedSpec = {
    category: "business",
    source: "The New York Times",
    url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml",
};

const rss = (items: string) => `<rss version="2.0"><channel><title>Test</title>${items}</channel></rss>`;

afterEach(() => vi.useRealTimers());

describe("parseFeed", () => {
    it("maps a BBC item and skips the item with no link", () => {
        expect(parseFeed(fixture("bbc.xml"), bbc)).toEqual([
            {
                title: "First test headline",
                description: "First test summary.",
                url: "https://www.bbc.co.uk/news/articles/test0001",
                imageUrl: "https://ichef.bbci.co.uk/ace/standard/976/cpsprodpb/test/live/test0001.jpg",
                source: "BBC News",
                publishedAt: new Date("2026-09-29T04:30:13Z"),
                providerId: "https://www.bbc.co.uk/news/articles/test0001#0",
                tags: ["technology"],
            },
        ]);
    });

    it("parses a feed with a single item and reads media:content", () => {
        const [article] = parseFeed(fixture("nyt.xml"), nyt);
        expect(article).toMatchObject({
            title: "Second test headline",
            url: "https://www.nytimes.com/2026/09/28/technology/test-article.html",
            imageUrl: "https://static01.nyt.com/images/2026/09/28/multimedia/test/test-mediumSquareAt3X.jpg",
            publishedAt: new Date("2026-09-29T00:32:19Z"),
            tags: ["business"],
        });
    });

    it("prefers media:thumbnail over media:content", () => {
        const xml = rss(`<item>
            <title>Both images</title>
            <link>https://example.com/a</link>
            <media:content url="https://example.com/content.jpg"/>
            <media:thumbnail url="https://example.com/thumb.jpg"/>
        </item>`);
        expect(parseFeed(xml, bbc)[0].imageUrl).toBe("https://example.com/thumb.jpg");
    });

    it("skips an item with no title", () => {
        expect(parseFeed(rss("<item><link>https://example.com/a</link></item>"), bbc)).toEqual([]);
    });

    it("falls back to now for an unparseable pubDate", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
        const xml = rss("<item><title>Bad date</title><link>https://example.com/a</link><pubDate>not a date</pubDate></item>");
        expect(parseFeed(xml, bbc)[0].publishedAt).toEqual(new Date("2026-09-29T12:00:00Z"));
    });

    it("rejects a document that is not RSS", () => {
        expect(() => parseFeed("<html><body><p>Error</p></body></html>", bbc)).toThrow("Not an RSS document");
    });
});

describe("normalizeUrl", () => {
    it("strips tracking params and the hash but keeps other params", () => {
        expect(normalizeUrl("https://example.com/a?id=7&utm_source=x&at_medium=RSS#top")).toBe("https://example.com/a?id=7");
    });

    it("reads a #text node", () => {
        expect(normalizeUrl({ "#text": "https://example.com/a" })).toBe("https://example.com/a");
    });

    it.each(["javascript:alert(1)", "ftp://example.com/a", "not a url", ""])("rejects %j", (raw) => {
        expect(normalizeUrl(raw)).toBe("");
    });
});

describe("mergeArticles", () => {
    const article = (overrides: Partial<NormalizedArticle>): NormalizedArticle => ({
        title: "Headline",
        description: "",
        url: "https://example.com/a",
        imageUrl: "",
        source: "BBC News",
        publishedAt: new Date("2026-09-29T00:00:00Z"),
        providerId: "a",
        tags: ["world"],
        ...overrides,
    });

    it("unions tags and fills a missing image and description from a later copy", () => {
        const lists = [
            [article({ tags: ["world"] })],
            [article({ tags: ["business"], imageUrl: "https://example.com/a.jpg", description: "Summary" })],
            [article({ url: "https://example.com/b", tags: ["science"] })],
        ];
        const before = structuredClone(lists);

        const merged = mergeArticles(lists);

        expect(merged).toHaveLength(2);
        expect(merged[0]).toMatchObject({
            tags: ["world", "business"],
            imageUrl: "https://example.com/a.jpg",
            description: "Summary",
        });
        expect(merged[1].tags).toEqual(["science"]);
        expect(lists).toEqual(before);
    });
});

describe("fetchFeed", () => {
    const respond = (body: string, status = 200) =>
        server.use(http.get(bbc.url, () => new HttpResponse(body, { status, headers: { "Content-Type": "application/xml" } })));

    it("returns the parsed articles", async () => {
        respond(fixture("bbc.xml"));
        const result = await fetchFeed(bbc);
        expect(result.error).toBeUndefined();
        expect(result.articles.map((a) => a.title)).toEqual(["First test headline"]);
    });

    it.each([
        ["an HTTP error", "", 500, "HTTP 500"],
        ["an HTML page", "<html><body><p>Error</p></body></html>", 200, "Not an RSS document"],
        ["a channel with no items", "<rss><channel><title>x</title></channel></rss>", 200, "Feed returned no usable items"],
    ])("reports %s instead of throwing", async (_case, body, status, error) => {
        respond(body, status);
        await expect(fetchFeed(bbc)).resolves.toEqual({ spec: bbc, articles: [], error });
    });
});
