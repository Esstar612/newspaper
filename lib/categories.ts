// lib/categories.ts
// Shared between the news UI and the ingest pipeline.
// Kept free of server-only imports so client components can use it.

/** "general" is not a stored tag - it means "no category filter". */
export const GENERAL = "general";

/** Tabs shown on /news, in display order. */
export const CATEGORIES = [
    GENERAL,
    "world",
    "business",
    "technology",
    "science",
    "health",
    "sports",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Categories that are actually stored as tags on an article. */
export const TAGGABLE_CATEGORIES = CATEGORIES.filter((c) => c !== GENERAL);

export const isCategory = (v: string): v is Category =>
    (CATEGORIES as readonly string[]).includes(v);

export const LABELS: Record<string, string> = {
    general: "Top Stories",
    world: "World",
    business: "Business",
    technology: "Technology",
    science: "Science",
    health: "Health",
    sports: "Sports",
};
