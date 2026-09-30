import { createHash } from "node:crypto";
import { Pinecone } from "@pinecone-database/pinecone";
import { GENERAL } from "./categories.ts";
import { slug } from "./metrics.ts";

export type VectorArticle = {
    _id: string;
    title: string;
    description: string;
    url: string;
    source: string;
    tags: string[];
    publishedAt?: Date | string | null;
    embeddedHash?: string;
};

type Options = { namespace?: string; maxRetries?: number };

const BATCH = 96;
const DELETE_BATCH = 1000;

export const articleText = (doc: Pick<VectorArticle, "title" | "description">) => `${doc.title}\n${doc.description}`;

export const textHash = (text: string) => createHash("sha256").update(text).digest("hex");

export const recordHash = (doc: Pick<VectorArticle, "title" | "description" | "tags">) =>
    textHash(`${articleText(doc)}\n${[...doc.tags].sort().join(",")}`);

export const articleRecord = (doc: VectorArticle) => ({
    _id: doc._id,
    text: articleText(doc),
    url: doc.url,
    title: doc.title,
    source: slug(doc.source),
    tags: doc.tags,
    publishedAt: doc.publishedAt ? new Date(doc.publishedAt).getTime() : 0,
});

export const pendingArticles = <T extends VectorArticle>(docs: T[]) =>
    docs.filter((d) => d.embeddedHash !== recordHash(d));

export const vectorsConfigured = () => Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_HOST);

function index({ namespace = "production", maxRetries = 1 }: Options) {
    const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY!, maxRetries });
    return pc.index({ host: process.env.PINECONE_INDEX_HOST!, namespace });
}

export async function syncVectors(
    articles: VectorArticle[],
    {
        markEmbedded,
        maxBatches = 6,
        ...options
    }: Options & { markEmbedded: (entries: Array<{ id: string; hash: string }>) => Promise<void>; maxBatches?: number }
): Promise<{ upserted: number; failedBatches: number; pending: number; skipped?: true }> {
    if (!vectorsConfigured()) return { upserted: 0, failedBatches: 0, pending: articles.length, skipped: true };

    const target = index(options);
    let upserted = 0;
    let failedBatches = 0;

    for (let start = 0; start < articles.length && start / BATCH < maxBatches; start += BATCH) {
        const batch = articles.slice(start, start + BATCH);
        try {
            await target.upsertRecords({ records: batch.map(articleRecord) });
        } catch (e) {
            failedBatches++;
            console.error(`Pinecone upsert failed: ${e instanceof Error ? e.message : String(e)}`);
            break;
        }
        await markEmbedded(batch.map((d) => ({ id: d._id, hash: recordHash(d) })));
        upserted += batch.length;
    }

    return { upserted, failedBatches, pending: articles.length - upserted };
}

export async function searchVectors(
    text: string,
    { category, topK = 8, ...options }: Options & { category?: string; topK?: number } = {}
): Promise<Array<{ id: string; score: number }>> {
    if (!vectorsConfigured()) return [];
    const filter = category && category !== GENERAL ? { tags: { $in: [category] } } : undefined;
    const response = await index(options).searchRecords({
        query: { topK, inputs: { text }, ...(filter ? { filter } : {}) },
        fields: ["url"],
    });
    return response.result.hits.map((hit) => ({ id: hit._id, score: hit._score }));
}

export async function deleteVectors(ids: string[], options: Options = {}): Promise<void> {
    if (!vectorsConfigured() || ids.length === 0) return;
    const target = index(options);
    for (let start = 0; start < ids.length; start += DELETE_BATCH) {
        await target.deleteMany({ ids: ids.slice(start, start + DELETE_BATCH) });
    }
}
