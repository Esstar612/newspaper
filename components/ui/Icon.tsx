// components/ui/Icon.tsx
import type { SVGProps } from "react";

/*
 * Replaces 35 emoji used as icons. Beyond looking low-fidelity at display sizes,
 * emoji were announced by screen readers as their Unicode names ("magnifying glass
 * tilted left") and were baked into button labels — /weather's search button swapped
 * its entire label for a bare hourglass while loading, losing its accessible name.
 *
 * Icons here are decorative (aria-hidden); the accessible name belongs on the
 * control that wraps them.
 */
const ICONS = {
    search: ["M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z", "M16 16l5 5"],
    close: ["M6 6l12 12", "M18 6 6 18"],
    location: [
        "M12 21s7-6.4 7-11.2A7 7 0 1 0 5 9.8C5 14.6 12 21 12 21Z",
        "M12 8.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z",
    ],
    refresh: ["M20.5 12a8.5 8.5 0 1 1-2.6-6.1", "M20.5 3.5v5h-5"],
    chevronRight: ["M9.5 5.5 16 12l-6.5 6.5"],
    chevronDown: ["M5.5 9.5 12 16l6.5-6.5"],
    arrowUp: ["M12 19.5v-15", "M5.5 11 12 4.5 18.5 11"],
    arrowDown: ["M12 4.5v15", "M5.5 13 12 19.5 18.5 13"],
    alert: [
        "M10.3 4 2.7 17.2A2 2 0 0 0 4.4 20.2h15.2a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0Z",
        "M12 9.5v4",
        "M12 16.5v.01",
    ],
    news: [
        "M4 5.5h11v13H4Z",
        "M15 9.5h5v7a2 2 0 0 1-4 0V9.5",
        "M7 9.5h5",
        "M7 12.5h5",
        "M7 15.5h5",
    ],
    chart: ["M4 19.5h16", "M7.5 16.5v-6", "M12 16.5v-10", "M16.5 16.5v-4"],
    cloud: ["M7.5 18.5a4.25 4.25 0 0 1 .6-8.45 5.5 5.5 0 0 1 10.55 1.6 3.5 3.5 0 0 1-.65 6.85Z"],
    globe: [
        "M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6Z",
        "M3.4 12h17.2",
        "M12 3.2c2.4 2.4 3.6 5.4 3.6 8.8S14.4 18.4 12 20.8c-2.4-2.4-3.6-5.4-3.6-8.8S9.6 5.6 12 3.2Z",
    ],
    sun: [
        "M12 7.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Z",
        "M12 2.5v2",
        "M12 19.5v2",
        "M4.4 4.4l1.4 1.4",
        "M18.2 18.2l1.4 1.4",
        "M2.5 12h2",
        "M19.5 12h2",
        "M4.4 19.6l1.4-1.4",
        "M18.2 5.8l1.4-1.4",
    ],
    moon: ["M20 14.2A8.2 8.2 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2Z"],
    image: ["M3.5 5.5h17v13h-17Z", "M3.5 16l4.5-4.5 3.5 3.5 3-3 6 6"],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
    name,
    size = 18,
    ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            {...props}
        >
            {ICONS[name].map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}
