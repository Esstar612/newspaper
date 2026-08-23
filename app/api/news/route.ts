//app/api/news/route.ts
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { GENERAL } from "@/lib/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Condition = Record<string, unknown>;

/**
 * Pagination cursor: "<publishedAt ms>_<_id>".
 *
 * The feed sorts by publishedAt (what a reader means by "newest"), not by _id
 * (which is insertion order, and groups articles by whichever feed was ingested
 * first). Ties on publishedAt are common within a feed, so _id breaks them and
 * keeps the sort total - otherwise a page boundary landing inside a tie would
 * skip or repeat articles.
 */
const encodeCursor = (doc: { publishedAt?: Date | null; _id: unknown }) =>
    `${doc.publishedAt ? new Date(doc.publishedAt).getTime() : 0}_${String(doc._id)}`;

const decodeCursor = (raw: string): Condition | null => {
    const sep = raw.lastIndexOf("_");
    if (sep <= 0) return null;

    const ms = Number(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!Number.isFinite(ms) || !mongoose.isValidObjectId(id)) return null;

    const publishedAt = new Date(ms);
    const _id = new mongoose.Types.ObjectId(id);

    return { $or: [{ publishedAt: { $lt: publishedAt } }, { publishedAt, _id: { $lt: _id } }] };
};

// GET /api/news?limit=20&source=NYT&q=tesla&cursor=...&category=business
export async function GET(req: Request) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);

        const rawLimit = Number(searchParams.get("limit") ?? "20");
        const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 50);
        const q = (searchParams.get("q") ?? "").trim();
        const source = (searchParams.get("source") ?? "").trim();
        const category = (searchParams.get("category") ?? "").trim();
        const cursor = (searchParams.get("cursor") ?? "").trim();

        // Built as a list of ANDed conditions so the cursor and the search query can
        // each contribute their own $or without clobbering one another.
        const conditions: Condition[] = [];

        if (source) conditions.push({ source });

        // "general" means every category, so it applies no tag filter.
        if (category && category !== GENERAL) conditions.push({ tags: category });

        if (q) {
            const regex = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            conditions.push({
                $or: [
                    { title: { $regex: regex, $options: "i" } },
                    { description: { $regex: regex, $options: "i" } },
                ],
            });
        }

        // A malformed cursor used to throw and 500 the request; now it just yields
        // the first page, which is the sane fallback.
        if (cursor) {
            const condition = decodeCursor(cursor);
            if (condition) conditions.push(condition);
        }

        const filter: Condition = conditions.length ? { $and: conditions } : {};

        const docs = await Article.find(filter)
            .sort({ publishedAt: -1, _id: -1 })
            .limit(limit)
            .select({ title: 1, description: 1, url: 1, imageUrl: 1, source: 1, publishedAt: 1, tags: 1 })
            .lean();

        // Only advertise another page when this one was full. A short page is the
        // last page, and the old code always returned a cursor - so "Load more"
        // stayed clickable forever and then returned nothing.
        const nextCursor = docs.length === limit ? encodeCursor(docs[docs.length - 1]) : null;

        return NextResponse.json({ articles: docs, nextCursor });
    } catch (error) {
        console.error("News API Error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Failed to fetch news",
                articles: [],
                nextCursor: null,
            },
            { status: 500 }
        );
    }
}
