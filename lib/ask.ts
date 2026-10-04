import Anthropic from "@anthropic-ai/sdk";
import { after, NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { AskUsage } from "@/models/AskUsage";
import { readAnswer, requestAnswer, retrievalQuery, type AnswerArticle, type Turn } from "@/lib/answer";
import { isCategory } from "@/lib/categories";
import { isWhen, sinceFor, type When } from "@/lib/when";
import { askSeries, sendMetrics, type AskOutcome } from "@/lib/metrics";
import { incrementUpdate, takeSlot } from "@/lib/rate-limit";
import { deleteVectors, searchVectors } from "@/lib/vectors";

const NO_MATCH = "No recent articles match that question.";
const ROUTE_BUDGET_MS = 30_000;
const RESERVED_MS = 5_000;
const RELATED_MIN_SCORE = 0.35;

const configured = () =>
    Boolean(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX_HOST && process.env.ANTHROPIC_API_KEY);

const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

const increment = async (key: string, expiresAt: Date) => {
    const doc = await AskUsage.findOneAndUpdate({ key }, incrementUpdate(expiresAt), {
        upsert: true,
        returnDocument: "after",
    }).lean();
    return doc?.n ?? 0;
};

const MAX_HISTORY = 2;
const MAX_ANSWER_BYTES = 4_000;

function question(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    const bytes = Buffer.byteLength(text);
    return bytes >= 3 && bytes <= 300 ? text : null;
}

function parseHistory(value: unknown): Turn[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > MAX_HISTORY) return null;
    const turns: Turn[] = [];
    for (const turn of value) {
        if (!turn || typeof turn !== "object") return null;
        const { q, answer } = turn as Record<string, unknown>;
        const asked = question(q);
        if (!asked || typeof answer !== "string") return null;
        const bytes = Buffer.byteLength(answer);
        if (bytes < 1 || bytes > MAX_ANSWER_BYTES) return null;
        turns.push({ q: asked, answer });
    }
    return turns;
}

const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0);

function parse(body: unknown): { q: string; category?: string; history: Turn[]; when: When } | null {
    if (!body || typeof body !== "object") return null;
    const { q, category, history, when = "any" } = body as Record<string, unknown>;
    const asked = question(q);
    if (!asked) return null;
    if (category !== undefined && (typeof category !== "string" || !isCategory(category))) return null;
    const turns = parseHistory(history);
    if (!turns) return null;
    if (!isWhen(when)) return null;
    return { q: asked, category, history: turns, when };
}

export function createAskHandler({
    schedule = after,
    maxRetries = 1,
}: { schedule?: (task: () => Promise<void>) => void; maxRetries?: number } = {}) {
    return async function POST(req: NextRequest) {
        const now = new Date();
        const report = (outcome: AskOutcome, usage?: { input_tokens: number; output_tokens: number }) =>
            schedule(() => sendMetrics(askSeries(outcome, usage, now)));

        if (!configured()) {
            report("unconfigured");
            return NextResponse.json({ error: "Search is not set up yet." }, { status: 503 });
        }

        const input = parse(await req.json().catch(() => null));
        if (!input) {
            return NextResponse.json(
                { error: "Ask a question of 3 to 300 bytes (300 plain-text characters), optionally with a valid section, up to 2 earlier turns, and a window of any, week, month or year." },
                { status: 400 }
            );
        }

        let limited = false;
        try {
            await connectDB();

            const slot = await takeSlot(increment, clientIp(req), now);
            if (!slot.ok) {
                report("limited");
                return NextResponse.json(
                    { error: "Too many questions. Try again later.", scope: slot.scope, resetAt: slot.resetAt },
                    { status: 429 }
                );
            }
            limited = true;

            const hits = await searchVectors(retrievalQuery(input.q, input.history.at(-1)?.q), {
                category: input.category,
                since: sinceFor(input.when, now),
                maxRetries,
            });
            const ids = hits.map((h) => h.id);
            const found = ids.length
                ? await Article.find({ _id: { $in: ids } })
                      .select({ title: 1, description: 1, url: 1, imageUrl: 1, source: 1, publishedAt: 1, tags: 1 })
                      .lean()
                : [];
            const byId = new Map(found.map((d) => [String(d._id), d]));
            const stale = ids.filter((id) => !byId.has(id));
            if (stale.length) {
                schedule(() =>
                    deleteVectors(stale, { maxRetries }).catch((e) =>
                        console.error(`Pinecone delete failed: ${e instanceof Error ? e.message : String(e)}`)
                    )
                );
            }

            const articles: AnswerArticle[] = [];
            const related = [];
            for (const { id, score } of hits) {
                const d = byId.get(id);
                if (!d) continue;
                const description = d.description ?? "";
                articles.push({
                    id,
                    url: d.url,
                    title: d.title,
                    description,
                    source: d.source,
                    publishedAt: d.publishedAt,
                    imageUrl: d.imageUrl ?? "",
                });
                if (score < RELATED_MIN_SCORE) continue;
                related.push({
                    _id: id,
                    title: d.title,
                    description,
                    url: d.url,
                    imageUrl: d.imageUrl ?? "",
                    source: d.source,
                    publishedAt: d.publishedAt,
                    tags: d.tags ?? [],
                });
            }
            related.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));

            if (articles.length === 0) {
                report("no_match");
                return NextResponse.json({
                    segments: [{ text: NO_MATCH, cites: [] }],
                    sources: [],
                    related: [],
                    refused: false,
                    truncated: false,
                    noMatch: true,
                });
            }

            let message;
            try {
                const client = new Anthropic({
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    maxRetries: 0,
                    timeout: ROUTE_BUDGET_MS - RESERVED_MS,
                });
                message = await requestAnswer(
                    client,
                    process.env.ASK_MODEL || "claude-sonnet-5-5",
                    input.q,
                    articles,
                    input.history
                );
            } catch (e) {
                console.error(`Claude request failed: ${e instanceof Error ? e.message : String(e)}`);
                report("error");
                return NextResponse.json({ error: "The answer service is unavailable. Try again later." }, { status: 502 });
            }

            const answer = readAnswer(message, articles);
            report(answer.truncated ? "truncated" : answer.refused ? "refused" : "answered", message.usage);

            return NextResponse.json({
                segments: answer.segments,
                sources: answer.sources,
                related,
                refused: answer.refused,
                truncated: answer.truncated,
                usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
            });
        } catch (e) {
            console.error(`Ask failed: ${e instanceof Error ? e.message : String(e)}`);
            report(limited ? "error" : "unavailable");
            return NextResponse.json({ error: "Search failed. Try again later." }, { status: 500 });
        }
    };
}
