export const WHEN = { any: "Any time", week: "Past week", month: "Past month", year: "Past year" } as const;

export type When = keyof typeof WHEN;

const DAYS: Record<Exclude<When, "any">, number> = { week: 7, month: 30, year: 365 };

export const isWhen = (v: unknown): v is When => typeof v === "string" && Object.hasOwn(WHEN, v);

export const sinceFor = (when: When, now: Date) =>
    when === "any" ? undefined : new Date(now.getTime() - DAYS[when] * 24 * 60 * 60 * 1000);
