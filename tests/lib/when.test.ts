import { describe, expect, it } from "vitest";
import { WHEN, isWhen, sinceFor } from "@/lib/when";

const now = new Date("2026-10-04T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("when", () => {
    it("names the four windows", () => {
        expect(WHEN).toEqual({ any: "Any time", week: "Past week", month: "Past month", year: "Past year" });
    });

    it.each(["any", "week", "month", "year"])("accepts %s", (v) => {
        expect(isWhen(v)).toBe(true);
    });

    it.each(["toString", "constructor", "day", "", 7, null, undefined])("rejects %s", (v) => {
        expect(isWhen(v)).toBe(false);
    });

    it("gives no cutoff for any time, and 7, 30 and 365 days back otherwise", () => {
        expect(sinceFor("any", now)).toBeUndefined();
        expect(sinceFor("week", now)?.getTime()).toBe(now.getTime() - 7 * DAY);
        expect(sinceFor("month", now)?.getTime()).toBe(now.getTime() - 30 * DAY);
        expect(sinceFor("year", now)?.getTime()).toBe(now.getTime() - 365 * DAY);
    });
});
