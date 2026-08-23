// lib/format.ts
// Shared presentation helpers. Lifted out of app/news/page.tsx so the front page
// and any future article surface format identically.

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
];

export function relativeTime(iso?: string): string {
    if (!iso) return "";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "";

    const diff = then - Date.now();
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

    for (const [unit, ms] of RELATIVE_UNITS) {
        if (Math.abs(diff) >= ms) return formatter.format(Math.round(diff / ms), unit);
    }
    return "just now";
}

/** Cut on a word boundary instead of appending an ellipsis to everything, short text included. */
export function truncate(text: string | undefined, max: number): string {
    if (!text) return "";
    const clean = text.trim();
    if (clean.length <= max) return clean;

    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Inline SVG placeholder for a missing article image.
 *
 * Deliberately not a network asset: the previous fallbacks were /newspaper.jpg
 * (404) and via.placeholder.com (offline), so a broken image fell back to another
 * broken image. Uses currentColor-ish greys that read on either theme.
 */
export const PLACEHOLDER_IMAGE =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225">
            <rect width="400" height="225" fill="#1c2636"/>
            <g fill="none" stroke="#3d4a5f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="164" y="94" width="72" height="52" rx="4"/>
                <path d="M164 132l18-18 14 14 11-11 29 29"/>
            </g>
        </svg>`.replace(/\s+/g, " ")
    );

export function money(value: number, currency: string): string {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        // Intl throws on codes it does not recognise; the raw number still beats nothing.
        return `${value.toFixed(2)} ${currency}`;
    }
}

export function compactNumber(value: number): string {
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function percent(fraction: number): string {
    return `${(fraction * 100).toFixed(2)}%`;
}
