import { describe, expect, it } from "vitest";
import { money, percent, relativeTime, truncate } from "@/lib/format";

describe("truncate", () => {
    it("keeps text within the limit", () => {
        expect(truncate("  short text  ", 20)).toBe("short text");
    });

    it("cuts on a word boundary", () => {
        expect(truncate("the quick brown fox jumps", 18)).toBe("the quick brown…");
    });

    it("hard-cuts when the last space is too early", () => {
        expect(truncate("ab abcdefghijklmnop", 10)).toBe("ab abcdefg…");
    });

    it("returns an empty string for missing text", () => {
        expect(truncate(undefined, 10)).toBe("");
    });
});

describe("relativeTime", () => {
    it.each([undefined, "", "not a date"])("returns an empty string for %s", (iso) => {
        expect(relativeTime(iso)).toBe("");
    });

    it("says just now for under a minute", () => {
        expect(relativeTime(new Date().toISOString())).toBe("just now");
    });
});

describe("money and percent", () => {
    it("falls back to plain text for a malformed currency code", () => {
        expect(money(12, "ABCD")).toBe("12.00 ABCD");
    });

    it("formats a fraction as a percentage", () => {
        expect(percent(0.1234)).toBe("12.34%");
    });
});
