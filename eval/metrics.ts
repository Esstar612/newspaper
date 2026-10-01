export const recallAtK = (ranked: string[], gold: string[], k: number) =>
    gold.length ? gold.filter((id) => ranked.slice(0, k).includes(id)).length / gold.length : 0;

export function reciprocalRank(ranked: string[], gold: string[]) {
    const index = ranked.findIndex((id) => gold.includes(id));
    return index === -1 ? 0 : 1 / (index + 1);
}

export function citationPrecision(cited: string[], gold: string[]) {
    if (cited.length === 0) return null;
    return cited.filter((id) => gold.includes(id)).length / cited.length;
}

export function mean(values: Array<number | null>) {
    const present = values.filter((v): v is number => v !== null);
    return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
}

export type JudgeScore = { grounded: number; answers: number; concise: number; refusalCorrect: boolean };

export function parseJudge(text: string): JudgeScore | null {
    const field = (name: string) => text.match(new RegExp(`^\\s*${name}\\s*:\\s*(\\S+)\\s*$`, "im"))?.[1]?.toLowerCase();
    const score = (name: string) => {
        const n = Number(field(name));
        return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
    };
    const grounded = score("grounded");
    const answers = score("answers");
    const concise = score("concise");
    const refusal = field("refusal_correct");
    if (grounded === null || answers === null || concise === null || (refusal !== "yes" && refusal !== "no")) return null;
    return { grounded, answers, concise, refusalCorrect: refusal === "yes" };
}

export function judgePrompt(question: string, answer: string, snippets: Array<{ title: string; description: string }>) {
    const numbered = snippets.map((s, i) => `[${i + 1}] ${s.title}\n${s.description}`).join("\n\n");
    return [
        "You are grading an answer to a news question. The answer was written only from the search results below.",
        "",
        "Search results:",
        numbered,
        "",
        `Question: ${question}`,
        "",
        `Answer: ${answer}`,
        "",
        "Score the answer on its own, from 1 (poor) to 5 (excellent):",
        "- grounded: every claim is supported by the search results",
        "- answers: it answers the question that was asked",
        "- concise: it says what is needed without padding",
        "Then decide refusal_correct: yes if the answer declines exactly when the results do not answer the question, or answers when they do; otherwise no.",
        "",
        "Reply with exactly these four lines and nothing else:",
        "grounded: <1-5>",
        "answers: <1-5>",
        "concise: <1-5>",
        "refusal_correct: <yes|no>",
    ].join("\n");
}

export const coversGold = (cited: string[], gold: string[]) => cited.some((id) => gold.includes(id));

export function answerForJudge(
    answer: { segments: Array<{ text: string; cites: number[] }>; sources: Array<{ n: number; url: string; title?: string }> },
    articles: Array<{ url: string }>
) {
    const position = new Map(articles.map((a, i) => [a.url, i + 1]));
    const snippetNumber = new Map(answer.sources.map((s) => [s.n, position.get(s.url)]));
    return answer.segments.map((s) => s.text + s.cites.map((n) => ` [${snippetNumber.get(n)}]`).join("")).join("");
}
