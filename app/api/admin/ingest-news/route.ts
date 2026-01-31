// app/api/admin/ingest-news/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";

export const runtime = "nodejs";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

const env = (name: string) => {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
};

const bearer = (req: NextRequest) =>
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();

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

const transformArticle = (raw: unknown, category: string) => {
    if (!isObj(raw)) return null;

    const url = okUrl(raw.url);
    if (!url) return null;

    const sourceObj = isObj(raw.source) ? raw.source : null;
    const sourceName = sourceObj ? firstStr(sourceObj.name, sourceObj.id) : "";

    const source =
        sourceName ||
        firstStr(raw.section, raw.subsection) ||
        "unknown";

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
        tags: [category],
    };
};

const fetchJson = async (url: string, init?: RequestInit): Promise<unknown> => {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
    return res.json();
};

const fetchNewsApi = async (limit: number, category: string, country: string = "us") => {
    const key = env("NEWS_API_KEY");
    const u = new URL("https://newsapi.org/v2/top-headlines");
    u.searchParams.set("country", country);
    u.searchParams.set("category", category);
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

export async function POST(req: NextRequest) {
    try {
        if (bearer(req) !== env("ADMIN_INGEST_TOKEN")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: { limit?: number; section?: string; country?: string } = {};
        try {
            const parsed: unknown = await req.json();
            if (isObj(parsed)) {
                body.limit = typeof parsed.limit === "number" ? parsed.limit : undefined;
                body.section = typeof parsed.section === "string" ? parsed.section : undefined;
                body.country = typeof parsed.country === "string" ? parsed.country : undefined;
            }
        } catch {}

        const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 100);
        const country = body.country || "us";
        const perCategory = Math.floor(limit / 6);

        await connectDB();

        const categories = ["business", "technology", "science", "health", "sports", "general"];

        const newsApiResults = await Promise.all(
            categories.map(cat => fetchNewsApi(perCategory, cat, country).catch(() => []))
        );

        const nytSection = body.section || "business";
        const nytRaw = await fetchNYT(nytSection, perCategory).catch(() => []);

        const allRaw: Array<{ article: unknown; category: string }> = [];

        categories.forEach((cat, idx) => {
            newsApiResults[idx].forEach(article => {
                allRaw.push({ article, category: cat });
            });
        });

        nytRaw.forEach(article => {
            allRaw.push({ article, category: nytSection });
        });

        const all = allRaw
            .map(({ article, category }) => transformArticle(article, category))
            .filter((x): x is NonNullable<ReturnType<typeof transformArticle>> => Boolean(x));

        const unique = [...new Map(all.map((a) => [a.url, a])).values()];

        const ops = unique.map((a) => ({
            updateOne: { filter: { url: a.url }, update: { $set: a }, upsert: true },
        }));

        const result = ops.length ? await Article.bulkWrite(ops, { ordered: false }) : null;

        return NextResponse.json({
            status: "ok",
            pulled: {
                newsapi: newsApiResults.flat().length,
                nyt: nytRaw.length,
                normalized: all.length,
                unique: unique.length,
            },
            country,
            categories: categories,
            db: {
                upserted: result?.upsertedCount ?? 0,
                matched: result?.matchedCount ?? 0,
                modified: result?.modifiedCount ?? 0,
            },
            limit,
        });
    } catch (e: unknown) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Ingest failed" }, { status: 500 });
    }
}