"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORIES, GENERAL, LABELS, isCategory } from "@/lib/categories";

type Article = {
    _id?: string;
    title: string;
    description?: string;
    url: string;
    imageUrl?: string;
    source: string;
    publishedAt?: string;
    tags?: string[];
};

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

/** Inline SVG, so a missing image never depends on a third-party host being alive. */
const PLACEHOLDER_IMAGE =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
            <rect width="400" height="200" fill="#0f172a"/>
            <text x="200" y="104" fill="#334155" font-family="system-ui,sans-serif"
                  font-size="48" text-anchor="middle">&#9632;</text>
        </svg>`.replace(/\s+/g, " ")
    );

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
];

function relativeTime(iso?: string): string {
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

/** Cut on a word boundary instead of appending "..." to everything, short text included. */
function truncate(text: string | undefined, max: number): string {
    if (!text) return "";
    const clean = text.trim();
    if (clean.length <= max) return clean;

    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(" ");
    return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}\u2026`;
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


    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#0f172a" }}>

            {/* Page Header */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 1.5rem 1.5rem" }}>
                <h1 style={{ fontSize: "32px", fontWeight: 700, color: "white", margin: "0 0 0.5rem 0" }}>
                    Latest News
                </h1>
                <p style={{ fontSize: "16px", color: "#94a3b8", margin: 0 }}>
                    Stay informed with top stories from around the world
                </p>
            </div>

            {/* Control Bar */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 1.5rem 2rem" }}>
                <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "1rem", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", justifyContent: "space-between" }}>
                    {/* Categories */}
                    <div
                        ref={tabsRef}
                        role="tablist"
                        aria-label="News categories"
                        onKeyDown={handleTabKeyDown}
                        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: 1 }}
                    >
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat}
                                role="tab"
                                data-category={cat}
                                aria-selected={activeCategory === cat}
                                tabIndex={activeCategory === cat ? 0 : -1}
                                onClick={() => selectCategory(cat)}
                                style={{
                                    backgroundColor: activeCategory === cat ? "#3b82f6" : "transparent",
                                    color: activeCategory === cat ? "white" : "#94a3b8",
                                    border: "none",
                                    outlineOffset: "2px",
                                    cursor: "pointer",
                                    padding: "8px 16px",
                                    borderRadius: "8px",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    transition: "all 0.2s",
                                }}
                                onMouseOver={(e) => {
                                    if (activeCategory !== cat) {
                                        e.currentTarget.style.backgroundColor = "#334155";
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (activeCategory !== cat) {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                    }
                                }}
                            >
                                {LABELS[cat] ?? cat}
                            </button>
                        ))}
                    </div>

                    {/* Search + Dev Controls */}
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {searchExpanded ? (
                            <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <input
                                    type="text"
                                    value={tempSearchQuery}
                                    onChange={(e) => setTempSearchQuery(e.target.value)}
                                    placeholder="Search..."
                                    autoFocus
                                    style={{
                                        width: "250px",
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        backgroundColor: "#0f172a",
                                        color: "white",
                                        fontSize: "14px",
                                        outline: "none",
                                    }}
                                />
                                <button
                                    type="submit"
                                    style={{
                                        backgroundColor: "#3b82f6",
                                        color: "white",
                                        border: "none",
                                        padding: "8px 16px",
                                        borderRadius: "8px",
                                        cursor: "pointer",
                                        fontSize: "14px",
                                        fontWeight: 600,
                                    }}
                                >
                                    Go
                                </button>
                                <button
                                    type="button"
                                    onClick={toggleSearch}
                                    style={{
                                        backgroundColor: "transparent",
                                        color: "#94a3b8",
                                        border: "none",
                                        padding: "8px",
                                        cursor: "pointer",
                                        fontSize: "16px",
                                    }}
                                >
                                    ✕
                                </button>
                            </form>
                        ) : (
                            <button
                                onClick={toggleSearch}
                                style={{
                                    backgroundColor: searchQuery ? "#3b82f6" : "#334155",
                                    color: "white",
                                    border: "none",
                                    width: "36px",
                                    height: "36px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    fontSize: "16px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.2s",
                                }}
                                title={searchQuery ? `Searching: ${searchQuery}` : "Search"}
                            >
                                🔍
                            </button>
                        )}

                        {isDev && (
                            <button
                                onClick={ingestNow}
                                disabled={loading}
                                style={{
                                    backgroundColor: "#10b981",
                                    color: "white",
                                    border: "none",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    cursor: loading ? "not-allowed" : "pointer",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    opacity: loading ? 0.5 : 1,
                                }}
                            >
                                📰
                            </button>
                        )}
                    </div>
                </div>

                {/* Status */}
                {(searchQuery || articles.length > 0) && (
                    <div style={{ marginTop: "1rem", fontSize: "14px", color: "#64748b" }}>
                        {searchQuery ? (
                            <>
                                <span style={{ color: "white", fontWeight: 600 }}>{articles.length}</span> results for &quot;{searchQuery}&quot; in {LABELS[activeCategory] ?? activeCategory}
                                <button
                                    onClick={handleClearSearch}
                                    style={{
                                        marginLeft: "12px",
                                        backgroundColor: "transparent",
                                        color: "#64748b",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        padding: "4px 12px",
                                        borderRadius: "6px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        fontWeight: 600,
                                    }}
                                >
                                    Clear
                                </button>
                            </>
                        ) : (
                            <>
                                <span style={{ color: "white", fontWeight: 600 }}>{LABELS[activeCategory] ?? activeCategory}</span>
                                {articles.length > 0 && ` • ${articles.length} articles`}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Content */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 1.5rem 3rem" }}>
                {/* Skeletons mirror the real card layout, so the grid does not jump on load. */}
                {loading && !loadingMore && (
                    <div
                        aria-busy="true"
                        aria-label="Loading articles"
                        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}
                    >
                        {Array.from({ length: 6 }, (_, i) => (
                            <div
                                key={i}
                                style={{
                                    backgroundColor: "#1e293b",
                                    borderRadius: "12px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    overflow: "hidden",
                                }}
                            >
                                <div style={{ height: "200px", backgroundColor: "#243044" }} />
                                <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "10px" }}>
                                    <div style={{ height: "10px", width: "35%", borderRadius: "4px", backgroundColor: "#243044" }} />
                                    <div style={{ height: "14px", width: "92%", borderRadius: "4px", backgroundColor: "#243044" }} />
                                    <div style={{ height: "14px", width: "70%", borderRadius: "4px", backgroundColor: "#243044" }} />
                                    <div style={{ height: "10px", width: "100%", borderRadius: "4px", backgroundColor: "#1c2739" }} />
                                    <div style={{ height: "10px", width: "80%", borderRadius: "4px", backgroundColor: "#1c2739" }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div
                        role="alert"
                        style={{ padding: "20px", margin: "0 auto 20px", maxWidth: "600px", backgroundColor: "#991b1b20", color: "#fca5a5", borderRadius: "12px", textAlign: "center", border: "1px solid #991b1b40" }}
                    >
                        <div style={{ fontWeight: 600, marginBottom: "6px" }}>Could not load articles</div>
                        <div style={{ fontSize: "14px", marginBottom: "14px" }}>{error}</div>
                        <button
                            onClick={() => fetchArticles(activeCategory, searchQuery)}
                            style={{
                                backgroundColor: "transparent",
                                color: "#fca5a5",
                                border: "1px solid #991b1b60",
                                padding: "6px 16px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                fontSize: "13px",
                                fontWeight: 600,
                            }}
                        >
                            Try again
                        </button>
                    </div>
                )}

                <div style={{ display: loading && !loadingMore ? "none" : "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
                    {articles.map((article) => (
                        <article
                            key={article._id ?? article.url}
                            style={{
                                backgroundColor: "#1e293b",
                                borderRadius: "12px",
                                border: "1px solid rgba(255,255,255,0.1)",
                                overflow: "hidden",
                                display: "flex",
                                flexDirection: "column",
                                transition: "all 0.2s",
                                cursor: "pointer",
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = "translateY(-4px)";
                                e.currentTarget.style.borderColor = "#3b82f6";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                            }}
                        >
                            <div style={{ width: "100%", height: "200px", overflow: "hidden", backgroundColor: "#0f172a" }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={article.imageUrl || PLACEHOLDER_IMAGE}
                                    alt=""
                                    loading="lazy"
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    onError={(e) => {
                                        const img = e.currentTarget;
                                        // Guard against a loop if the placeholder itself ever fails.
                                        if (img.src !== PLACEHOLDER_IMAGE) img.src = PLACEHOLDER_IMAGE;
                                    }}
                                />
                            </div>
                            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", flex: 1 }}>
                                <div style={{ fontSize: "11px", color: "#3b82f6", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                    <span>{article.source}</span>
                                    {/* `tags?.length &&` renders a literal 0 when tags is empty. */}
                                    {article.tags && article.tags.length > 0 ? (
                                        <span style={{ color: "#64748b" }}>• {LABELS[article.tags[0]] ?? article.tags[0]}</span>
                                    ) : null}
                                    {relativeTime(article.publishedAt) ? (
                                        <span style={{ color: "#64748b", textTransform: "none", fontWeight: 500 }}>
                                            • {relativeTime(article.publishedAt)}
                                        </span>
                                    ) : null}
                                </div>
                                <h2 style={{ fontWeight: 600, color: "white", fontSize: "16px", lineHeight: "1.4", margin: "0 0 0.75rem 0" }}>{article.title}</h2>
                                <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.5", flex: 1, margin: "0 0 1rem 0" }}>
                                    {truncate(article.description, 140)}
                                </p>
                                <a
                                    href={article.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        textDecoration: "none",
                                        color: "#3b82f6",
                                        fontSize: "14px",
                                        fontWeight: 600,
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                    }}
                                >
                                    Read article →
                                </a>
                            </div>
                        </article>
                    ))}
                </div>

                {!loading && !error && articles.length === 0 && (
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📰</div>
                        <p style={{ fontSize: "18px", marginBottom: "10px", color: "white", fontWeight: 600 }}>
                            {searchQuery
                                ? `No results for "${searchQuery}"`
                                : `Nothing in ${LABELS[activeCategory] ?? activeCategory} right now`}
                        </p>
                        <p style={{ fontSize: "14px" }}>
                            {searchQuery
                                ? "Try a different search term, or clear the search."
                                : isDev
                                    ? "Click 📰 to ingest articles."
                                    : "This section refreshes daily - try another category."}
                        </p>
                    </div>
                )}

                {articles.length > 0 && nextCursor && (
                    <div style={{ textAlign: "center" }}>
                        <button
                            onClick={() => fetchArticles(activeCategory, searchQuery, nextCursor, true)}
                            disabled={loadingMore}
                            style={{
                                backgroundColor: "#3b82f6",
                                color: "white",
                                border: "none",
                                padding: "12px 32px",
                                borderRadius: "8px",
                                cursor: loadingMore ? "not-allowed" : "pointer",
                                fontSize: "14px",
                                fontWeight: 600,
                                opacity: loadingMore ? 0.5 : 1,
                                transition: "all 0.2s",
                            }}
                        >
                            {loadingMore ? "Loading..." : "Load more"}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function NewsPage() {
    return (
        <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "#0f172a" }} />}>
            <NewsPageInner />
        </Suspense>
    );
}
