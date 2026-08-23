"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, cn } from "@/components/ui";

type Props = {
    userCountry?: string;
    showLocation?: boolean;
};

const NAV = [
    { href: "/news", label: "News" },
    { href: "/stocks", label: "Stocks" },
    { href: "/weather", label: "Weather" },
];

export default function Header({ userCountry, showLocation = false }: Props) {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-50 border-b border-line bg-surface/95 backdrop-blur">
            {/*
             * The old header was a single non-wrapping flex row, so at 390px the
             * "Weather" link was clipped off the right edge. The nav is now its own
             * scrollable row that drops below the wordmark on narrow screens.
             */}
            <div className="mx-auto flex max-w-page flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-8 sm:px-6 sm:py-4">
                <div className="flex items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-3 no-underline">
                        <span
                            aria-hidden="true"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded bg-accent-strong text-accent-ink"
                        >
                            <Icon name="news" size={20} />
                        </span>
                        <span className="font-serif text-xl font-semibold tracking-tight text-ink">
                            The Newspaper
                        </span>
                    </Link>

                    {showLocation && userCountry ? (
                        <span className="flex items-center gap-1.5 text-sm text-ink-muted sm:hidden">
                            <Icon name="location" size={15} />
                            <span className="font-semibold uppercase">{userCountry}</span>
                        </span>
                    ) : null}
                </div>

                <nav
                    aria-label="Sections"
                    className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1"
                >
                    {NAV.map(({ href, label }) => {
                        const active = pathname === href;
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "shrink-0 rounded px-3 py-1.5 text-base font-semibold no-underline transition-colors",
                                    active
                                        ? "bg-accent-strong text-accent-ink"
                                        : "text-ink-muted hover:bg-raised hover:text-ink"
                                )}
                            >
                                {label}
                            </Link>
                        );
                    })}
                </nav>

                {showLocation && userCountry ? (
                    <span className="ml-auto hidden items-center gap-1.5 text-sm text-ink-muted sm:flex">
                        <Icon name="location" size={15} />
                        <span className="font-semibold uppercase">{userCountry}</span>
                    </span>
                ) : null}
            </div>
        </header>
    );
}
