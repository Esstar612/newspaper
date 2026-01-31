//app/api/news/route.ts
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/news?limit=20&source=NYT&q=tesla&cursor=...&category=business
export async function GET(req: Request) {
    try {
        await connectDB();

        const { searchParams } = new URL(req.url);

        const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);
        const q = (searchParams.get("q") ?? "").trim();
        const source = (searchParams.get("source") ?? "").trim();
        const category = (searchParams.get("category") ?? "").trim();
        const cursor = (searchParams.get("cursor") ?? "").trim();

        // Build filter
        const filter: {
            source?: string;
            _id?: { $lt: string };
            tags?: { $in: string[] };
            $or?: Array<{
                title?: { $regex: string; $options: "i" };
                description?: { $regex: string; $options: "i" }
            }>;
        } = {};

        if (source) filter.source = source;

        // Category filtering via tags
        if (category && category !== "general") {
            filter.tags = { $in: [category] };
        }

        // Cursor pagination
        if (cursor) filter._id = { $lt: cursor };

        // Search query
        if (q) {
            const regex = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { title: { $regex: regex, $options: "i" } },
                { description: { $regex: regex, $options: "i" } },
            ];
        }

        const docs = await Article.find(filter)
            .sort({ _id: -1 })
            .limit(limit)
            .select({ title: 1, description: 1, url: 1, imageUrl: 1, source: 1, publishedAt: 1, tags: 1 })
            .lean();

        const nextCursor = docs.length > 0 ? String(docs[docs.length - 1]._id) : null;

        return NextResponse.json({ articles: docs, nextCursor });
    } catch (error) {
        console.error("News API Error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Failed to fetch news",
                articles: [],
                nextCursor: null
            },
            { status: 500 }
        );
    }
}