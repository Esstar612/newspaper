export type Job = "ingest-news" | "refresh-candles" | "cleanup-old-news" | "sync-vectors";
export type RunStatus = "success" | "skipped" | "failed";

export type Series = {
    metric: string;
    type: 1 | 3;
    points: Array<{ timestamp: number; value: number }>;
    tags: string[];
};

const COUNT = 1;
const GAUGE = 3;

export const slug = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

const series = (metric: string, type: 1 | 3, value: number, at: Date, tags: string[] = []): Series => ({
    metric,
    type,
    points: [{ timestamp: Math.floor(at.getTime() / 1000), value }],
    tags: [`env:${process.env.VERCEL_ENV || "development"}`, ...tags],
});

export const runSeries = (job: Job, status: RunStatus, at: Date): Series[] => [
    series("newspaper.cron.run", COUNT, 1, at, [`job:${job}`, `status:${status}`]),
];

export const ingestSeries = (
    result: { feeds: Array<{ source: string; category: string; count: number }>; upserted: number },
    at: Date
): Series[] => [
    ...result.feeds.map((f) =>
        series("newspaper.ingest.feed.items", GAUGE, f.count, at, [`source:${slug(f.source)}`, `category:${f.category}`])
    ),
    series("newspaper.ingest.upserted", GAUGE, result.upserted, at),
];

export const candlesSeries = (result: { symbolsOk: number }, at: Date): Series[] => [
    series("newspaper.candles.symbols_ok", GAUGE, result.symbolsOk, at),
];

export const cleanupSeries = (result: { deleted?: number; total: number }, at: Date): Series[] => [
    ...(result.deleted === undefined ? [] : [series("newspaper.cleanup.deleted", GAUGE, result.deleted, at)]),
    series("newspaper.articles.total", GAUGE, result.total, at),
];

export const vectorsSeries = (result: { upserted: number; pending: number }, at: Date): Series[] => [
    series("newspaper.vectors.upserted", GAUGE, result.upserted, at),
    series("newspaper.vectors.pending", GAUGE, result.pending, at),
];

export async function sendMetrics(payload: Series[], { timeoutMs = 3000 } = {}): Promise<void> {
    const key = process.env.DD_API_KEY;
    if (!key || payload.length === 0) return;

    try {
        const res = await fetch(`https://api.${process.env.DD_SITE || "datadoghq.com"}/api/v2/series`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "DD-API-KEY": key },
            body: JSON.stringify({ series: payload }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status !== 202) console.error(`Datadog rejected metrics (${res.status})`);
    } catch (e) {
        console.error(`Datadog metrics failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}
