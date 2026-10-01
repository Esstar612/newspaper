import { createHash } from "node:crypto";

export const LIMITS = { ipPerHour: 10, sitePerDay: 200 };

type Increment = (key: string, expiresAt: Date) => Promise<number>;
type Slot = { ok: true } | { ok: false; scope: "ip" | "day"; resetAt: Date };

export function buckets(ip: string | null, now: Date) {
    const hour = now.toISOString().slice(0, 13);
    const date = now.toISOString().slice(0, 10);
    const id = ip ? createHash("sha256").update(ip).digest("hex") : "unknown";
    return {
        ip: { key: `ip:${id}:${hour}`, expiresAt: new Date(Date.parse(`${hour}:00:00.000Z`) + 3_600_000) },
        day: { key: `day:${date}`, expiresAt: new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000) },
    };
}

export const incrementUpdate = (expiresAt: Date) => ({ $inc: { n: 1 }, $setOnInsert: { expiresAt } });

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

async function count(increment: Increment, key: string, expiresAt: Date) {
    try {
        return await increment(key, expiresAt);
    } catch (e) {
        if (!isDuplicateKey(e)) throw e;
        return increment(key, expiresAt);
    }
}

export async function takeSlot(increment: Increment, ip: string | null, now: Date): Promise<Slot> {
    const b = buckets(ip, now);
    if ((await count(increment, b.ip.key, b.ip.expiresAt)) > LIMITS.ipPerHour) {
        return { ok: false, scope: "ip", resetAt: b.ip.expiresAt };
    }
    if ((await count(increment, b.day.key, b.day.expiresAt)) > LIMITS.sitePerDay) {
        return { ok: false, scope: "day", resetAt: b.day.expiresAt };
    }
    return { ok: true };
}
