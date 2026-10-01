import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { Pinecone } from "@pinecone-database/pinecone";
import { readAnswer, requestAnswer, type AnswerArticle } from "../lib/answer.ts";
import { searchVectors, syncVectors, type VectorArticle } from "../lib/vectors.ts";
import { answerForJudge, citationPrecision, coversGold, judgePrompt, mean, parseJudge, recallAtK, reciprocalRank } from "../eval/metrics.ts";

type Golden = { id: string; question: string; category?: string; answerable: boolean; gold: Array<{ id: string; url: string }> };

const ANSWER_COST = 0.022;
const JUDGE_COST = 0.03;
const JUDGE_MODEL = "claude-opus-5-5";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function arg(name: string) {
    const i = process.argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i === -1) return undefined;
    return process.argv[i].includes("=") ? process.argv[i].split("=")[1] : process.argv[i + 1];
}
const ids = (hits: Array<{ id: string }>) => hits.map((h) => h.id);

async function main() {
    const snapshot = JSON.parse(readFileSync(new URL("../eval/snapshot.local.json", import.meta.url), "utf8")) as {
        articles: VectorArticle[];
    };
    const golden = JSON.parse(readFileSync(new URL("../eval/golden.json", import.meta.url), "utf8")) as Golden[];
    const models = (arg("models") ?? "claude-sonnet-5").split(",");
    const retrievalOnly = process.argv.includes("--retrieval-only");
    const estimate = retrievalOnly ? 0 : golden.length * models.length * (ANSWER_COST + JUDGE_COST);

    console.log(`${snapshot.articles.length} articles, ${golden.length} questions, models: ${models.join(", ")}`);
    console.log(`Estimated Claude cost: about $${estimate.toFixed(2)}${retrievalOnly ? " (retrieval only)" : ""}`);
    if (!process.argv.includes("--yes")) {
        console.log("Dry run. Add --yes to embed the snapshot and run the eval.");
        return;
    }

    const namespace = `eval-${new Date().toISOString().slice(0, 10)}`;
    const index = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! }).index({
        host: process.env.PINECONE_INDEX_HOST!,
        namespace,
    });
    const byId = new Map(snapshot.articles.map((a) => [a._id, a]));

    try {
        let remaining = snapshot.articles;
        while (remaining.length) {
            const result = await syncVectors(remaining, { namespace, markEmbedded: async () => {} });
            if (result.skipped) throw new Error("Pinecone keys are missing; run with node --env-file=.env.local");
            if (result.failedBatches) throw new Error("A Pinecone upsert failed; see the log above.");
            remaining = remaining.slice(result.upserted);
            console.log(`Embedded ${snapshot.articles.length - remaining.length} of ${snapshot.articles.length}`);
            if (remaining.length) await sleep(60_000);
        }
        for (let attempt = 1; ; attempt++) {
            const stats = await index.describeIndexStats();
            const count = stats.namespaces?.[namespace]?.recordCount ?? 0;
            if (count >= snapshot.articles.length) break;
            if (attempt >= 60) throw new Error(`Pinecone still reports ${count} of ${snapshot.articles.length} after 5 minutes.`);
            console.log(`Waiting for Pinecone: ${count} of ${snapshot.articles.length} searchable`);
            await sleep(5_000);
        }

        type Hits = Awaited<ReturnType<typeof searchVectors>>;
        const rows: Array<{ g: Golden; unfiltered: Hits; filtered: Hits }> = [];
        for (const g of golden) {
            const unfiltered = await searchVectors(g.question, { namespace });
            const filtered = g.category ? await searchVectors(g.question, { namespace, category: g.category }) : unfiltered;
            rows.push({ g, unfiltered, filtered });
        }
        const answerable = rows.filter((r) => r.g.answerable);
        const gold = (r: (typeof rows)[number]) => r.g.gold.map((x) => x.id);
        const retrieval = {
            recallAt5: mean(answerable.map((r) => recallAtK(ids(r.unfiltered), gold(r), 5))),
            mrrAt8: mean(answerable.map((r) => reciprocalRank(ids(r.unfiltered), gold(r)))),
            recallAt5Filtered: mean(answerable.map((r) => recallAtK(ids(r.filtered), gold(r), 5))),
            mrrAt8Filtered: mean(answerable.map((r) => reciprocalRank(ids(r.filtered), gold(r)))),
        };
        console.table(retrieval);

        const results: Record<string, unknown> = { namespace, retrieval, scores: rows.map((r) => ({ id: r.g.id, hits: r.filtered })) };
        const save = () => writeFileSync(new URL("../eval/results.local.json", import.meta.url), JSON.stringify(results, null, 1));
        save();
        if (!retrievalOnly) {
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
            for (const model of models) {
                const graded = [];
                for (const r of rows) {
                    const articles: AnswerArticle[] = r.filtered.flatMap((h) => {
                        const a = byId.get(h.id);
                        return a ? [{ id: a._id, url: a.url, title: a.title, description: a.description }] : [];
                    });
                    if (articles.length === 0) {
                        graded.push({
                            id: r.g.id,
                            answerable: r.g.answerable,
                            noMatch: true,
                            refused: false,
                            truncated: false,
                            precision: null,
                            coversGold: r.g.answerable ? false : null,
                            judge: null,
                            outputTokens: 0,
                            judgeOutputTokens: 0,
                        });
                        continue;
                    }
                    const message = await requestAnswer(client, model, r.g.question, articles);
                    const answer = readAnswer(message, articles);
                    const text = answerForJudge(answer, articles);
                    const cited = answer.sources.flatMap((s) => {
                        const a = articles.find((x) => x.url === s.url);
                        return a ? [a.id] : [];
                    });
                    const verdict = await client.messages.create({
                        model: JUDGE_MODEL,
                        max_tokens: 4096,
                        output_config: { effort: "low" },
                        messages: [{ role: "user", content: judgePrompt(r.g.question, text, articles) }],
                    });
                    const judgeText = verdict.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
                    graded.push({
                        id: r.g.id,
                        answerable: r.g.answerable,
                        noMatch: false,
                        refused: answer.refused,
                        truncated: answer.truncated,
                        precision: r.g.answerable ? citationPrecision(cited, gold(r)) : null,
                        coversGold: r.g.answerable ? coversGold(cited, gold(r)) : null,
                        judge: parseJudge(judgeText),
                        outputTokens: message.usage.output_tokens,
                        judgeOutputTokens: verdict.usage.output_tokens,
                    });
                }
                const ans = graded.filter((x) => x.answerable);
                const un = graded.filter((x) => !x.answerable);
                const summary = {
                    citationPrecision: mean(ans.map((x) => x.precision)),
                    goldCoverage: mean(ans.map((x) => (x.coversGold ? 1 : 0))),
                    refusalAccuracy: mean(un.map((x) => (x.refused && x.judge?.refusalCorrect ? 1 : 0))),
                    truncated: graded.filter((x) => x.truncated).length,
                    noMatch: graded.filter((x) => x.noMatch).length,
                    rubric: mean(ans.map((x) => (x.judge ? (x.judge.grounded + x.judge.answers + x.judge.concise) / 3 : null))),
                    unparsedJudgements: graded.filter((x) => !x.judge && !x.noMatch).length,
                    outputTokens: graded.reduce((n, x) => n + x.outputTokens, 0),
                    judgeOutputTokens: graded.reduce((n, x) => n + x.judgeOutputTokens, 0),
                };
                console.log(model);
                console.table(summary);
                results[model] = { summary, graded };
                save();
            }
        }
        console.log("Wrote eval/results.local.json. Labels may be incomplete: other articles can also answer a question.");
    } finally {
        await index.deleteNamespace(namespace).catch(() => {});
        console.log(`Deleted namespace ${namespace}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
