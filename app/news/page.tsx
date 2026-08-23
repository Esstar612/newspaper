"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, GENERAL, LABELS, isCategory } from "@/lib/categories";
import { ArticleCard, type Article } from "@/components/ArticleCard";
import {
    Button,
    EmptyState,
    ErrorBanner,
    Icon,
    PageHeader,
    Skeleton,
    cn,
} from "@/components/ui";

type NewsResponse = {
    articles: Article[];
    nextCursor: string | null;
};

const COUNTRY_CODES: Record<string, string> = {
    "US": "us", "United States": "us",
    "GB": "gb", "United Kingdom": "gb",
    "CA": "ca", "Canada": "ca",
    "AU": "au", "Australia": "au",
    "IN": "in", "India": "in",
    "DE": "de", "Germany": "de",
    "FR": "fr", "France": "fr",
};

const PANEL_ID = "news-results";

function ArticleSkeletons() {
    return (
        <div aria-busy="true" aria-label="Loading articles" className="space-y-8">
            <div className="grid gap-5 overflow-hidden rounded-lg border border-line bg-surface md:grid-cols-2">
                <Skeleton className="aspect-[16/10] rounded-none md:h-full" />
                <div className="space-y-3 p-8">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="overflow-hidden rounded-lg border border-line bg-surface">
                        <Skeleton className="aspect-[16/9] rounded-none" />
                        <div className="space-y-2.5 p-4">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NewsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // The URL is the source of truth for the active tab, so a refresh or a shared
    // link lands on the same category instead of resetting to "general".
    const categoryParam = searchParams.get("category") ?? "";
    const activeCategory = isCategory(categoryParam) ? categoryParam : GENERAL;

    const [articles, setArticles] = useState<Article[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [tempSearchQuery, setTempSearchQuery] = useState("");
    const [searchExpanded, setSearchExpanded] = useState(false);
    const [userCountry, setUserCountry] = useState("us");
    const tabsRef = useRef<HTMLDivElement>(null);
    const limit = 20;
    const isDev = process.env.NODE_ENV === "development";

    useEffect(() => {
        // Only in dev: the country is used solely by the dev-only ingest button, and
        // prompting every visitor for their location to feed it is not a fair trade.
        if (!isDev) return;
        try {
            navigator.geolocation?.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        const response = await fetch(
                            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
                        );
                        const data = await response.json();
                        setUserCountry(COUNTRY_CODES[data.countryCode || "US"] || "us");
                    } catch {
                        setUserCountry("us");
                    }
                },
                () => setUserCountry("us")
            );
        } catch {
            setUserCountry("us");
        }
    }, [isDev]);

    async function ingestNow() {
        try {
            setError("");
            if (!isDev) return;

            let token = sessionStorage.getItem("ADMIN_INGEST_TOKEN") ?? "";
            if (!token) {
                token = window.prompt("Paste ADMIN_INGEST_TOKEN:")?.trim() ?? "";
                if (!token) return;
                sessionStorage.setItem("ADMIN_INGEST_TOKEN", token);
            }

            setLoading(true);
            const res = await fetch("/api/admin/ingest-news", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ limit: 50, country: userCountry }),
            });

            if (!res.ok) throw new Error("Ingest failed");

            await fetchArticles(activeCategory, searchQuery);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ingest failed");
        } finally {
            setLoading(false);
        }
    }

    const fetchArticles = useCallback(
        async (category: string, search: string = "", cursor?: string | null, isLoadMore = false) => {
            if (isLoadMore) setLoadingMore(true);
            else setLoading(true);
            setError("");

            try {
                const url = new URL("/api/news", window.location.origin);
                url.searchParams.set("limit", String(limit));
                if (category && category !== GENERAL) url.searchParams.set("category", category);
                if (search) url.searchParams.set("q", search);
                if (cursor) url.searchParams.set("cursor", cursor);

                const res = await fetch(url.toString(), { cache: "no-store" });
                const data = (await res.json()) as NewsResponse & { error?: string };

                // The route answers 500 with an empty articles array, which the old
                // code flattened into a generic "Failed to load" - surface the reason.
                if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);

                if (isLoadMore) {
                    setArticles((prev) => {
                        const existing = new Set(prev.map((a) => a._id ?? a.url));
                        const incoming = (data.articles ?? []).filter((a) => !existing.has(a._id ?? a.url));
                        return prev.concat(incoming);
                    });
                } else {
                    setArticles(data.articles ?? []);
                }

                setNextCursor(data.nextCursor ?? null);
            } catch (e: unknown) {
                if (!isLoadMore) setArticles([]);
                setError(e instanceof Error ? e.message : "Failed to load news");
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [limit]
    );

    // Refetch whenever the category in the URL changes (including back/forward).
    useEffect(() => {
        fetchArticles(activeCategory, "");
        setSearchQuery("");
        setTempSearchQuery("");
        setSearchExpanded(false);
    }, [activeCategory, fetchArticles]);

    const selectCategory = useCallback(
        (category: string) => {
            const query = category === GENERAL ? "" : `?category=${category}`;
            router.replace(`/news${query}`, { scroll: false });
        },
        [router]
    );

    /** Arrow-key navigation between tabs, per the WAI-ARIA tabs pattern. */
    const handleTabKeyDown = (e: KeyboardEvent) => {
        const offset = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!offset) return;

        e.preventDefault();
        const current = CATEGORIES.indexOf(activeCategory as (typeof CATEGORIES)[number]);
        const next = CATEGORIES[(current + offset + CATEGORIES.length) % CATEGORIES.length];
        selectCategory(next);
        requestAnimationFrame(() => {
            tabsRef.current?.querySelector<HTMLButtonElement>(`[data-category="${next}"]`)?.focus();
        });
    };

    const handleSearchSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = tempSearchQuery.trim();
        setSearchQuery(trimmed);
        if (trimmed) {
            fetchArticles(activeCategory, trimmed);
            setSearchExpanded(false);
        }
    };

    const handleClearSearch = () => {
        setTempSearchQuery("");
        setSearchQuery("");
        setSearchExpanded(false);
        fetchArticles(activeCategory, "");
    };

    const toggleSearch = () => {
        setSearchExpanded(!searchExpanded);
        if (searchExpanded) {
            handleClearSearch();
        }
    };

    // Hierarchy: one lead, then a standard grid, then a compact tail. A page of 20
    // equally-weighted tiles reads as a wall; a front page leads with something.
    const searching = Boolean(searchQuery);
    const [lead, ...rest] = articles;
    const featured = searching ? articles : rest.slice(0, 9);
    const compact = searching ? [] : rest.slice(9);

    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-page px-4 py-8 sm:px-6">
                <PageHeader
                    title="Latest News"
                    subtitle="Top stories from the New York Times and the BBC"
                />

                {/* Category strip + search */}
                <div className="mb-6 flex flex-col gap-3 border-y border-line py-3 sm:flex-row sm:items-center sm:gap-4">
                    {/*
                     * A scrollable row, not a wrapping one. At 390px these tabs used to
                     * collapse into a ragged three-row block with the search button
                     * stranded in the middle of it.
                     */}
                    <div
                        ref={tabsRef}
                        role="tablist"
                        aria-label="News categories"
                        onKeyDown={handleTabKeyDown}
                        className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1"
                    >
                        {CATEGORIES.map((cat) => {
                            const active = activeCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    role="tab"
                                    data-category={cat}
                                    aria-selected={active}
                                    aria-controls={PANEL_ID}
                                    tabIndex={active ? 0 : -1}
                                    onClick={() => selectCategory(cat)}
                                    className={cn(
                                        "shrink-0 rounded px-3 py-1.5 text-base font-semibold transition-colors",
                                        active
                                            ? "bg-accent-strong text-accent-ink"
                                            : "text-ink-muted hover:bg-raised hover:text-ink"
                                    )}
                                >
                                    {LABELS[cat] ?? cat}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {searchExpanded ? (
                            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                                <label htmlFor="news-search" className="sr-only">
                                    Search articles
                                </label>
                                <input
                                    id="news-search"
                                    type="text"
                                    value={tempSearchQuery}
                                    onChange={(e) => setTempSearchQuery(e.target.value)}
                                    placeholder="Search articles…"
                                    autoFocus
                                    className="h-9 w-full min-w-0 rounded border border-line bg-raised px-3 text-base text-ink placeholder:text-ink-subtle sm:w-56"
                                />
                                <Button type="submit" size="sm">
                                    Go
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleSearch}
                                    aria-label="Close search"
                                    className="px-2"
                                >
                                    <Icon name="close" size={16} />
                                </Button>
                            </form>
                        ) : (
                            <Button
                                variant={searchQuery ? "primary" : "secondary"}
                                size="sm"
                                onClick={toggleSearch}
                                aria-label={searchQuery ? `Searching: ${searchQuery}` : "Search articles"}
                                className="px-2.5"
                            >
                                <Icon name="search" size={16} />
                            </Button>
                        )}

                        {isDev && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={ingestNow}
                                disabled={loading}
                                aria-label="Ingest articles (development only)"
                                className="px-2.5"
                            >
                                <Icon name="refresh" size={16} />
                            </Button>
                        )}
                    </div>
                </div>

                {/* Result summary */}
                {!loading && (articles.length > 0 || searching) && (
                    <p className="mb-5 text-sm text-ink-muted">
                        {searching ? (
                            <>
                                <span className="font-semibold text-ink">{articles.length}</span>{" "}
                                {articles.length === 1 ? "result" : "results"} for{" "}
                                <span className="text-ink">&ldquo;{searchQuery}&rdquo;</span> in{" "}
                                {LABELS[activeCategory] ?? activeCategory}
                                <button
                                    onClick={handleClearSearch}
                                    className="ml-3 rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                                >
                                    Clear
                                </button>
                            </>
                        ) : (
                            <>
                                <span className="font-semibold text-ink">
                                    {LABELS[activeCategory] ?? activeCategory}
                                </span>{" "}
                                · {articles.length} articles
                            </>
                        )}
                    </p>
                )}

                <div id={PANEL_ID} role="tabpanel" aria-label={LABELS[activeCategory] ?? activeCategory}>
                    {loading && !loadingMore && <ArticleSkeletons />}

                    {error && !loading && (
                        <ErrorBanner
                            title="Could not load articles"
                            message={error}
                            onRetry={() => fetchArticles(activeCategory, searchQuery)}
                        />
                    )}

                    {!loading && !error && articles.length === 0 && (
                        <EmptyState
                            icon={<Icon name="news" size={40} />}
                            title={
                                searching
                                    ? `No results for “${searchQuery}”`
                                    : `Nothing in ${LABELS[activeCategory] ?? activeCategory} right now`
                            }
                            hint={
                                searching
                                    ? "Try a different search term, or clear the search."
                                    : "This section refreshes daily — try another category."
                            }
                        />
                    )}

                    {!loading && articles.length > 0 && (
                        <div className="space-y-8">
                            {!searching && lead && <ArticleCard article={lead} variant="lead" />}

                            {featured.length > 0 && (
                                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                                    {featured.map((article) => (
                                        <ArticleCard
                                            key={article._id ?? article.url}
                                            article={article}
                                            variant="feature"
                                        />
                                    ))}
                                </div>
                            )}

                            {compact.length > 0 && (
                                <section aria-label="In brief">
                                    <h2 className="mb-1 border-b-2 border-line-strong pb-2 font-serif text-2xl font-semibold text-ink">
                                        In brief
                                    </h2>
                                    {/* Columns keep a long tail readable; a single
                                        column of 20+ headlines just looked unfinished. */}
                                    <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                                        {compact.map((article) => (
                                            <ArticleCard
                                                key={article._id ?? article.url}
                                                article={article}
                                                variant="compact"
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}

                    {articles.length > 0 && nextCursor && (
                        <div className="mt-10 text-center">
                            <Button
                                onClick={() => fetchArticles(activeCategory, searchQuery, nextCursor, true)}
                                disabled={loadingMore}
                                variant="secondary"
                            >
                                {loadingMore ? "Loading…" : "Load more"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function NewsPage() {
    return (
        <Suspense fallback={<div className="min-h-screen" />}>
            <NewsPageInner />
        </Suspense>
    );
}
