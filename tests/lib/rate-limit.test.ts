import { describe, expect, it } from "vitest";
import { LIMITS, buckets, incrementUpdate, takeSlot } from "@/lib/rate-limit";

const NOW = new Date("2026-09-30T14:25:00Z");

function store() {
    const docs = new Map<string, { n: number; expiresAt: Date }>();
    const calls: string[] = [];
    const increment = async (key: string, expiresAt: Date) => {
        calls.push(key);
        const doc = docs.get(key) ?? { n: 0, expiresAt };
        doc.n += 1;
        docs.set(key, doc);
        return doc.n;
    };
    return { docs, calls, increment };
}

describe("buckets", () => {
    it("keys the IP by hash and UTC hour and the site by UTC date", () => {
        const b = buckets("203.0.113.9", NOW);
        expect(b.ip.key).toMatch(/^ip:[0-9a-f]{64}:2026-09-30T14$/);
        expect(b.ip.key).not.toContain("203.0.113.9");
        expect(b.ip.expiresAt).toEqual(new Date("2026-09-30T15:00:00Z"));
        expect(b.day).toEqual({ key: "day:2026-09-30", expiresAt: new Date("2026-10-01T00:00:00Z") });
    });

    it("uses unknown for a missing IP and still resets hourly", () => {
        expect(buckets(null, NOW).ip.key).toBe("ip:unknown:2026-09-30T14");
    });
});

describe("incrementUpdate", () => {
    it("increments and sets the expiry only on insert", () => {
        const at = new Date("2026-09-30T15:00:00Z");
        expect(incrementUpdate(at)).toEqual({ $inc: { n: 1 }, $setOnInsert: { expiresAt: at } });
    });
});

describe("takeSlot", () => {
    it("allows 10 per IP per hour", async () => {
        const s = store();
        for (let i = 0; i < LIMITS.ipPerHour; i++) expect(await takeSlot(s.increment, "203.0.113.9", NOW)).toEqual({ ok: true });
        expect(await takeSlot(s.increment, "203.0.113.9", NOW)).toEqual({
            ok: false,
            scope: "ip",
            resetAt: new Date("2026-09-30T15:00:00Z"),
        });
    });

    it("stops counting toward the site once an IP is limited", async () => {
        const s = store();
        for (let i = 0; i < 50; i++) await takeSlot(s.increment, "203.0.113.9", NOW);
        expect(s.docs.get("day:2026-09-30")?.n).toBe(LIMITS.ipPerHour);
    });

    it("allows 200 a day across all IPs", async () => {
        const s = store();
        for (let i = 0; i < LIMITS.sitePerDay; i++) {
            expect(await takeSlot(s.increment, `198.51.100.${i % 250}-${i}`, NOW)).toEqual({ ok: true });
        }
        expect(await takeSlot(s.increment, "192.0.2.1", NOW)).toEqual({
            ok: false,
            scope: "day",
            resetAt: new Date("2026-10-01T00:00:00Z"),
        });
    });

    it("retries once when two first requests race on a new bucket", async () => {
        const s = store();
        let raced = false;
        const increment = async (key: string, expiresAt: Date) => {
            if (!raced) {
                raced = true;
                throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
            }
            return s.increment(key, expiresAt);
        };
        expect(await takeSlot(increment, "203.0.113.9", NOW)).toEqual({ ok: true });
    });
});
