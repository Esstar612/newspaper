import Anthropic from "@anthropic-ai/sdk";
import { after, NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Article } from "@/models/Article";
import { AskUsage } from "@/models/AskUsage";
import { SYSTEM_PROMPT, buildMessages, readAnswer, type AnswerArticle } from "@/lib/answer";
import { isCategory } from "@/lib/categories";
import { askSeries, sendMetrics, type AskOutcome } from "@/lib/metrics";
import { incrementUpdate, takeSlot } from "@/lib/rate-limit";
import { deleteVectors, searchVectors } from "@/lib/vectors";

const NO_MATCH = "No recent articles match that question.";
const ROUTE_BUDGET_MS = 30_000;
const RESERVED_MS = 5_000;

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

function parse(body: unknown): { q: string; category?: string } | null {
    if (!body || typeof body !== "object") return null;
    const { q, category } = body as Record<string, unknown>;
    if (typeof q !== "string") return null;
    const question = q.trim();
    const bytes = Buffer.byteLength(question);
    if (bytes < 3 || bytes > 300) return null;
    if (category !== undefined && (typeof category !== "string" || !isCategory(category))) return null;
    return { q: question, category };
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
                { error: "Ask a question of 3 to 300 bytes (300 plain-text characters), optionally with a valid section." },
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

            const hits = await searchVectors(input.q, { category: input.category, maxRetries });
            const ids = hits.map((h) => h.id);
            const found = ids.length
                ? await Article.find({ _id: { $in: ids } }).select({ title: 1, description: 1, url: 1 }).lean()
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
            for (const id of ids) {
                const d = byId.get(id);
                if (d) articles.push({ id, url: d.url, title: d.title, description: d.description ?? "" });
            }

            if (articles.length === 0) {
                report("no_match");
                return NextResponse.json({
                    segments: [{ text: NO_MATCH, cites: [] }],
                    sources: [],
                    refused: false,
                    truncated: false,
                    noMatch: true,
                });
            }

            let message;
            try {
                message = await new Anthropic({
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    maxRetries: 0,
                    timeout: ROUTE_BUDGET_MS - RESERVED_MS,
                }).messages.create({
                    model: process.env.ASK_MODEL || "claude-sonnet-5",
                    max_tokens: 1024,
                    output_config: { effort: "low" },
                    thinking: { type: "disabled" },
                    system: SYSTEM_PROMPT,
                    messages: buildMessages(input.q, articles),
                });
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
