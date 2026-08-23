// lib/feeds.ts
// Keyless, per-section RSS ingest.
//
// Why RSS instead of the NYT Top Stories API: the feed we request IS the category,
// which is the signal the old ingest threw away. Top Stories also caps at 5 req/min
// and answers overflow with HTTP 200 + a {"fault":...} body, so failures were silent.
// These feeds need no key and have no documented rate limit.
//
// NYT publishes no sports content any more (their Sports feed returns zero items),
// so BBC Sport is the only source that can fill that tab.

import { XMLParser } from "fast-xml-parser";

export type FeedSpec = {
    /** Category tag applied to every article from this feed. */
    category: string;
    /** Publication name shown on the card. */
    source: string;
    url: string;
};

export const FEEDS: FeedSpec[] = [
    // --- The New York Times ---
    { category: "world", source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
    { category: "business", source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml" },
    { category: "technology", source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml" },
    { category: "science", source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml" },
    { category: "health", source: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml" },

    // --- BBC ---
    { category: "world", source: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
    { category: "business", source: "BBC News", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
    { category: "technology", source: "BBC News", url: "https://feeds.bbci.co.uk/news/technology/rss.xml" },
    { category: "science", source: "BBC News", url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml" },
    { category: "health", source: "BBC News", url: "https://feeds.bbci.co.uk/news/health/rss.xml" },
    { category: "sports", source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/rss.xml" },
];

export type NormalizedArticle = {
    title: string;
    description: string;
    url: string;
    imageUrl: string;
    source: string;
    publishedAt: Date;
    providerId: string;
    tags: string[];
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

/** RSS values may be a string, a {"#text":...} node, or an array of either. */
const text = (v: unknown): string => {
    if (v == null) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return text(v[0]);
    if (isObj(v)) return text(v["#text"]);
    return "";
};

/** Pull @_url off a media node that may be a single object or an array of them. */
const mediaUrl = (v: unknown): string => {
    if (!v) return "";
    const first = Array.isArray(v) ? v.find(isObj) : v;
    if (!isObj(first)) return "";
    return typeof first["@_url"] === "string" ? first["@_url"] : "";
};

/**
 * BBC RSS ships 240px thumbnails, which look terrible in a 200px-tall card.
 * The ichef path segment is the width, so ask for a usable one.
 */
const upgradeImage = (url: string): string =>
    url.replace(/(ichef\.bbci\.co\.uk\/[^/]+\/[^/]+\/)240(\/)/, "$1976$2");

const TRACKING_PARAMS = /^(at_|utm_|ito$|ns_|cmp$|smid$|partner$)/i;

/**
 * Canonical form used for both storage and dedupe.
 *
 * BBC appends ?at_medium=RSS&at_campaign=rss, so the same article arriving from two
 * feeds would otherwise be stored twice with different tags and never merge.
 * Returns "" for anything that isn't a usable http(s) URL.
 */
export const normalizeUrl = (raw: unknown): string => {
    const s = text(raw);
    if (!s) return "";
    try {
        const u = new URL(s);
        if (u.protocol !== "http:" && u.protocol !== "https:") return "";
        for (const key of [...u.searchParams.keys()]) {
            if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
        }
        u.hash = "";
        return u.toString();
    } catch {
        return "";
    }
};

const parseDate = (v: unknown): Date => {
    const s = text(v);
    const d = s ? new Date(s) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
};

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    trimValues: true,
});

/** Map one RSS document onto Article documents, tagged with the feed's category. */
export function parseFeed(xml: string, spec: FeedSpec): NormalizedArticle[] {
    const doc = parser.parse(xml);
    const channel = isObj(doc) && isObj(doc.rss) ? doc.rss.channel : null;
    if (!isObj(channel)) throw new Error("Not an RSS document");

    const raw = channel.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const out: NormalizedArticle[] = [];
    for (const item of items) {
        if (!isObj(item)) continue;

        const url = normalizeUrl(item.link);
        const title = text(item.title);
        // An item with no link or no title is not renderable - skip rather than store junk.
        if (!url || !title) continue;

        const image = mediaUrl(item["media:thumbnail"]) || mediaUrl(item["media:content"]);

        out.push({
            title,
            description: text(item.description),
            url,
            imageUrl: upgradeImage(normalizeUrl(image)),
            source: spec.source,
            publishedAt: parseDate(item.pubDate),
            providerId: text(item.guid),
            tags: [spec.category],
        });
    }
    return out;
}

export type FeedResult = {
    spec: FeedSpec;
    articles: NormalizedArticle[];
    error?: string;
};

/** Fetch and parse one feed. Never throws - the error is returned so callers can report it. */
export async function fetchFeed(spec: FeedSpec, timeoutMs = 15_000): Promise<FeedResult> {
    try {
        const res = await fetch(spec.url, {
            cache: "no-store",
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "User-Agent": "newspaper-app/1.0 (+https://newspaper-kohl.vercel.app)" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const body = await res.text();
        // Providers sometimes answer 200 with an error envelope instead of a feed.
        // Treat an empty parse as a failure so it shows up in the ingest report.
        const articles = parseFeed(body, spec);
        if (articles.length === 0) throw new Error("Feed returned no usable items");

        return { spec, articles };
    } catch (e) {
        return {
            spec,
            articles: [],
            error: e instanceof Error ? e.message : "Fetch failed",
        };
    }
}

/**
 * Collapse duplicates by URL, unioning their tags.
 *
 * An article can legitimately appear in several feeds (NYT Business and BBC Business,
 * or both World and Business). It should carry every category it appeared under, so
 * the old "last one wins" Map dedupe would have dropped tags.
 */
export function mergeArticles(lists: NormalizedArticle[][]): NormalizedArticle[] {
    const byUrl = new Map<string, NormalizedArticle>();

    for (const article of lists.flat()) {
        const existing = byUrl.get(article.url);
        if (!existing) {
            byUrl.set(article.url, { ...article, tags: [...article.tags] });
            continue;
        }
        for (const tag of article.tags) {
            if (!existing.tags.includes(tag)) existing.tags.push(tag);
        }
        // Prefer whichever copy actually has an image / description.
        if (!existing.imageUrl && article.imageUrl) existing.imageUrl = article.imageUrl;
        if (!existing.description && article.description) existing.description = article.description;
    }

    return [...byUrl.values()];
}
