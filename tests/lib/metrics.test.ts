import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { server } from "../msw";
import {
    candlesSeries,
    vectorsSeries,
    askSeries,
    cleanupSeries,
    ingestSeries,
    runSeries,
    sendMetrics,
    slug,
} from "@/lib/metrics";

const AT = new Date("2026-09-30T00:36:15.104Z");
const SECONDS = 1790728575;
const US1 = "https://api.datadoghq.com/api/v2/series";

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("series builders", () => {
    it("tags a run with job, status and the Vercel environment", () => {
        vi.stubEnv("VERCEL_ENV", "production");
        expect(runSeries("ingest-news", "skipped", AT)).toEqual([
            {
                metric: "newspaper.cron.run",
                type: 1,
                points: [{ timestamp: SECONDS, value: 1 }],
                tags: ["env:production", "job:ingest-news", "status:skipped"],
            },
        ]);
    });

    it("falls back to env:development outside Vercel", () => {
        vi.stubEnv("VERCEL_ENV", "");
        expect(runSeries("refresh-candles", "failed", AT)[0].tags[0]).toBe("env:development");
    });

    it("slugs feed sources", () => {
        expect(["The New York Times", "BBC News", "BBC Sport"].map(slug)).toEqual([
            "the-new-york-times",
            "bbc-news",
            "bbc-sport",
        ]);
    });

    it("emits one gauge per feed plus the upsert count", () => {
        vi.stubEnv("VERCEL_ENV", "production");
        const series = ingestSeries(
            {
                feeds: [
                    { source: "BBC News", category: "world", count: 24 },
                    { source: "The New York Times", category: "business", count: 0 },
                ],
                upserted: 17,
            },
            AT
        );
        expect(series).toEqual([
            {
                metric: "newspaper.ingest.feed.items",
                type: 3,
                points: [{ timestamp: SECONDS, value: 24 }],
                tags: ["env:production", "source:bbc-news", "category:world"],
            },
            {
                metric: "newspaper.ingest.feed.items",
                type: 3,
                points: [{ timestamp: SECONDS, value: 0 }],
                tags: ["env:production", "source:the-new-york-times", "category:business"],
            },
            {
                metric: "newspaper.ingest.upserted",
                type: 3,
                points: [{ timestamp: SECONDS, value: 17 }],
                tags: ["env:production"],
            },
        ]);
    });

    it("emits the candles and cleanup gauges", () => {
        vi.stubEnv("VERCEL_ENV", "production");
        const gaugeOf = (metric: string, value: number) => ({
            metric,
            type: 3,
            points: [{ timestamp: SECONDS, value }],
            tags: ["env:production"],
        });
        expect(candlesSeries({ symbolsOk: 9 }, AT)).toEqual([gaugeOf("newspaper.candles.symbols_ok", 9)]);
        expect(cleanupSeries({ deleted: 40, total: 312 }, AT)).toEqual([
            gaugeOf("newspaper.cleanup.deleted", 40),
            gaugeOf("newspaper.articles.total", 312),
        ]);
        expect(cleanupSeries({ total: 150 }, AT)).toEqual([gaugeOf("newspaper.articles.total", 150)]);
    });
});

describe("vectorsSeries", () => {
    it("emits the upserted and pending gauges", () => {
        vi.stubEnv("VERCEL_ENV", "production");
        expect(vectorsSeries({ upserted: 96, pending: 12 }, AT).map((s) => [s.metric, s.type, s.points[0].value])).toEqual([
            ["newspaper.vectors.upserted", 3, 96],
            ["newspaper.vectors.pending", 3, 12],
        ]);
    });
});

describe("askSeries", () => {
    it("counts the outcome and records tokens when there are any", () => {
        vi.stubEnv("VERCEL_ENV", "production");
        expect(askSeries("answered", { input_tokens: 1200, output_tokens: 80 }, AT)).toEqual([
            { metric: "newspaper.ask", type: 1, points: [{ timestamp: SECONDS, value: 1 }], tags: ["env:production", "outcome:answered"] },
            { metric: "newspaper.ask.input_tokens", type: 3, points: [{ timestamp: SECONDS, value: 1200 }], tags: ["env:production"] },
            { metric: "newspaper.ask.output_tokens", type: 3, points: [{ timestamp: SECONDS, value: 80 }], tags: ["env:production"] },
        ]);
        expect(askSeries("limited", undefined, AT).map((s) => s.metric)).toEqual(["newspaper.ask"]);
    });
});

describe("sendMetrics", () => {
    const series = () => runSeries("ingest-news", "success", AT);

    it("sends nothing and logs nothing without a key", async () => {
        vi.stubEnv("DD_API_KEY", "");
        let hits = 0;
        server.use(
            http.post(US1, () => {
                hits++;
                return new HttpResponse(null, { status: 202 });
            })
        );
        await sendMetrics(series());
        expect(hits).toBe(0);
        expect(errors).not.toHaveBeenCalled();
    });

    it("posts once to the configured site with the key", async () => {
        vi.stubEnv("DD_API_KEY", "test-key");
        vi.stubEnv("DD_SITE", "datadoghq.eu");
        const seen: Request[] = [];
        server.use(
            http.post("https://api.datadoghq.eu/api/v2/series", ({ request }) => {
                seen.push(request.clone());
                return HttpResponse.json({ errors: [] }, { status: 202 });
            })
        );
        await sendMetrics(series());
        expect(seen).toHaveLength(1);
        expect(seen[0].headers.get("DD-API-KEY")).toBe("test-key");
        expect(await seen[0].json()).toEqual({ series: series() });
        expect(errors).not.toHaveBeenCalled();
    });

    it("defaults to US1 when no site is set", async () => {
        vi.stubEnv("DD_API_KEY", "test-key");
        vi.stubEnv("DD_SITE", "");
        let hits = 0;
        server.use(
            http.post(US1, () => {
                hits++;
                return HttpResponse.json({ errors: [] }, { status: 202 });
            })
        );
        await sendMetrics(series());
        expect(hits).toBe(1);
    });

    it("logs a rejection once and does not throw", async () => {
        vi.stubEnv("DD_API_KEY", "bad-key");
        server.use(http.post(US1, () => HttpResponse.json({ errors: ["Forbidden"] }, { status: 403 })));
        await expect(sendMetrics(series())).resolves.toBeUndefined();
        expect(errors).toHaveBeenCalledTimes(1);
        expect(String(errors.mock.calls[0][0])).toContain("403");
    });

    it("logs a network error once and does not throw", async () => {
        vi.stubEnv("DD_API_KEY", "test-key");
        server.use(http.post(US1, () => HttpResponse.error()));
        await expect(sendMetrics(series())).resolves.toBeUndefined();
        expect(errors).toHaveBeenCalledTimes(1);
    });

    it("gives up after the timeout", async () => {
        vi.stubEnv("DD_API_KEY", "test-key");
        server.use(
            http.post(US1, async () => {
                await delay("infinite");
                return new HttpResponse(null, { status: 202 });
            })
        );
        await expect(sendMetrics(series(), { timeoutMs: 50 })).resolves.toBeUndefined();
        expect(errors).toHaveBeenCalledTimes(1);
    });
});
