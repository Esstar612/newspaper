import { describe, expect, it } from "vitest";
import { answerForJudge, citationPrecision, coversGold, judgePrompt, mean, parseJudge, recallAtK, reciprocalRank } from "@/eval/metrics";

describe("retrieval metrics", () => {
    it("counts the share of gold articles in the top k", () => {
        expect(recallAtK(["a", "b", "c", "d", "e", "f"], ["b", "f"], 5)).toBe(0.5);
        expect(recallAtK(["a", "b"], ["a", "b"], 5)).toBe(1);
        expect(recallAtK(["x"], ["a"], 5)).toBe(0);
    });

    it("scores the first gold hit by its rank", () => {
        expect(reciprocalRank(["a", "b", "c"], ["c", "b"])).toBe(0.5);
        expect(reciprocalRank(["a", "b"], ["a"])).toBe(1);
        expect(reciprocalRank(["a", "b"], ["z"])).toBe(0);
    });

    it("averages, ignoring nulls", () => {
        expect(mean([1, 0.5, null, 0])).toBe(0.5);
        expect(mean([null])).toBeNull();
    });
});

describe("citationPrecision", () => {
    it("is the share of cited articles that are gold", () => {
        expect(citationPrecision(["a", "b", "c", "d"], ["a", "c"])).toBe(0.5);
    });

    it("is null when nothing was cited", () => {
        expect(citationPrecision([], ["a"])).toBeNull();
    });
});

describe("parseJudge", () => {
    it("reads the four scored lines", () => {
        expect(parseJudge("grounded: 5\nanswers: 4\nconcise: 3\nrefusal_correct: yes")).toEqual({
            grounded: 5,
            answers: 4,
            concise: 3,
            refusalCorrect: true,
        });
    });

    it("tolerates spacing and case", () => {
        expect(parseJudge("Grounded:4\n ANSWERS : 2\nconcise: 5\nRefusal_Correct: No ")).toEqual({
            grounded: 4,
            answers: 2,
            concise: 5,
            refusalCorrect: false,
        });
    });

    it.each([
        "grounded: 6\nanswers: 4\nconcise: 3\nrefusal_correct: yes",
        "grounded: 4\nanswers: 4\nrefusal_correct: yes",
        "I think it is good.",
    ])("rejects malformed output %#", (text) => {
        expect(parseJudge(text)).toBeNull();
    });
});

describe("judgePrompt", () => {
    const prompt = judgePrompt("What did the bank do?", "It held rates [1].", [
        { title: "Bank holds rates", description: "Rates stayed at 4%." },
        { title: "Jobs report", description: "Hiring slowed." },
    ]);

    it("shows the judge the same snippets, the question and the answer", () => {
        expect(prompt).toContain("[1] Bank holds rates\nRates stayed at 4%.");
        expect(prompt).toContain("[2] Jobs report\nHiring slowed.");
        expect(prompt).toContain("What did the bank do?");
        expect(prompt).toContain("It held rates [1].");
    });

    it("asks for the four lines parseJudge reads", () => {
        for (const line of ["grounded:", "answers:", "concise:", "refusal_correct:"]) expect(prompt).toContain(line);
    });

    it("never names a model", () => {
        expect(prompt).not.toMatch(/claude|sonnet|opus|haiku|anthropic/i);
    });
});

describe("coversGold", () => {
    it("is true when any cited article is gold", () => {
        expect(coversGold(["x", "a"], ["a", "b"])).toBe(true);
        expect(coversGold(["x"], ["a"])).toBe(false);
        expect(coversGold([], ["a"])).toBe(false);
    });
});

describe("answerForJudge", () => {
    const articles = [
        { id: "A", url: "https://example.com/a" },
        { id: "B", url: "https://example.com/b" },
        { id: "C", url: "https://example.com/c" },
    ];

    it("numbers citations by the snippet order the judge sees, not first-cited order", () => {
        const text = answerForJudge(
            {
                segments: [
                    { text: "C says so", cites: [1] },
                    { text: " and A agrees", cites: [2] },
                ],
                sources: [
                    { n: 1, url: "https://example.com/c", title: "C" },
                    { n: 2, url: "https://example.com/a", title: "A" },
                ],
            },
            articles
        );
        expect(text).toBe("C says so [3] and A agrees [1]");
    });
});
