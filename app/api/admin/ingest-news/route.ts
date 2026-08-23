// app/api/admin/ingest-news/route.ts
//
// Manual ingest, triggered by the dev-only button on /news.
//
// Runs the same keyless RSS feeds as the cron, and additionally pulls NewsAPI -
// whose free tier only permits requests from localhost, so it contributes nothing
// on Vercel but works fine here in development.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { FEEDS, fetchFeed, mergeArticles, normalizeUrl, type NormalizedArticle } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : v == null ? fallback : String(v);

const bearer = (req: NextRequest) =>
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

/** NewsAPI category -> our tag. "general" is the no-filter pseudo-category, so it gets no tag. */
const NEWSAPI_CATEGORIES: Array<[string, string | null]> = [
    ["general", null],
    ["business", "business"],
    ["technology", "technology"],
    ["science", "science"],
    ["health", "health"],
    ["sports", "sports"],
];

async function fetchNewsApi(
    category: string,
    tag: string | null,
    limit: number,
    country: string
): Promise<NormalizedArticle[]> {
    const key = process.env.NEWS_API_KEY;
    if (!key) return [];

    const u = new URL("https://newsapi.org/v2/top-headlines");
    u.searchParams.set("country", country);
    u.searchParams.set("category", category);
    u.searchParams.set("pageSize", String(Math.min(limit, 100)));

    const res = await fetch(u.toString(), {
        headers: { "X-Api-Key": key },
        cache: "no-store",
    });
    if (!res.ok) throw new Error(`NewsAPI ${category}: HTTP ${res.status}`);

    const json = await res.json();
    if (!isObj(json) || !Array.isArray(json.articles)) {
        throw new Error(`NewsAPI ${category}: ${str(json?.message, "unexpected response")}`);
    }

    const out: NormalizedArticle[] = [];
    for (const raw of json.articles) {
        if (!isObj(raw)) continue;

        const url = normalizeUrl(raw.url);
        const title = str(raw.title);
        if (!url || !title || title === "[Removed]") continue;

        const sourceObj = isObj(raw.source) ? raw.source : null;
        const published = new Date(str(raw.publishedAt));

        out.push({
            title,
            description: str(raw.description ?? raw.content, ""),
            url,
            imageUrl: normalizeUrl(raw.urlToImage),
            source: str(sourceObj?.name, "") || "NewsAPI",
            publishedAt: isNaN(published.getTime()) ? new Date() : published,
            providerId: str(sourceObj?.id, ""),
            tags: tag ? [tag] : [],
        });
    }
    return out;
}

export async function POST(req: NextRequest) {
    try {
        const expected = process.env.ADMIN_INGEST_TOKEN;
        if (!expected) {
            return NextResponse.json({ error: "ADMIN_INGEST_TOKEN not configured" }, { status: 500 });
        }
        if (bearer(req) !== expected) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: { limit?: number; country?: string } = {};
        try {
            const parsed: unknown = await req.json();
            if (isObj(parsed)) {
                body = {
                    limit: typeof parsed.limit === "number" ? parsed.limit : undefined,
                    country: typeof parsed.country === "string" ? parsed.country : undefined,
                };
            }
        } catch {
            // Body is optional.
        }

        const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 100);
        const country = body.country || "us";

        await connectDB();

        const [feedResults, newsApiResults] = await Promise.all([
            Promise.all(FEEDS.map((spec) => fetchFeed(spec))),
            Promise.all(
                NEWSAPI_CATEGORIES.map(([category, tag]) =>
                    fetchNewsApi(category, tag, limit, country).catch((e: unknown) => ({
                        error: e instanceof Error ? e.message : "NewsAPI failed",
                    }))
                )
            ),
        ]);

        const newsApiArticles = newsApiResults.filter(Array.isArray) as NormalizedArticle[][];
        // Surfaced rather than swallowed - NewsAPI answers 426 on Vercel, which is
        // worth seeing in the response instead of silently getting zero articles.
        const newsApiErrors = newsApiResults
            .filter((r): r is { error: string } => !Array.isArray(r))
            .map((r) => r.error);

        const unique = mergeArticles([...feedResults.map((r) => r.articles), ...newsApiArticles]);

        const ops = unique.map(({ tags, ...fields }) => ({
            updateOne: {
                filter: { url: fields.url },
                update: {
                    $set: fields,
                    ...(tags.length ? { $addToSet: { tags: { $each: tags } } } : {}),
                },
                upsert: true,
            },
        }));

        const result = ops.length ? await Article.bulkWrite(ops, { ordered: false }) : null;

        return NextResponse.json({
            status: "ok",
            country,
            feeds: feedResults.map((r) => ({
                category: r.spec.category,
                source: r.spec.source,
                count: r.articles.length,
                ...(r.error ? { error: r.error } : {}),
            })),
            newsapi: {
                count: newsApiArticles.flat().length,
                errors: newsApiErrors,
            },
            unique: unique.length,
            db: {
                upserted: result?.upsertedCount ?? 0,
                matched: result?.matchedCount ?? 0,
                modified: result?.modifiedCount ?? 0,
            },
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Ingest failed" },
            { status: 500 }
        );
    }
}
