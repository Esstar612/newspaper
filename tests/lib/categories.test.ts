import { describe, expect, it } from "vitest";
import { CATEGORIES, GENERAL, LABELS, TAGGABLE_CATEGORIES, isCategory } from "@/lib/categories";

describe("categories", () => {
    it("stores every category except general as a tag", () => {
        expect(TAGGABLE_CATEGORIES).not.toContain(GENERAL);
        expect(TAGGABLE_CATEGORIES).toHaveLength(6);
    });

    it.each(CATEGORIES)("accepts and labels %s", (c) => {
        expect(isCategory(c)).toBe(true);
        expect(LABELS[c]).toBeTruthy();
    });

    it.each(["politics", "", "Business"])("rejects %j", (v) => {
        expect(isCategory(v)).toBe(false);
    });
});
