"use client";

import { PLACEHOLDER_IMAGE } from "@/lib/format";
import { cn } from "@/components/ui";

/**
 * Client island purely because of `onError`. Keeping it isolated lets ArticleCard
 * — and therefore the front page — stay a Server Component.
 *
 * The runtime fallback matters: article image URLs from a feed do 404, and the
 * previous fallbacks were themselves dead (/newspaper.jpg 404s, via.placeholder.com
 * is offline), so a broken image fell back to another broken image.
 */
export function ArticleThumb({
    src,
    className,
    sizes,
}: {
    src?: string;
    className?: string;
    sizes?: string;
}) {
    return (
        <div className={cn("overflow-hidden bg-raised", className)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src || PLACEHOLDER_IMAGE}
                alt=""
                loading="lazy"
                sizes={sizes}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                onError={(e) => {
                    const img = e.currentTarget;
                    // Guard against a loop if the placeholder itself ever fails.
                    if (img.src !== PLACEHOLDER_IMAGE) img.src = PLACEHOLDER_IMAGE;
                }}
            />
        </div>
    );
}
