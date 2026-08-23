// app/api/cron/ingest-news/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { FEEDS, fetchFeed, mergeArticles, type FeedResult } from "@/lib/feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// All feeds run concurrently against different hosts, so this is headroom, not a target.
export const maxDuration = 60;

const SKIP_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const force = req.nextUrl.searchParams.get("force") === "1";

        // The rate-limit guard below is what keeps provider quota safe, so overriding
        // it must never be anonymous. When CRON_SECRET is unset the check above is
        // skipped entirely, which is tolerable for the scheduled run but not for this.
        if (force && !cronSecret) {
            return NextResponse.json(
                { error: "force=1 requires CRON_SECRET to be configured" },
                { status: 403 }
            );
        }

        await connectDB();

        const now = new Date();

        // The scheduled run is daily; the guard stops an accidental re-trigger from
        // burning through provider quota. ?force=1 exists so a fix can be applied
        // without waiting for the next midnight run.
        if (!force) {
            const lastArticle = await Article.findOne()
                .sort({ createdAt: -1 })
                .select("createdAt")
                .lean();

            if (lastArticle && lastArticle.createdAt > new Date(now.getTime() - SKIP_WINDOW_MS)) {
                return NextResponse.json({
                    status: "skipped",
                    message: "News was updated recently (pass ?force=1 to override)",
                    lastUpdate: lastArticle.createdAt,
                    nextUpdate: new Date(lastArticle.createdAt.getTime() + SKIP_WINDOW_MS),
                });
            }
        }

        const results: FeedResult[] = await Promise.all(FEEDS.map((spec) => fetchFeed(spec)));

        const unique = mergeArticles(results.map((r) => r.articles));

        // $set the content but $addToSet the tags, so an article already stored under
        // one category gains the other instead of having its tags overwritten.
        const ops = unique.map(({ tags, ...fields }) => ({
            updateOne: {
                filter: { url: fields.url },
                update: { $set: fields, $addToSet: { tags: { $each: tags } } },
                upsert: true,
            },
        }));

        const result = ops.length ? await Article.bulkWrite(ops, { ordered: false }) : null;

        // Per-feed counts, so a feed that dies is visible instead of silently empty.
        const feeds = results.map((r) => ({
            category: r.spec.category,
            source: r.spec.source,
            count: r.articles.length,
            ...(r.error ? { error: r.error } : {}),
        }));

        const failed = feeds.filter((f) => f.error);

        return NextResponse.json({
            status: failed.length === FEEDS.length ? "failed" : "success",
            forced: force,
            timestamp: now,
            feeds,
            failedFeeds: failed.length,
            pulled: {
                total: results.reduce((n, r) => n + r.articles.length, 0),
                unique: unique.length,
            },
            db: {
                upserted: result?.upsertedCount ?? 0,
                matched: result?.matchedCount ?? 0,
                modified: result?.modifiedCount ?? 0,
            },
            nextUpdate: new Date(now.getTime() + SKIP_WINDOW_MS),
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Ingest failed" },
            { status: 500 }
        );
    }
}
