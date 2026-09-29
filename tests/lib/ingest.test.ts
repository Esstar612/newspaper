import { describe, expect, it } from "vitest";
import { SKIP_WINDOW_MS, shouldSkipIngest } from "@/lib/ingest";

describe("shouldSkipIngest", () => {
    it.each([null, undefined])("runs when there is no newest article (%s)", (newestAt) => {
        expect(shouldSkipIngest(newestAt, new Date("2026-09-29T00:36:15Z"))).toBe(false);
    });

    it("runs the day after a run at the same offset", () => {
        expect(shouldSkipIngest(new Date("2026-09-28T00:36:15.104Z"), new Date("2026-09-29T00:36:15.050Z"))).toBe(false);
    });

    it("runs after the shortest gap Hobby jitter allows", () => {
        expect(shouldSkipIngest(new Date("2026-09-28T00:59:00Z"), new Date("2026-09-29T00:00:00Z"))).toBe(false);
    });

    it("skips an accidental re-run an hour later", () => {
        expect(shouldSkipIngest(new Date("2026-09-29T00:36:15Z"), new Date("2026-09-29T01:36:15Z"))).toBe(true);
    });

    it("skips just inside the window and runs at its edge", () => {
        const now = new Date("2026-09-29T12:00:00Z");
        expect(shouldSkipIngest(new Date(now.getTime() - SKIP_WINDOW_MS + 1), now)).toBe(true);
        expect(shouldSkipIngest(new Date(now.getTime() - SKIP_WINDOW_MS), now)).toBe(false);
    });
});
