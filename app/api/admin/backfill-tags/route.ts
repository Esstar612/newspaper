// app/api/admin/backfill-tags/route.ts
//
// One-time repair for articles ingested before the pipeline wrote tags.
//
// The old ingest stored the NYT *section* in `source` ("world", "business", ...)
// instead of the publication, so the category each article belonged to is still
// recoverable without refetching anything. Idempotent - safe to re-run.
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { TAGGABLE_CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Legacy `source` value -> category tag. Anything absent here is left untagged. */
const LEGACY_SOURCE_TO_CATEGORY: Record<string, string> = {
    world: "world",
    business: "business",
    technology: "technology",
    tech: "technology",
    science: "science",
    climate: "science",
    health: "health",
    well: "health",
    sports: "sports",
    // "us", "politics", "unknown" etc. deliberately omitted: no matching tab,
    // and they stay reachable under "general", which applies no filter.
};

const bearer = (req: NextRequest) =>
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

async function run(req: NextRequest) {
    const expected = process.env.ADMIN_INGEST_TOKEN;
    if (!expected) {
        return NextResponse.json({ error: "ADMIN_INGEST_TOKEN not configured" }, { status: 500 });
    }
    if (bearer(req) !== expected) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const untaggedBefore = await Article.countDocuments({ tags: { $size: 0 } });

    const perCategory: Record<string, number> = {};
    let modified = 0;

    for (const [legacySource, category] of Object.entries(LEGACY_SOURCE_TO_CATEGORY)) {
        const res = await Article.updateMany(
            { tags: { $size: 0 }, source: legacySource },
            { $addToSet: { tags: category } }
        );
        if (res.modifiedCount) {
            perCategory[category] = (perCategory[category] ?? 0) + res.modifiedCount;
            modified += res.modifiedCount;
        }
    }

    const untaggedAfter = await Article.countDocuments({ tags: { $size: 0 } });

    // Post-repair census, so the result shows whether every tab now has content.
    const counts: Record<string, number> = {};
    for (const category of TAGGABLE_CATEGORIES) {
        counts[category] = await Article.countDocuments({ tags: category });
    }
    counts.total = await Article.countDocuments({});

    return NextResponse.json({
        status: "ok",
        untaggedBefore,
        modified,
        perCategory,
        untaggedAfter,
        articlesPerCategory: counts,
    });
}

export const POST = run;
// GET is allowed too - it is idempotent, and it makes the repair easy to trigger by hand.
export const GET = run;
