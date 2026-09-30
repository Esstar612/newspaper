import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { server } from "../msw";
import type { Series } from "@/lib/metrics";
import { recordHash } from "@/lib/vectors";

const db = vi.hoisted(() => ({
    connectDB: vi.fn(),
    docs: [] as Array<Record<string, unknown>>,
    bulkWrite: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ connectDB: db.connectDB }));
vi.mock("@/models/Article", () => ({
    Article: {
        find: () => ({ select: () => ({ lean: () => Promise.resolve(db.docs) }) }),
        bulkWrite: db.bulkWrite,
    },
}));

const { GET } = await import("@/app/api/cron/sync-vectors/route");

const HOST = "https://newspaper-articles-test.svc.pinecone.io";
const UPSERT = `${HOST}/records/namespaces/production/upsert`;
const DATADOG = "https://api.datadoghq.com/api/v2/series";

const request = (headers: Record<string, string> = { authorization: "Bearer cron-secret" }) =>
    new NextRequest("http://localhost/api/cron/sync-vectors", { headers });

const article = (i: number) => ({
    _id: `66f0000000000000000000${String(i).padStart(2, "0")}`,
    title: `Story ${i}`,
    description: `About story ${i}`,
    url: `https://example.com/${i}`,
    source: "BBC News",
    tags: ["world"],
    publishedAt: new Date("2026-09-29T12:00:00Z"),
});

let posted: Series[] = [];
let upserts = 0;
let errors: ReturnType<typeof vi.spyOn>;

const runTags = () => posted.filter((s) => s.metric === "newspaper.cron.run").map((s) => s.tags);
const gauge = (metric: string) => posted.find((s) => s.metric === metric)?.points[0].value;

beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("DD_API_KEY", "test-key");
    vi.stubEnv("DD_SITE", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PINECONE_API_KEY", "test-key");
    vi.stubEnv("PINECONE_INDEX_HOST", "newspaper-articles-test.svc.pinecone.io");
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
    posted = [];
    upserts = 0;
    db.connectDB.mockReset().mockResolvedValue(undefined);
    db.docs = [article(1), article(2), article(3)];
    db.bulkWrite.mockReset().mockResolvedValue({});
    server.use(
        http.post(DATADOG, async ({ request }) => {
            posted.push(...((await request.json()) as { series: Series[] }).series);
            return HttpResponse.json({ errors: [] }, { status: 202 });
        }),
        http.post(UPSERT, () => {
            upserts++;
            return new HttpResponse(null, { status: 201 });
        })
    );
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("sync-vectors", () => {
    it("skips without Pinecone keys and sends nothing to Pinecone", async () => {
        vi.stubEnv("PINECONE_API_KEY", "");
        const res = await GET(request());
        expect(await res.json()).toMatchObject({ status: "skipped", reason: "no-keys" });
        expect(upserts).toBe(0);
        expect(db.connectDB).not.toHaveBeenCalled();
        expect(runTags()).toEqual([["env:production", "job:sync-vectors", "status:skipped"]]);
    });

    it("embeds pending articles and records each hash", async () => {
        const res = await GET(request());
        expect(await res.json()).toMatchObject({ status: "success", upserted: 3, failedBatches: 0, pending: 0 });
        expect(upserts).toBe(1);
        const ops = db.bulkWrite.mock.calls[0][0] as Array<{ updateOne: { filter: { _id: string }; update: { $set: { embeddedHash: string } } } }>;
        expect(ops.map((o) => o.updateOne.filter._id)).toEqual(db.docs.map((d) => d._id));
        expect(new Set(ops.map((o) => o.updateOne.update.$set.embeddedHash)).size).toBe(3);
        expect(runTags()).toEqual([["env:production", "job:sync-vectors", "status:success"]]);
        expect(gauge("newspaper.vectors.upserted")).toBe(3);
        expect(gauge("newspaper.vectors.pending")).toBe(0);
    });

    it("leaves articles already embedded with the same text and tags alone", async () => {
        db.docs = [{ ...article(1), embeddedHash: recordHash(article(1)) }, article(2)];
        const res = await GET(request());
        expect(await res.json()).toMatchObject({ status: "success", upserted: 1, pending: 0, total: 2 });
        const ops = db.bulkWrite.mock.calls[0][0] as Array<{ updateOne: { filter: { _id: string } } }>;
        expect(ops.map((o) => o.updateOne.filter._id)).toEqual([article(2)._id]);
    });

    it("reports a failed batch as a failed run with its counts", async () => {
        server.use(http.post(UPSERT, () => HttpResponse.json({ error: { code: "RESOURCE_EXHAUSTED" } }, { status: 429 })));
        const res = await GET(request());
        expect(await res.json()).toMatchObject({ status: "failed", upserted: 0, failedBatches: 1, pending: 3 });
        expect(db.bulkWrite).not.toHaveBeenCalled();
        expect(runTags()).toEqual([["env:production", "job:sync-vectors", "status:failed"]]);
        expect(gauge("newspaper.vectors.pending")).toBe(3);
    });

    it("reports a failure when the database is down", async () => {
        db.connectDB.mockRejectedValue(new Error("db down"));
        const res = await GET(request());
        expect(res.status).toBe(500);
        expect(runTags()).toEqual([["env:production", "job:sync-vectors", "status:failed"]]);
    });

    it("returns 401 for a bad secret and sends nothing", async () => {
        const res = await GET(request({ authorization: "Bearer wrong" }));
        expect(res.status).toBe(401);
        expect(posted).toEqual([]);
        expect(upserts).toBe(0);
        expect(errors).not.toHaveBeenCalled();
    });
});
