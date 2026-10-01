import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { server } from "../msw";
import type { Series } from "@/lib/metrics";

const db = vi.hoisted(() => {
    const chain = (value: () => unknown) => {
        const link: Record<string, unknown> = {};
        for (const m of ["sort", "select", "limit"]) link[m] = () => link;
        link.lean = () => Promise.resolve(value());
        return link;
    };
    return {
        connectDB: vi.fn(),
        newest: null as { createdAt: Date } | null,
        counts: [] as number[],
        expired: [] as Array<{ _id: string }>,
        articleBulkWrite: vi.fn(),
        candleBulkWrite: vi.fn(),
        deleteMany: vi.fn(),
        chain,
    };
});

vi.mock("@/lib/db", () => ({ connectDB: db.connectDB }));
vi.mock("@/models/Article", () => ({
    Article: {
        findOne: () => db.chain(() => db.newest),
        find: () => db.chain(() => db.expired),
        countDocuments: () => Promise.resolve(db.counts.shift() ?? 0),
        bulkWrite: db.articleBulkWrite,
        deleteMany: db.deleteMany,
    },
}));
vi.mock("@/models/CandleSeries", () => ({ CandleSeries: { bulkWrite: db.candleBulkWrite } }));

const { GET: ingest } = await import("@/app/api/cron/ingest-news/route");
const { GET: candles } = await import("@/app/api/cron/refresh-candles/route");
const { GET: cleanup } = await import("@/app/api/cron/cleanup-old-news/route");

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
const DATADOG = "https://api.datadoghq.com/api/v2/series";
const request = (path: string, headers: Record<string, string> = { authorization: "Bearer cron-secret" }) =>
    new NextRequest(`http://localhost${path}`, { headers });

let posted: Series[][] = [];
let errors: ReturnType<typeof vi.spyOn>;

const runTags = () => posted.flat().filter((s) => s.metric === "newspaper.cron.run").map((s) => s.tags);
const gauge = (metric: string, tag?: string) =>
    posted.flat().find((s) => s.metric === metric && (!tag || s.tags.includes(tag)))?.points[0].value;

beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("DD_API_KEY", "test-key");
    vi.stubEnv("DD_SITE", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PINECONE_API_KEY", "");
    posted = [];
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
    db.connectDB.mockReset().mockResolvedValue(undefined);
    db.newest = null;
    db.counts = [];
    db.expired = [];
    db.articleBulkWrite.mockReset().mockResolvedValue({ upsertedCount: 7, matchedCount: 3, modifiedCount: 1 });
    db.candleBulkWrite.mockReset().mockResolvedValue({ upsertedCount: 0, matchedCount: 9, modifiedCount: 9 });
    db.deleteMany.mockReset().mockResolvedValue({ deletedCount: 0 });
    server.use(
        http.post(DATADOG, async ({ request }) => {
            posted.push(((await request.json()) as { series: Series[] }).series);
            return HttpResponse.json({ errors: [] }, { status: 202 });
        })
    );
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe.each([
    ["ingest-news", () => ingest],
    ["refresh-candles", () => candles],
    ["cleanup-old-news", () => cleanup],
] as const)("%s with a bad secret", (job, handler) => {
    it("returns 401 and sends nothing", async () => {
        const res = await handler()(request(`/api/cron/${job}`, { authorization: "Bearer wrong" }));
        expect(res.status).toBe(401);
        expect(posted).toEqual([]);
        expect(errors).not.toHaveBeenCalled();
    });
});

describe("ingest-news", () => {
    beforeEach(() => {
        server.use(
            http.get("https://rss.nytimes.com/services/xml/rss/nyt/Health.xml", () => new HttpResponse(null, { status: 500 })),
            http.get(/rss\.nytimes\.com/, () => HttpResponse.text(fixture("nyt.xml"))),
            http.get(/feeds\.bbci\.co\.uk/, () => HttpResponse.text(fixture("bbc.xml")))
        );
    });

    it("reports a completed run with a gauge per feed", async () => {
        const res = await ingest(request("/api/cron/ingest-news"));
        expect(res.status).toBe(200);
        expect(runTags()).toEqual([["env:production", "job:ingest-news", "status:success"]]);
        expect(posted.flat().filter((s) => s.metric === "newspaper.ingest.feed.items")).toHaveLength(11);
        expect(gauge("newspaper.ingest.feed.items", "category:health")).toBe(0);
        expect(gauge("newspaper.ingest.feed.items", "category:world")).toBe(1);
        expect(gauge("newspaper.ingest.upserted")).toBe(7);
    });

    it("reports a failed run when every feed fails", async () => {
        server.use(
            http.get(/rss\.nytimes\.com/, () => new HttpResponse(null, { status: 500 })),
            http.get(/feeds\.bbci\.co\.uk/, () => new HttpResponse(null, { status: 500 }))
        );
        const res = await ingest(request("/api/cron/ingest-news"));
        expect((await res.json()).status).toBe("failed");
        expect(runTags()).toEqual([["env:production", "job:ingest-news", "status:failed"]]);
        expect(gauge("newspaper.ingest.feed.items", "category:world")).toBe(0);
    });

    it("reports a skip when the newest article is recent", async () => {
        db.newest = { createdAt: new Date(Date.now() - 60_000) };
        const res = await ingest(request("/api/cron/ingest-news"));
        expect((await res.json()).status).toBe("skipped");
        expect(runTags()).toEqual([["env:production", "job:ingest-news", "status:skipped"]]);
    });

    it("reports a failure when the database is down", async () => {
        db.connectDB.mockRejectedValue(new Error("db down"));
        const res = await ingest(request("/api/cron/ingest-news"));
        expect(res.status).toBe(500);
        expect(runTags()).toEqual([["env:production", "job:ingest-news", "status:failed"]]);
    });

    it("sends nothing for force=1 without a secret configured", async () => {
        vi.stubEnv("CRON_SECRET", "");
        const res = await ingest(request("/api/cron/ingest-news?force=1", {}));
        expect(res.status).toBe(403);
        expect(posted).toEqual([]);
    });
});

describe("refresh-candles", () => {
    beforeEach(() => vi.stubEnv("MARKET_DATA_API_TOKEN", "test-token"));

    it(
        "reports how many symbols returned history",
        async () => {
            server.use(
                http.get("https://api.marketdata.app/v1/stocks/candles/D/:symbol/", ({ params }) =>
                    params.symbol === "AAPL"
                        ? new HttpResponse(null, { status: 403 })
                        : HttpResponse.json({ s: "ok", t: [1790000000, 1790086400], c: [101.5, 102.25] })
                )
            );
            const res = await candles(request("/api/cron/refresh-candles"));
            expect(res.status).toBe(200);
            expect(runTags()).toEqual([["env:production", "job:refresh-candles", "status:success"]]);
            expect(gauge("newspaper.candles.symbols_ok")).toBe(9);
            expect(errors).toHaveBeenCalledTimes(1);
            expect(String(errors.mock.calls[0][0])).toContain("AAPL");
            expect(String(errors.mock.calls[0][0])).toContain("403");
        },
        10_000
    );

    it(
        "reports a failed run when every symbol fails",
        async () => {
            server.use(
                http.get("https://api.marketdata.app/v1/stocks/candles/D/:symbol/", () => new HttpResponse(null, { status: 403 }))
            );
            const res = await candles(request("/api/cron/refresh-candles"));
            expect((await res.json()).status).toBe("failed");
            expect(runTags()).toEqual([["env:production", "job:refresh-candles", "status:failed"]]);
            expect(gauge("newspaper.candles.symbols_ok")).toBe(0);
        },
        10_000
    );

    it("reports a failure when the database is down", async () => {
        db.connectDB.mockRejectedValue(new Error("db down"));
        const res = await candles(request("/api/cron/refresh-candles"));
        expect(res.status).toBe(500);
        expect(runTags()).toEqual([["env:production", "job:refresh-candles", "status:failed"]]);
    });
});

describe("cleanup-old-news", () => {
    it("reports deletions and the new total", async () => {
        db.newest = { createdAt: new Date() };
        db.counts = [400, 0, 380];
        db.expired = Array.from({ length: 20 }, (_, i) => ({ _id: `id${i}` }));
        db.deleteMany.mockResolvedValue({ deletedCount: 20 });
        const res = await cleanup(request("/api/cron/cleanup-old-news"));
        expect((await res.json()).status).toBe("success");
        expect(runTags()).toEqual([["env:production", "job:cleanup-old-news", "status:success"]]);
        expect(gauge("newspaper.cleanup.deleted")).toBe(20);
        expect(gauge("newspaper.articles.total")).toBe(380);
    });

    it("deletes the removed articles' vectors", async () => {
        vi.stubEnv("PINECONE_API_KEY", "test-key");
        vi.stubEnv("PINECONE_INDEX_HOST", "newspaper-articles-test.svc.pinecone.io");
        const deleted: string[][] = [];
        server.use(
            http.post("https://newspaper-articles-test.svc.pinecone.io/vectors/delete", async ({ request }) => {
                deleted.push(((await request.json()) as { ids: string[] }).ids);
                return HttpResponse.json({});
            })
        );
        db.newest = { createdAt: new Date() };
        db.counts = [400, 0, 380];
        db.expired = Array.from({ length: 3 }, (_, i) => ({ _id: `id${i}` }));
        db.deleteMany.mockResolvedValue({ deletedCount: 3 });
        await cleanup(request("/api/cron/cleanup-old-news"));
        expect(deleted).toEqual([["id0", "id1", "id2"]]);
    });

    it("stays a success when Pinecone rejects the delete", async () => {
        vi.stubEnv("PINECONE_API_KEY", "test-key");
        vi.stubEnv("PINECONE_INDEX_HOST", "newspaper-articles-test.svc.pinecone.io");
        server.use(
            http.post("https://newspaper-articles-test.svc.pinecone.io/vectors/delete", () =>
                HttpResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 })
            )
        );
        db.newest = { createdAt: new Date() };
        db.counts = [400, 0, 380];
        db.expired = [{ _id: "id0" }];
        db.deleteMany.mockResolvedValue({ deletedCount: 1 });
        const res = await cleanup(request("/api/cron/cleanup-old-news"));
        expect((await res.json()).status).toBe("success");
        expect(runTags()).toEqual([["env:production", "job:cleanup-old-news", "status:success"]]);
        expect(errors).toHaveBeenCalledTimes(1);
    });

    it("reports a skip with the current total", async () => {
        db.newest = { createdAt: new Date() };
        db.counts = [100];
        const res = await cleanup(request("/api/cron/cleanup-old-news"));
        expect((await res.json()).status).toBe("skipped");
        expect(runTags()).toEqual([["env:production", "job:cleanup-old-news", "status:skipped"]]);
        expect(gauge("newspaper.articles.total")).toBe(100);
        expect(gauge("newspaper.cleanup.deleted")).toBeUndefined();
    });

    it("reports a failure when the database is down", async () => {
        db.connectDB.mockRejectedValue(new Error("db down"));
        const res = await cleanup(request("/api/cron/cleanup-old-news"));
        expect(res.status).toBe(500);
        expect(runTags()).toEqual([["env:production", "job:cleanup-old-news", "status:failed"]]);
    });
});
