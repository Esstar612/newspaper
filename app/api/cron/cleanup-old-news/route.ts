import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { MAX_ARTICLES, MIN_KEEP, RETENTION_DAYS, RETENTION_MS, planCleanup } from "@/lib/cleanup";
import { cleanupSeries, runSeries, sendMetrics } from "@/lib/metrics";
import { deleteVectors } from "@/lib/vectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const now = new Date();

    try {
        const authHeader = req.headers.get("authorization");
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        await connectDB();

        const cutoff = new Date(now.getTime() - RETENTION_MS);

        const totalBefore = await Article.countDocuments();
        const expired = await Article.countDocuments({ createdAt: { $lt: cutoff } });
        const newestArticle = await Article.findOne()
            .sort({ createdAt: -1 })
            .select("createdAt")
            .lean();

        const plan = planCleanup({ total: totalBefore, expired, newestAt: newestArticle?.createdAt, now });

        if (plan.action === "skip") {
            await sendMetrics([
                ...runSeries("cleanup-old-news", "skipped", now),
                ...cleanupSeries({ total: totalBefore }, now),
            ]);
            return NextResponse.json({
                status: "skipped",
                reason: plan.reason,
                message: plan.message,
                timestamp: now,
                newestArticle: newestArticle?.createdAt ?? null,
                totalArticles: totalBefore,
            });
        }

        const doomed = plan.count
            ? await Article.find().sort({ createdAt: 1 }).limit(plan.count).select("_id").lean()
            : [];

        const deleteResult = doomed.length
            ? await Article.deleteMany({ _id: { $in: doomed.map((d) => d._id) } })
            : { deletedCount: 0 };

        try {
            await deleteVectors(doomed.map((d) => String(d._id)));
        } catch (e) {
            console.error(`Pinecone delete failed: ${e instanceof Error ? e.message : String(e)}`);
        }

        const oldExpiredCount = await Article.countDocuments({ createdAt: { $lt: cutoff } });
        const totalAfter = await Article.countDocuments();
        const oldestArticle = await Article.findOne()
            .sort({ createdAt: 1 })
            .select("createdAt")
            .lean();

        await sendMetrics([
            ...runSeries("cleanup-old-news", "success", now),
            ...cleanupSeries({ deleted: deleteResult.deletedCount, total: totalAfter }, now),
        ]);

        return NextResponse.json({
            status: "success",
            timestamp: now,
            cleanup: {
                totalBefore,
                totalAfter,
                deleted: deleteResult.deletedCount,
                keptPastRetention: oldExpiredCount,
                floor: MIN_KEEP,
            },
            database: {
                currentArticles: totalAfter,
                oldestArticle: oldestArticle?.createdAt,
                newestArticle: newestArticle?.createdAt,
                retentionDays: RETENTION_DAYS,
                maxArticles: MAX_ARTICLES,
            },
        });
    } catch (e: unknown) {
        await sendMetrics(runSeries("cleanup-old-news", "failed", now));
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Cleanup failed" },
            { status: 500 }
        );
    }
}
