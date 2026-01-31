"use client";

import { useEffect, useState } from "react";

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

const CATEGORIES = ["general", "business", "technology", "science", "health", "sports"];

const COUNTRY_CODES: Record<string, string> = {
    "US": "us", "United States": "us",
    "GB": "gb", "United Kingdom": "gb",
    "CA": "ca", "Canada": "ca",
    "AU": "au", "Australia": "au",
    "IN": "in", "India": "in",
    "DE": "de", "Germany": "de",
    "FR": "fr", "France": "fr",
};

export default function NewsPage() {
    const [articles, setArticles] = useState<Article[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string>("");
    const [activeCategory, setActiveCategory] = useState("general");
    const [searchQuery, setSearchQuery] = useState("");
    const [tempSearchQuery, setTempSearchQuery] = useState("");
    const [searchExpanded, setSearchExpanded] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [userCountry, setUserCountry] = useState("us");
    const limit = 20;
    const isDev = process.env.NODE_ENV === "development";

    useEffect(() => {
        setMounted(true);
        detectUserCountry();
    }, []);

    async function detectUserCountry() {
        try {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        try {
                            const response = await fetch(
                                `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
                            );
                            const data = await response.json();
                            const countryCode = data.countryCode || "US";
                            const country = COUNTRY_CODES[countryCode] || "us";
                            setUserCountry(country);
                        } catch (err) {
                            setUserCountry("us");
                        }
                    },
                    () => setUserCountry("us")
                );
            }
        } catch (err) {
            setUserCountry("us");
        }
    }

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
            alert("✅ Articles ingested!");
        } catch (e: unknown) {
            alert("❌ " + (e instanceof Error ? e.message : "Ingest failed"));
        } finally {
            setLoading(false);
        }
    }

    async function fetchArticles(category: string, search: string = "", cursor?: string | null, isLoadMore = false) {
        if (isLoadMore) setLoadingMore(true);
        else setLoading(true);
        setError("");

        try {
            const url = new URL("/api/news", window.location.origin);
            url.searchParams.set("limit", String(limit));
            if (category && category !== "general") url.searchParams.set("category", category);
            if (search) url.searchParams.set("q", search);
            if (cursor) url.searchParams.set("cursor", cursor);

            const res = await fetch(url.toString(), { cache: "no-store" });
            if (!res.ok) throw new Error("Failed to load");

            const data = (await res.json()) as NewsResponse;

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
            setError(e instanceof Error ? e.message : "Failed to load news");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }

    useEffect(() => {
        if (mounted) fetchArticles(activeCategory, searchQuery);
    }, [mounted]);

    const handleCategoryClick = (category: string) => {
        setActiveCategory(category);
        setSearchQuery("");
        setTempSearchQuery("");
        setSearchExpanded(false);
        fetchArticles(category, "");
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
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

    if (!mounted) return null;

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
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", flex: 1 }}>
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => handleCategoryClick(cat)}
                                disabled={loading}
                                style={{
                                    backgroundColor: activeCategory === cat ? "#3b82f6" : "transparent",
                                    color: activeCategory === cat ? "white" : "#94a3b8",
                                    border: "none",
                                    cursor: loading ? "not-allowed" : "pointer",
                                    padding: "8px 16px",
                                    borderRadius: "8px",
                                    textTransform: "capitalize",
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    transition: "all 0.2s",
                                    opacity: loading ? 0.5 : 1,
                                }}
                                onMouseOver={(e) => {
                                    if (!loading && activeCategory !== cat) {
                                        e.currentTarget.style.backgroundColor = "#334155";
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (activeCategory !== cat) {
                                        e.currentTarget.style.backgroundColor = "transparent";
                                    }
                                }}
                            >
                                {cat}
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
                                <span style={{ color: "white", fontWeight: 600 }}>{articles.length}</span> results for &quot;{searchQuery}&quot; in {activeCategory}
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
                                <span style={{ color: "white", fontWeight: 600, textTransform: "capitalize" }}>{activeCategory}</span>
                                {articles.length > 0 && ` • ${articles.length} articles`}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Content */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 1.5rem 3rem" }}>
                {loading && !loadingMore && (
                    <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "32px", marginBottom: "1rem" }}>⏳</div>
                        <div>Loading articles...</div>
                    </div>
                )}

                {error && (
                    <div style={{ padding: "20px", margin: "0 auto 20px", maxWidth: "600px", backgroundColor: "#991b1b20", color: "#fca5a5", borderRadius: "12px", textAlign: "center", border: "1px solid #991b1b40" }}>
                        {error}
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "3rem" }}>
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
                                <img
                                    src={article.imageUrl || "/newspaper.jpg"}
                                    alt={article.title}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    onError={(e) => ((e.target as HTMLImageElement).src = "https://via.placeholder.com/400x200/1e293b/64748b?text=No+Image")}
                                />
                            </div>
                            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", flex: 1 }}>
                                <div style={{ fontSize: "11px", color: "#3b82f6", fontWeight: 600, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                    {article.source}
                                    {article.tags?.length && <span style={{ color: "#64748b", marginLeft: "6px" }}>• {article.tags[0]}</span>}
                                </div>
                                <h2 style={{ fontWeight: 600, color: "white", fontSize: "16px", lineHeight: "1.4", margin: "0 0 0.75rem 0" }}>{article.title}</h2>
                                <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.5", flex: 1, margin: "0 0 1rem 0" }}>
                                    {article.description?.slice(0, 120)}...
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

                {!loading && articles.length === 0 && (
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📰</div>
                        <p style={{ fontSize: "18px", marginBottom: "10px", color: "white", fontWeight: 600 }}>
                            {searchQuery ? `No results for "${searchQuery}"` : `No ${activeCategory} articles yet`}
                        </p>
                        <p style={{ fontSize: "14px" }}>{isDev ? "Click 📰 to ingest articles" : "Try a different category"}</p>
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