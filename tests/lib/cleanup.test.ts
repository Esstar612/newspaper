import { describe, expect, it } from "vitest";
import { MAX_ARTICLES, MIN_KEEP, RETENTION_DAYS, RETENTION_MS, STALE_INGEST_MS, planCleanup } from "@/lib/cleanup";

const now = new Date("2026-09-29T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const fresh = ago(STALE_INGEST_MS / 2);
const plan = (total: number, newestAt: Date | null | undefined, expired = 0) => planCleanup({ total, expired, newestAt, now });

describe("planCleanup", () => {
    it("keeps a year of news, with a ceiling well above a year at the measured rate", () => {
        expect(RETENTION_MS).toBe(365 * 24 * 60 * 60 * 1000);
        expect(RETENTION_DAYS).toBe(365);
        expect(MAX_ARTICLES).toBe(100_000);
    });

    it.each([null, undefined])("skips when there is no newest article (%s)", (newestAt) => {
        expect(plan(MIN_KEEP + 50, newestAt, 50)).toMatchObject({ action: "skip", reason: "ingest-stale" });
    });

    it("treats an article exactly at the stale limit as fresh", () => {
        expect(plan(MIN_KEEP + 1, ago(STALE_INGEST_MS), 1)).toEqual({ action: "delete", count: 1 });
    });

    it("skips once the newest article is past the stale limit", () => {
        expect(plan(MIN_KEEP + 1, ago(STALE_INGEST_MS + 1), 1)).toMatchObject({ action: "skip", reason: "ingest-stale" });
    });

    it.each([MIN_KEEP, MIN_KEEP - 1, 0])("holds at the floor with %i articles", (total) => {
        expect(plan(total, fresh, total)).toMatchObject({ action: "skip", reason: "at-minimum" });
    });

    it("deletes only what is above the floor", () => {
        expect(plan(MIN_KEEP + 1, fresh, MIN_KEEP + 1)).toEqual({ action: "delete", count: 1 });
        expect(plan(1_000, fresh, 950)).toEqual({ action: "delete", count: 880 });
    });

    it("stops deleting when ingest is stale, however many articles there are", () => {
        expect(plan(MIN_KEEP * 10, ago(STALE_INGEST_MS + 1), MIN_KEEP * 10)).toMatchObject({
            action: "skip",
            reason: "ingest-stale",
        });
        expect(plan(MAX_ARTICLES + 300, ago(STALE_INGEST_MS + 1), 0)).toMatchObject({ action: "skip", reason: "ingest-stale" });
    });

    it.each([
        ["nothing past the window", 400, 0, 0],
        ["the expired articles", 400, 20, 20],
        ["the expired articles at the ceiling", MAX_ARTICLES, 50, 50],
        ["the expired articles when they already cover the overflow", MAX_ARTICLES + 300, 500, 500],
        ["the overflow when nothing has expired", MAX_ARTICLES + 300, 0, 300],
        ["the overflow when it exceeds the expired articles", MAX_ARTICLES + 300, 100, 300],
    ])("deletes %s", (_, total, expired, count) => {
        expect(plan(total, fresh, expired)).toEqual({ action: "delete", count });
    });
});
