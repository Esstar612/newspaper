import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { server } from "../msw";
import type { Message, TextBlock } from "@anthropic-ai/sdk/resources/messages";
import type { Series } from "@/lib/metrics";
import { makeMessage, textBlock } from "../fixtures/messages";

const db = vi.hoisted(() => ({
    connectDB: vi.fn(),
    articles: [] as Array<{ _id: string; title: string; description: string; url: string }>,
    usage: new Map<string, number>(),
    expiries: new Map<string, Date>(),
    updates: [] as Array<{ filter: unknown; update: unknown; options: unknown }>,
}));

vi.mock("@/lib/db", () => ({ connectDB: db.connectDB }));
vi.mock("@/models/Article", () => ({
    Article: {
        find: (query: { _id: { $in: string[] } }) => ({
            select: () => ({
                lean: () => Promise.resolve(db.articles.filter((a) => query._id.$in.includes(a._id))),
            }),
        }),
    },
}));
vi.mock("@/models/AskUsage", () => ({
    AskUsage: {
        findOneAndUpdate: (
            filter: { key: string },
            update: { $inc: { n: number }; $setOnInsert: { expiresAt: Date } },
            options: unknown
        ) => {
            db.updates.push({ filter, update, options });
            if (!db.usage.has(filter.key)) db.expiries.set(filter.key, update.$setOnInsert.expiresAt);
            const n = (db.usage.get(filter.key) ?? 0) + update.$inc.n;
            db.usage.set(filter.key, n);
            return { lean: () => Promise.resolve({ key: filter.key, n }) };
        },
    },
}));

const { createAskHandler } = await import("@/lib/ask");
let scheduled: Promise<void>[] = [];
const POST = createAskHandler({ schedule: (task) => void scheduled.push(task()), maxRetries: 0 });

const PINECONE = "https://newspaper-articles-test.svc.pinecone.io";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const DATADOG = "https://api.datadoghq.com/api/v2/series";

const article = (id: string, title: string) => ({
    _id: id,
    title,
    description: `${title}, in detail.`,
    url: `https://example.com/${id}`,
});

async function ask(body: unknown, ip = "203.0.113.9") {
    const res = await POST(
        new NextRequest("http://localhost/api/ask", {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": ip },
            body: JSON.stringify(body),
        })
    );
    await Promise.all(scheduled);
    scheduled = [];
    return res;
}

let hits: string[] = [];
let searches: Array<Record<string, unknown>> = [];
let deleted: string[][] = [];
let claude: Array<Record<string, unknown>> = [];
let posted: Series[] = [];
let claudeReply: () => Response;
let errors: ReturnType<typeof vi.spyOn>;

const reply = (content: TextBlock[], stop_reason: Message["stop_reason"] = "end_turn") =>
    HttpResponse.json(makeMessage(content, stop_reason));

const outcomes = () => posted.filter((s) => s.metric === "newspaper.ask").map((s) => s.tags.find((t) => t.startsWith("outcome:")));

beforeEach(() => {
    vi.stubEnv("PINECONE_API_KEY", "test-key");
    vi.stubEnv("PINECONE_INDEX_HOST", "newspaper-articles-test.svc.pinecone.io");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ASK_MODEL", "");
    vi.stubEnv("DD_API_KEY", "test-key");
    vi.stubEnv("DD_SITE", "");
    vi.stubEnv("VERCEL_ENV", "production");
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
    db.connectDB.mockReset().mockResolvedValue(undefined);
    db.articles = [article("a1", "Bank holds rates"), article("a2", "Jobs report")];
    db.usage = new Map();
    db.expiries = new Map();
    db.updates = [];
    hits = ["a1", "a2"];
    searches = [];
    deleted = [];
    claude = [];
    posted = [];
    claudeReply = () =>
        reply([
            textBlock("The bank held rates.", [
                {
                    type: "search_result_location",
                    source: "https://example.com/a1",
                    title: "Bank holds rates",
                    cited_text: "Bank holds rates\nBank holds rates, in detail.",
                    search_result_index: 0,
                    start_block_index: 0,
                    end_block_index: 1,
                },
            ]),
        ]);
    server.use(
        http.post(`${PINECONE}/records/namespaces/production/search`, async ({ request }) => {
            searches.push((await request.json()) as Record<string, unknown>);
            return HttpResponse.json({
                result: { hits: hits.map((id, i) => ({ _id: id, _score: 0.9 - i / 10, fields: {} })) },
                usage: { read_units: 1, embed_total_tokens: 7 },
            });
        }),
        http.post(`${PINECONE}/vectors/delete`, async ({ request }) => {
            deleted.push(((await request.json()) as { ids: string[] }).ids);
            return HttpResponse.json({});
        }),
        http.post(ANTHROPIC, async ({ request }) => {
            claude.push((await request.json()) as Record<string, unknown>);
            return claudeReply();
        }),
        http.post(DATADOG, async ({ request }) => {
            posted.push(...((await request.json()) as { series: Series[] }).series);
            return HttpResponse.json({ errors: [] }, { status: 202 });
        })
    );
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("/api/ask", () => {
    it("answers with numbered sources from the articles", async () => {
        const res = await ask({ q: "What did the bank do?", category: "business" });
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({
            segments: [{ text: "The bank held rates.", cites: [1] }],
            sources: [{ n: 1, url: "https://example.com/a1", title: "Bank holds rates" }],
            refused: false,
            truncated: false,
            usage: { input_tokens: 1200, output_tokens: 80 },
        });
        expect(claude[0]).toMatchObject({ model: "claude-sonnet-5", max_tokens: 1024 });
        expect((claude[0].messages as Array<{ content: unknown[] }>)[0].content).toHaveLength(3);
        expect((searches[0].query as { filter: unknown }).filter).toEqual({ tags: { $in: ["business"] } });
        expect(outcomes()).toEqual(["outcome:answered"]);
    });

    it("uses the configured model", async () => {
        vi.stubEnv("ASK_MODEL", "claude-sonnet-5-5");
        await ask({ q: "What did the bank do?" });
        expect(claude[0].model).toBe("claude-sonnet-5-5");
    });

    it("returns 503 without keys, before the limiter or any paid call", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "");
        const res = await ask({ q: "What did the bank do?" });
        expect(res.status).toBe(503);
        expect(db.updates).toEqual([]);
        expect(searches).toEqual([]);
        expect(claude).toEqual([]);
        expect(outcomes()).toEqual(["outcome:unconfigured"]);
    });

    it.each([{}, { q: "hi" }, { q: "x".repeat(301) }, { q: "Fine question", category: "politics" }])(
        "rejects %j with 400",
        async (body) => {
            const res = await ask(body);
            expect(res.status).toBe(400);
            expect(searches).toEqual([]);
        }
    );

    it("uses the documented update shape for the usage buckets", async () => {
        await ask({ q: "What did the bank do?" });
        expect(db.updates[0]).toMatchObject({
            update: { $inc: { n: 1 }, $setOnInsert: { expiresAt: expect.any(Date) } },
            options: { upsert: true, returnDocument: "after" },
        });
        expect((db.updates[0].filter as { key: string }).key).toMatch(/^ip:[0-9a-f]{64}:/);
    });

    it("stores an expiry on each new bucket and keeps it on later requests", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-30T14:25:00Z"));
        await ask({ q: "What did the bank do?" });
        vi.setSystemTime(new Date("2026-09-30T14:40:00Z"));
        await ask({ q: "What did the bank do?" });
        const expiries = Object.fromEntries([...db.expiries].map(([k, v]) => [k.split(":")[0], v.toISOString()]));
        expect(expiries).toEqual({ ip: "2026-09-30T15:00:00.000Z", day: "2026-10-01T00:00:00.000Z" });
    });

    it("reports a database outage before the limiter as unavailable", async () => {
        db.connectDB.mockRejectedValue(new Error("db down"));
        const res = await ask({ q: "What did the bank do?" });
        expect(res.status).toBe(500);
        expect(outcomes()).toEqual(["outcome:unavailable"]);
    });

    it("limits an IP to 10 an hour and stops counting it toward the site", async () => {
        for (let i = 0; i < 10; i++) expect((await ask({ q: "What did the bank do?" })).status).toBe(200);
        const res = await ask({ q: "What did the bank do?" });
        expect(res.status).toBe(429);
        expect(await res.json()).toMatchObject({ scope: "ip" });
        const dayKey = [...db.usage.keys()].find((k) => k.startsWith("day:"))!;
        for (let i = 0; i < 5; i++) await ask({ q: "What did the bank do?" });
        expect(db.usage.get(dayKey)).toBe(10);
        expect(claude).toHaveLength(10);
        expect(outcomes().filter((o) => o === "outcome:limited")).toHaveLength(6);
    });

    it("limits the site to 200 a day", async () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date("2026-09-30T23:59:59.900Z"));
        const dayKey = "day:2026-09-30";
        db.usage.set(dayKey, 200);
        const res = await ask({ q: "What did the bank do?" }, "198.51.100.7");
        expect(res.status).toBe(429);
        expect(await res.json()).toMatchObject({ scope: "day" });
        expect(claude).toEqual([]);
    });

    it("answers without Claude when nothing matches", async () => {
        hits = [];
        const res = await ask({ q: "What happened on Mars?" });
        expect(await res.json()).toMatchObject({ noMatch: true, sources: [] });
        expect(claude).toEqual([]);
        expect(outcomes()).toEqual(["outcome:no_match"]);
    });

    it("drops a hit whose article is gone and deletes its vector", async () => {
        hits = ["gone", "a1"];
        await ask({ q: "What did the bank do?" });
        expect(deleted).toEqual([["gone"]]);
        const sent = (claude[0].messages as Array<{ content: Array<{ source?: string }> }>)[0].content;
        expect(sent.filter((b) => b.source).map((b) => b.source)).toEqual(["https://example.com/a1"]);
    });

    it("still answers when the stale delete fails", async () => {
        hits = ["gone", "a1"];
        server.use(http.post(`${PINECONE}/vectors/delete`, () => HttpResponse.json({ error: {} }, { status: 403 })));
        const res = await ask({ q: "What did the bank do?" });
        expect(res.status).toBe(200);
        expect(errors).toHaveBeenCalledTimes(1);
    });

    it("hides Claude's error behind a 502", async () => {
        claudeReply = () => HttpResponse.json({ type: "error", error: { type: "invalid_request_error", message: "secret detail" } }, { status: 400 });
        const res = await ask({ q: "What did the bank do?" });
        expect(res.status).toBe(502);
        expect(JSON.stringify(await res.json())).not.toContain("secret detail");
        expect(outcomes()).toEqual(["outcome:error"]);
    });

    it("reports a cut-off answer as truncated, not refused", async () => {
        claudeReply = () => reply([], "max_tokens");
        const res = await ask({ q: "What did the bank do?" });
        expect(await res.json()).toMatchObject({ truncated: true, refused: false });
        expect(outcomes()).toEqual(["outcome:truncated"]);
    });

    it("reports an answer with no surviving citation as refused", async () => {
        claudeReply = () => reply([textBlock("The results do not say.")]);
        const res = await ask({ q: "What did the bank do?" });
        expect(await res.json()).toMatchObject({ refused: true, truncated: false });
        expect(outcomes()).toEqual(["outcome:refused"]);
    });
});
