import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw";
import {
    articleRecord,
    articleText,
    deleteVectors,
    pendingArticles,
    recordHash,
    searchVectors,
    syncVectors,
    textHash,
    type VectorArticle,
} from "@/lib/vectors";

const HOST = "https://newspaper-articles-test.svc.pinecone.io";
const UPSERT = `${HOST}/records/namespaces/production/upsert`;

const doc = (id: string, title: string, overrides: Partial<VectorArticle> = {}): VectorArticle => ({
    _id: id,
    title,
    description: `About ${title}`,
    url: `https://example.com/${id}`,
    source: "BBC News",
    tags: ["business"],
    publishedAt: new Date("2026-09-29T12:00:00Z"),
    ...overrides,
});
const docs = (n: number) => Array.from({ length: n }, (_, i) => doc(`a${i}`, `Story ${i}`));

let errors: ReturnType<typeof vi.spyOn>;
let upserts: string[][] = [];

beforeEach(() => {
    vi.stubEnv("PINECONE_API_KEY", "test-key");
    vi.stubEnv("PINECONE_INDEX_HOST", "newspaper-articles-test.svc.pinecone.io");
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
    upserts = [];
    server.use(
        http.post(UPSERT, async ({ request }) => {
            upserts.push((await request.text()).split("\n"));
            return new HttpResponse(null, { status: 201 });
        })
    );
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("records", () => {
    it("builds the record Pinecone embeds", () => {
        expect(articleRecord(doc("a1", "Rates held"))).toEqual({
            _id: "a1",
            text: "Rates held\nAbout Rates held",
            url: "https://example.com/a1",
            title: "Rates held",
            source: "bbc-news",
            tags: ["business"],
            publishedAt: Date.parse("2026-09-29T12:00:00Z"),
        });
    });

    it("changes the hash when the text changes", () => {
        const a = doc("a1", "Rates held");
        expect(textHash(articleText(a))).toMatch(/^[0-9a-f]{64}$/);
        expect(textHash(articleText(a))).not.toBe(textHash(articleText({ ...a, description: "Revised" })));
    });

    it("picks articles never embedded or embedded with other text", () => {
        const fresh = doc("a1", "One");
        const current = { ...doc("a2", "Two"), embeddedHash: recordHash(doc("a2", "Two")) };
        const stale = { ...doc("a3", "Three"), embeddedHash: "old" };
        expect(pendingArticles([fresh, current, stale]).map((d) => d._id)).toEqual(["a1", "a3"]);
    });

    it("re-embeds an article that gained a section tag", () => {
        const before = doc("a1", "One");
        const after = { ...before, tags: ["business", "world"], embeddedHash: recordHash(before) };
        expect(pendingArticles([after]).map((d) => d._id)).toEqual(["a1"]);
        expect(recordHash({ ...before, tags: ["world", "business"] })).toBe(recordHash(after));
    });
});

describe("syncVectors", () => {
    const run = (articles: VectorArticle[], options: { maxBatches?: number } = {}) => {
        const marked: Array<{ id: string; hash: string }> = [];
        const result = syncVectors(articles, {
            markEmbedded: async (entries) => void marked.push(...entries),
            maxRetries: 0,
            ...options,
        });
        return { marked, result };
    };

    it("gives two articles in one batch their own hashes", async () => {
        const { marked, result } = run([doc("a1", "First"), doc("a2", "Second")]);
        expect(await result).toEqual({ upserted: 2, failedBatches: 0, pending: 0 });
        expect(marked).toEqual([
            { id: "a1", hash: recordHash(doc("a1", "First")) },
            { id: "a2", hash: recordHash(doc("a2", "Second")) },
        ]);
        expect(marked[0].hash).not.toBe(marked[1].hash);
    });

    it("sends batches of 96 as NDJSON", async () => {
        await run(docs(200)).result;
        expect(upserts.map((lines) => lines.length)).toEqual([96, 96, 8]);
        expect(JSON.parse(upserts[0][0])).toMatchObject({ _id: "a0", text: "Story 0\nAbout Story 0" });
    });

    it("stops after maxBatches and reports what is left", async () => {
        const { marked, result } = run(docs(700), { maxBatches: 6 });
        expect(await result).toEqual({ upserted: 576, failedBatches: 0, pending: 124 });
        expect(upserts).toHaveLength(6);
        expect(marked).toHaveLength(576);
    });

    it("stops at a 429 and leaves later hashes unset", async () => {
        let calls = 0;
        server.use(
            http.post(UPSERT, () =>
                ++calls === 2
                    ? HttpResponse.json({ error: { code: "RESOURCE_EXHAUSTED", message: "quota" } }, { status: 429 })
                    : new HttpResponse(null, { status: 201 })
            )
        );
        const { marked, result } = run(docs(300));
        expect(await result).toEqual({ upserted: 96, failedBatches: 1, pending: 204 });
        expect(calls).toBe(2);
        expect(marked).toHaveLength(96);
        expect(errors).toHaveBeenCalledTimes(1);
    });

    it("writes to the namespace it is given", async () => {
        let hits = 0;
        server.use(
            http.post(`${HOST}/records/namespaces/eval-2026-09-30/upsert`, () => {
                hits++;
                return new HttpResponse(null, { status: 201 });
            })
        );
        const marked: Array<{ id: string; hash: string }> = [];
        await syncVectors(docs(2), {
            markEmbedded: async (e) => void marked.push(...e),
            namespace: "eval-2026-09-30",
            maxRetries: 0,
        });
        expect(hits).toBe(1);
        expect(upserts).toEqual([]);
    });

    it("sends nothing without keys", async () => {
        vi.stubEnv("PINECONE_INDEX_HOST", "");
        const { marked, result } = run(docs(3));
        expect(await result).toEqual({ upserted: 0, failedBatches: 0, pending: 3, skipped: true });
        expect(upserts).toEqual([]);
        expect(marked).toEqual([]);
    });
});

describe("searchVectors", () => {
    const serveSearch = () => {
        const bodies: Array<Record<string, unknown>> = [];
        server.use(
            http.post(`${HOST}/records/namespaces/production/search`, async ({ request }) => {
                bodies.push((await request.json()) as Record<string, unknown>);
                return HttpResponse.json({
                    result: { hits: [{ _id: "a1", _score: 0.82, fields: {} }, { _id: "a2", _score: 0.61, fields: {} }] },
                    usage: { read_units: 1, embed_total_tokens: 6 },
                });
            })
        );
        return bodies;
    };

    it("searches every section for general, with no filter", async () => {
        const bodies = serveSearch();
        const hits = await searchVectors("what did the bank do", { category: "general", maxRetries: 0 });
        expect(hits).toEqual([
            { id: "a1", score: 0.82 },
            { id: "a2", score: 0.61 },
        ]);
        expect(bodies[0]).toMatchObject({ query: { top_k: 8, inputs: { text: "what did the bank do" } } });
        expect((bodies[0].query as Record<string, unknown>).filter).toBeUndefined();
    });

    it("filters by the section tag", async () => {
        const bodies = serveSearch();
        await searchVectors("rates", { category: "business", maxRetries: 0 });
        expect((bodies[0].query as Record<string, unknown>).filter).toEqual({ tags: { $in: ["business"] } });
    });
});

describe("deleteVectors", () => {
    it("sends 1000 IDs per request", async () => {
        const bodies: Array<{ ids: string[]; namespace: string }> = [];
        server.use(
            http.post(`${HOST}/vectors/delete`, async ({ request }) => {
                bodies.push((await request.json()) as { ids: string[]; namespace: string });
                return HttpResponse.json({});
            })
        );
        await deleteVectors(Array.from({ length: 1001 }, (_, i) => `id${i}`), { maxRetries: 0 });
        expect(bodies.map((b) => b.ids.length)).toEqual([1000, 1]);
        expect(bodies.every((b) => b.namespace === "production")).toBe(true);
    });

    it("sends nothing and logs nothing without keys", async () => {
        vi.stubEnv("PINECONE_API_KEY", "");
        await deleteVectors(["id1"], { maxRetries: 0 });
        expect(errors).not.toHaveBeenCalled();
    });
});
