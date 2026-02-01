// app/api/cron/cleanup-old-news/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cleanup Strategy:
 * - Keep articles from last 7 days (fresh and relevant)
 * - Delete anything older than 7 days
 * - Runs daily at 3 AM UTC
 *
 * Database size estimate:
 * - ~2,000 articles/day ingested
 * - Keep 7 days = ~14,000 articles max
 * - Average article size: ~1KB
 * - Total DB size: ~14MB (very manageable!)
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
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Count articles before cleanup
        const totalBefore = await Article.countDocuments();
        const oldArticlesCount = await Article.countDocuments({
            createdAt: { $lt: sevenDaysAgo }
        });

        // Delete old articles
        const deleteResult = await Article.deleteMany({
            createdAt: { $lt: sevenDaysAgo }
        });

        // Get DB stats after cleanup
        const totalAfter = await Article.countDocuments();
        const oldestArticle = await Article.findOne().sort({ createdAt: 1 }).select("createdAt").lean();
        const newestArticle = await Article.findOne().sort({ createdAt: -1 }).select("createdAt").lean();

        return NextResponse.json({
            status: "success",
            timestamp: now,
            cleanup: {
                totalBefore,
                totalAfter,
                deleted: deleteResult.deletedCount,
                oldArticlesFound: oldArticlesCount,
            },
            database: {
                currentArticles: totalAfter,
                oldestArticle: oldestArticle?.createdAt,
                newestArticle: newestArticle?.createdAt,
                retentionDays: 7,
            },
            estimatedSize: {
                articles: totalAfter,
                approxSizeMB: Math.round((totalAfter * 1) / 1024), // ~1KB per article
            },
        });
    } catch (e: unknown) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Cleanup failed" },
            { status: 500 }
        );
    }
}