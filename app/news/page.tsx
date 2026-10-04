"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, GENERAL, LABELS, isCategory } from "@/lib/categories";
import { ArticleCard, type Article } from "@/components/ArticleCard";
import { AskBox } from "@/components/AskBox";
import { AnswerCard } from "@/components/AnswerCard";
import { relativeTime, utf8Bytes } from "@/lib/format";
import { useAsk, type AskState } from "@/lib/useAsk";
import type { When } from "@/lib/when";
import { Button, EmptyState, ErrorBanner, Icon, Skeleton, cn } from "@/components/ui";

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

const askable = (query: string) => {
    const size = utf8Bytes(query);
    return size >= 3 && size <= 300;
};

type LoadOptions = { cursor?: string | null; more?: boolean; fallback?: boolean; when?: When };

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
    const [searchWhen, setSearchWhen] = useState<When>("any");
    const [when, setWhen] = useState<When>("any");
    const { state: askState, ask, followUp, reset: resetAsk } = useAsk();
    const [showRelated, setShowRelated] = useState(false);
    const [userCountry, setUserCountry] = useState("us");
    const tabsRef = useRef<HTMLDivElement>(null);
    const latestLoad = useRef(0);
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

            await fetchArticles(activeCategory, searchQuery, { fallback: askable(searchQuery), when: searchWhen });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ingest failed");
            setLoading(false);
        }
    }

    const fetchArticles = useCallback(
        async (
            category: string,
            search: string = "",
            { cursor, more: isLoadMore = false, fallback = false, when = "any" }: LoadOptions = {}
        ) => {
            const run = isLoadMore ? latestLoad.current : ++latestLoad.current;
            const current = () => run === latestLoad.current;
            if (isLoadMore) setLoadingMore(true);
            else {
                setLoading(true);
                setLoadingMore(false);
            }
            setError("");

            const load = async (q: string) => {
                const url = new URL("/api/news", window.location.origin);
                url.searchParams.set("limit", String(limit));
                if (category && category !== GENERAL) url.searchParams.set("category", category);
                if (q) url.searchParams.set("q", q);
                if (q && when !== "any") url.searchParams.set("when", when);
                if (cursor) url.searchParams.set("cursor", cursor);

                const res = await fetch(url.toString(), { cache: "no-store" });
                const data = (await res.json()) as NewsResponse & { error?: string };

                // The route answers 500 with an empty articles array, which the old
                // code flattened into a generic "Failed to load" - surface the reason.
                if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
                return data;
            };

            try {
                let data = await load(search);
                const empty = fallback && !isLoadMore && search && !data.articles?.length;
                if (empty && current()) data = await load("");
                if (!current()) return;
                if (empty) setSearchQuery("");

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
                if (!current()) return;
                if (!isLoadMore) setArticles([]);
                setError(e instanceof Error ? e.message : "Failed to load news");
            } finally {
                if (current()) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        },
        [limit]
    );

    // Refetch whenever the category in the URL changes (including back/forward).
    useEffect(() => {
        fetchArticles(activeCategory, "");
        setSearchQuery("");
        setShowRelated(false);
        resetAsk();
    }, [activeCategory, fetchArticles, resetAsk]);

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

    const clearFilter = () => {
        setSearchQuery("");
        fetchArticles(activeCategory, "");
    };

    const afterAsk = (result: AskState | null, query: string) => {
        if (!result) return;
        if (result.status === "done" && result.answer.related.length > 0) {
            setShowRelated(true);
            return;
        }
        const window = result.status === "idle" ? "any" : result.thread.when;
        setSearchQuery(query);
        setSearchWhen(window);
        fetchArticles(activeCategory, query, { fallback: true, when: window });
    };

    const runAsk = async (query: string, window: When) => afterAsk(await ask(query, activeCategory, window), query);

    const handleBoxSubmit = (query: string) => {
        setShowRelated(false);
        if (askable(query)) {
            if (searchQuery) clearFilter();
            runAsk(query, when);
            return;
        }
        resetAsk();
        setSearchQuery(query);
        setSearchWhen(when);
        fetchArticles(activeCategory, query, { when });
    };

    const showAll = () => {
        setShowRelated(false);
        if (searchQuery) clearFilter();
    };

    const closeAnswer = () => {
        resetAsk();
        showAll();
    };

    // Hierarchy: one lead, then a standard grid, then a compact tail. A page of 20
    // equally-weighted tiles reads as a wall; a front page leads with something.
    const searching = Boolean(searchQuery);
    const [lead, ...rest] = articles;
    const featured = searching ? articles : rest.slice(0, 9);
    const compact = searching ? [] : rest.slice(9);
    const sectionLabel = LABELS[activeCategory] ?? activeCategory;
    const firstTurn = askState.status === "idle" ? undefined : askState.thread.turns[0];
    const related = showRelated && firstTurn ? firstTurn.answer.related : [];
    const relatedMode = related.length > 0;
    const newest = articles.reduce<string | undefined>(
        (latest, a) => (a.publishedAt && (!latest || a.publishedAt > latest) ? a.publishedAt : latest),
        undefined
    );

    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-page px-4 py-8 sm:px-6">
                <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
                    <div>
                        <h1 className="font-serif text-4xl font-semibold text-ink">Latest News</h1>
                        <p className="mt-2 text-lg text-ink-muted">Top stories from the New York Times and the BBC</p>
                    </div>
                    <AskBox
                        key={activeCategory}
                        category={activeCategory}
                        when={when}
                        onWhenChange={setWhen}
                        onSubmit={handleBoxSubmit}
                    />
                </div>

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
                        {!searching && !relatedMode && !loading && articles.length > 0 && (
                            <span className="whitespace-nowrap text-sm text-ink-muted">
                                {articles.length} {articles.length === 1 ? "article" : "articles"}
                                {newest && ` · Newest story ${relativeTime(newest)}`}
                            </span>
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

                {askState.status !== "idle" && (
                    <AnswerCard
                        state={askState}
                        category={activeCategory}
                        onRetry={() =>
                            askState.thread.turns.length
                                ? followUp(askState.question, activeCategory)
                                : runAsk(askState.question, askState.thread.when)
                        }
                        onClose={closeAnswer}
                        onFollowUp={(question) => followUp(question, activeCategory)}
                    />
                )}

                {(relatedMode || (searching && !loading)) && (
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <p className="text-sm font-semibold text-ink-muted">
                            {relatedMode
                                ? `Stories related to your question · ${related.length}`
                                : `Stories matching your question · ${articles.length}`}
                        </p>
                        <Button variant="ghost" size="sm" onClick={showAll}>
                            Show all {sectionLabel}
                        </Button>
                    </div>
                )}

                <div id={PANEL_ID} role="tabpanel" aria-label={sectionLabel}>
                    {relatedMode ? (
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                            {related.map((article) => (
                                <ArticleCard key={article._id ?? article.url} article={article} variant="feature" />
                            ))}
                        </div>
                    ) : (
                        <>
                            {loading && !loadingMore && <ArticleSkeletons />}

                            {error && !loading && (
                                <ErrorBanner
                                    title="Could not load articles"
                                    message={error}
                                    onRetry={() =>
                                        fetchArticles(activeCategory, searchQuery, { fallback: askable(searchQuery), when: searchWhen })
                                    }
                                />
                            )}

                            {!loading && !error && articles.length === 0 && (
                                <EmptyState
                                    icon={<Icon name="news" size={40} />}
                                    title={
                                        searching
                                            ? `No results for “${searchQuery}”`
                                            : `Nothing in ${sectionLabel} right now`
                                    }
                                    hint={
                                        searching
                                            ? `Try different words, or show all of ${sectionLabel}.`
                                            : "This section refreshes daily. Try another category."
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

                            {!loading && articles.length > 0 && nextCursor && (
                                <div className="mt-10 text-center">
                                    <Button
                                        onClick={() =>
                                            fetchArticles(activeCategory, searchQuery, { cursor: nextCursor, more: true, when: searchWhen })
                                        }
                                        disabled={loadingMore}
                                        variant="secondary"
                                    >
                                        {loadingMore ? "Loading…" : "Load more"}
                                    </Button>
                                </div>
                            )}
                        </>
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
