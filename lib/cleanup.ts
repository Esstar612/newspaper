// lib/cleanup.ts
/**
 * The decision half of the news cleanup job, kept pure so it can be tested
 * without a database and without touching live articles.
 *
 * The job and the ingest run independently, and Vercel documents cron delivery as
 * best effort with no retry on failure. Deleting purely on an age cutoff meant
 * that if ingest stopped working, cleanup would keep deleting on schedule and the
 * site would be empty within a week, with nothing to say why.
 */

/** Ingest brings in a few hundred articles a day; this is comfortably under one run. */
export const MIN_KEEP = 120;

/** If nothing new has arrived in this long, ingest is broken. Stop deleting. */
export const STALE_INGEST_MS = 48 * 60 * 60 * 1000;

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type CleanupPlan =
    | { action: "skip"; reason: "ingest-stale" | "at-minimum"; message: string }
    | { action: "delete"; budget: number };

export function planCleanup(input: {
    total: number;
    newestAt: Date | null | undefined;
    now: Date;
}): CleanupPlan {
    const { total, newestAt, now } = input;

    // Guard 1: ingest looks broken. Deleting now would erode the archive with
    // nothing replacing it.
    const newestAge = newestAt ? now.getTime() - new Date(newestAt).getTime() : Infinity;

    if (newestAge > STALE_INGEST_MS) {
        return {
            action: "skip",
            reason: "ingest-stale",
            message:
                "No articles ingested recently, so nothing was deleted. Cleanup stays paused " +
                "until ingest recovers, rather than emptying the site on a timer.",
        };
    }

    // Guard 2: never drop below the floor, however old the remainder is.
    const budget = Math.max(0, total - MIN_KEEP);

    if (budget === 0) {
        return {
            action: "skip",
            reason: "at-minimum",
            message: `Holding at the ${MIN_KEEP}-article floor; nothing deleted.`,
        };
    }

    return { action: "delete", budget };
}
