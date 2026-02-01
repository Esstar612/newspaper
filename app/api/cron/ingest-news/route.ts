// app/api/cron/ingest-news/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

const env = (name: string) => {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
};

const okUrl = (u: unknown): string | null => {
    if (!u) return null;
    try {
        const x = new URL(String(u));
        return x.protocol === "http:" || x.protocol === "https:" ? x.toString() : null;
    } catch {
        return null;
    }
};

const str = (v: unknown, fallback = ""): string =>
    typeof v === "string" ? v : v == null ? fallback : String(v);

const date = (v: unknown): Date => {
    const d = new Date(typeof v === "string" || typeof v === "number" ? v : Date.now());
    return isNaN(d.getTime()) ? new Date() : d;
};

const firstStr = (...vals: unknown[]) => {
    for (const v of vals) if (typeof v === "string" && v.trim()) return v;
    return "";
};

const nytImage = (a: Obj): unknown => {
    const mm = a.multimedia;
    if (!Array.isArray(mm) || mm.length === 0) return null;
    const items = mm.filter(isObj);
    const superJumbo = items.find((m) => m.format === "Super Jumbo")?.url;
    return superJumbo ?? items[0]?.url ?? null;
};

const transformArticle = (raw: unknown) => {
    if (!isObj(raw)) return null;

    const url = okUrl(raw.url);
    if (!url) return null;

    const sourceObj = isObj(raw.source) ? raw.source : null;
    const sourceName = sourceObj ? firstStr(sourceObj.name, sourceObj.id) : "";

    const source = sourceName || firstStr(raw.section, raw.subsection) || "unknown";
    const publishedAt = date(firstStr(raw.publishedAt, raw.published_date, raw.created_date, raw.updated_date));
    const imageUrl = okUrl(firstStr(raw.urlToImage, raw.image_url, nytImage(raw))) || "";
    const providerId = str(raw.uri, "") || (sourceObj ? str(sourceObj.id, "") : "");

    return {
        title: str(raw.title, "Untitled"),
        description: str(raw.description ?? raw.abstract ?? raw.content, ""),
        url,
        imageUrl,
        source,
        publishedAt,
        providerId,
    };
};

const fetchJson = async (url: string, init?: RequestInit): Promise<unknown> => {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return res.json();
};

const fetchNewsApi = async (limit: number) => {
    const key = env("NEWS_API_KEY");
    const u = new URL("https://newsapi.org/v2/top-headlines");
    u.searchParams.set("country", "us");
    u.searchParams.set("pageSize", String(Math.min(limit, 100)));

    const json = await fetchJson(u.toString(), { headers: { "X-Api-Key": key } });
    if (!isObj(json) || !Array.isArray(json.articles)) return [];
    return json.articles;
};

const fetchNYT = async (section: string, limit: number) => {
    const key = env("NYT_API_KEY");
    const u = new URL(`https://api.nytimes.com/svc/topstories/v2/${section}.json`);
    u.searchParams.set("api-key", key);

    const json = await fetchJson(u.toString());
    if (!isObj(json) || !Array.isArray(json.results)) return [];
    return json.results.slice(0, limit);
};

export async function GET(req: NextRequest) {
    try {
        // Verify this is coming from a cron job (optional security)
        const authHeader = req.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();

        // Check when we last ingested
        const lastArticle = await Article.findOne().sort({ createdAt: -1 }).select("createdAt").lean();
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // If we ingested within last 24 hours, skip
        if (lastArticle && lastArticle.createdAt > twentyFourHoursAgo) {
            return NextResponse.json({
                status: "skipped",
                message: "News was updated recently",
                lastUpdate: lastArticle.createdAt,
                nextUpdate: new Date(lastArticle.createdAt.getTime() + 24 * 60 * 60 * 1000),
            });
        }

        // OPTIMIZED FOR VERCEL HOBBY PLAN (1 run per day):
        // Daily run = 1 run/day
        // NewsAPI: 1 call/day (well under 100/day limit)
        // NYT: 3 calls/day (well under 500/day limit)

        // Fetch max articles in our single daily run
        const allSections = [
            "business", "technology", "world"
        ];

        // Fetch from all sources - MAX articles per call
        const [newsRaw, ...nytResults] = await Promise.all([
            fetchNewsApi(100).catch(() => []), // 1 call - 100 articles (max allowed)
            ...allSections.map(section => fetchNYT(section, 50).catch(() => [])), // 3 calls - 50 each
        ]);

        const nytRaw = nytResults.flat();

        const all = [...newsRaw, ...nytRaw]
            .map(transformArticle)
            .filter((x): x is NonNullable<ReturnType<typeof transformArticle>> => Boolean(x));

        // Dedupe by URL
        const unique = [...new Map(all.map((a) => [a.url, a])).values()];

        const ops = unique.map((a) => ({
            updateOne: { filter: { url: a.url }, update: { $set: a }, upsert: true },
        }));

        const result = ops.length ? await Article.bulkWrite(ops, { ordered: false }) : null;

        return NextResponse.json({
            status: "success",
            timestamp: now,
            pulled: {
                newsapi: newsRaw.length,
                nyt: nytRaw.length,
                normalized: all.length,
                unique: unique.length,
            },
            db: {
                upserted: result?.upsertedCount ?? 0,
                matched: result?.matchedCount ?? 0,
                modified: result?.modifiedCount ?? 0,
            },
            nextUpdate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Ingest failed" },
            { status: 500 }
        );
    }
}