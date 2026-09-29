import { describe, expect, it } from "vitest";
import { MIN_KEEP, STALE_INGEST_MS, planCleanup } from "@/lib/cleanup";

const now = new Date("2026-09-29T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const fresh = ago(STALE_INGEST_MS / 2);

describe("planCleanup", () => {
    it.each([null, undefined])("skips when there is no newest article (%s)", (newestAt) => {
        expect(planCleanup({ total: MIN_KEEP + 50, newestAt, now })).toMatchObject({
            action: "skip",
            reason: "ingest-stale",
        });
    });

    it("treats an article exactly at the stale limit as fresh", () => {
        expect(planCleanup({ total: MIN_KEEP + 1, newestAt: ago(STALE_INGEST_MS), now })).toEqual({
            action: "delete",
            budget: 1,
        });
    });

    it("skips once the newest article is past the stale limit", () => {
        expect(planCleanup({ total: MIN_KEEP + 1, newestAt: ago(STALE_INGEST_MS + 1), now })).toMatchObject({
            action: "skip",
            reason: "ingest-stale",
        });
    });

    it.each([MIN_KEEP, MIN_KEEP - 1, 0])("holds at the floor with %i articles", (total) => {
        expect(planCleanup({ total, newestAt: fresh, now })).toMatchObject({
            action: "skip",
            reason: "at-minimum",
        });
    });

    it("deletes only what is above the floor", () => {
        expect(planCleanup({ total: MIN_KEEP + 1, newestAt: fresh, now })).toEqual({ action: "delete", budget: 1 });
        expect(planCleanup({ total: MIN_KEEP * 3, newestAt: fresh, now })).toEqual({
            action: "delete",
            budget: MIN_KEEP * 2,
        });
    });

    it("stops deleting when ingest is stale, however many articles there are", () => {
        expect(planCleanup({ total: MIN_KEEP * 10, newestAt: ago(STALE_INGEST_MS + 1), now })).toMatchObject({
            action: "skip",
            reason: "ingest-stale",
        });
    });
});
