// app/api/cron/cleanup-old-news/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { MIN_KEEP, RETENTION_MS, planCleanup } from "@/lib/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cleanup strategy:
 * - Delete articles older than 7 days, so the collection does not grow forever.
 * - But never at the cost of emptying the site.
 *
 * This job and the ingest run independently, and Vercel documents cron delivery
 * as best effort with no retry on failure. Deleting purely on an age cutoff meant
 * that if ingest stopped working — a dead feed, a missed run, an expired key —
 * this job would keep deleting on schedule and the site would be empty within a
 * week, with nothing to indicate why. Two guards prevent that.
 */

export async function GET(req: NextRequest) {
    try {
        // Optional security check
        const authHeader = req.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();

        const now = new Date();
        const cutoff = new Date(now.getTime() - RETENTION_MS);

        const totalBefore = await Article.countDocuments();
        const newestArticle = await Article.findOne()
            .sort({ createdAt: -1 })
            .select("createdAt")
            .lean();

        const plan = planCleanup({ total: totalBefore, newestAt: newestArticle?.createdAt, now });

        if (plan.action === "skip") {
            return NextResponse.json({
                status: "skipped",
                reason: plan.reason,
                message: plan.message,
                timestamp: now,
                newestArticle: newestArticle?.createdAt ?? null,
                totalArticles: totalBefore,
            });
        }

        // Oldest first, capped by the budget, so the newest MIN_KEEP always survive
        // even if every one of them is past the retention cutoff.
        const expired = await Article.find({ createdAt: { $lt: cutoff } })
            .sort({ createdAt: 1 })
            .limit(plan.budget)
            .select("_id")
            .lean();

        const deleteResult = expired.length
            ? await Article.deleteMany({ _id: { $in: expired.map((d) => d._id) } })
            : { deletedCount: 0 };

        const oldExpiredCount = await Article.countDocuments({ createdAt: { $lt: cutoff } });
        const totalAfter = await Article.countDocuments();
        const oldestArticle = await Article.findOne()
            .sort({ createdAt: 1 })
            .select("createdAt")
            .lean();

        return NextResponse.json({
            status: "success",
            timestamp: now,
            cleanup: {
                totalBefore,
                totalAfter,
                deleted: deleteResult.deletedCount,
                // Left behind because deleting them would have breached the floor.
                keptPastRetention: oldExpiredCount,
                floor: MIN_KEEP,
            },
            database: {
                currentArticles: totalAfter,
                oldestArticle: oldestArticle?.createdAt,
                newestArticle: newestArticle?.createdAt,
                retentionDays: 7,
            },
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Cleanup failed" },
            { status: 500 }
        );
    }
}
