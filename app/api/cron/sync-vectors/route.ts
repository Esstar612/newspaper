import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { runSeries, sendMetrics, vectorsSeries } from "@/lib/metrics";
import { pendingArticles, syncVectors, vectorsConfigured, type VectorArticle } from "@/lib/vectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const now = new Date();

    try {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!vectorsConfigured()) {
            await sendMetrics(runSeries("sync-vectors", "skipped", now));
            return NextResponse.json({ status: "skipped", reason: "no-keys", timestamp: now });
        }

        await connectDB();

        const docs = await Article.find()
            .select({ title: 1, description: 1, url: 1, source: 1, tags: 1, publishedAt: 1, embeddedHash: 1 })
            .lean();

        const articles: VectorArticle[] = docs.map((d) => ({
            _id: String(d._id),
            title: d.title,
            description: d.description ?? "",
            url: d.url,
            source: d.source,
            tags: d.tags ?? [],
            publishedAt: d.publishedAt,
            embeddedHash: d.embeddedHash ?? undefined,
        }));

        const result = await syncVectors(pendingArticles(articles), {
            markEmbedded: async (entries) => {
                await Article.bulkWrite(
                    entries.map(({ id, hash }) => ({
                        updateOne: { filter: { _id: id }, update: { $set: { embeddedHash: hash } } },
                    }))
                );
            },
        });

        const status = result.failedBatches ? "failed" : "success";
        await sendMetrics([...runSeries("sync-vectors", status, now), ...vectorsSeries(result, now)]);

        return NextResponse.json({ status, timestamp: now, total: articles.length, ...result });
    } catch (e: unknown) {
        await sendMetrics(runSeries("sync-vectors", "failed", now));
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Vector sync failed" },
            { status: 500 }
        );
    }
}
