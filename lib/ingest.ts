export const SKIP_WINDOW_MS = 12 * 60 * 60 * 1000;

export function shouldSkipIngest(newestAt: Date | null | undefined, now: Date): boolean {
    return !!newestAt && now.getTime() - newestAt.getTime() < SKIP_WINDOW_MS;
}
