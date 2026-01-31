"use client";

type ArticleCardProps = {
    article: {
        _id?: string;
        title: string;
        description?: string;
        url: string;
        imageUrl?: string;
        source: string;
        publishedAt?: string | Date;
    };
};

function formatDate(d?: string | Date) {
    if (!d) return "";
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
}

export default function ArticleCard({ article }: ArticleCardProps) {
    const published = formatDate(article.publishedAt);

    return (
        <article
            style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr",
                gap: 14,
                padding: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
            }}
        >
            <div
                style={{
                    width: 140,
                    height: 110,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                }}
            >
                {article.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={article.imageUrl}
                        alt=""
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                ) : (
                    <span style={{ fontSize: 12, opacity: 0.7 }}>No image</span>
                )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span
                style={{
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    opacity: 0.85,
                }}
            >
              {article.source}
            </span>
                        {published ? (
                            <span style={{ fontSize: 12, opacity: 0.7 }}>{published}</span>
                        ) : null}
                    </div>

                    <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            fontSize: 16,
                            fontWeight: 650,
                            lineHeight: 1.25,
                            textDecoration: "none",
                            color: "inherit",
                        }}
                    >
                        {article.title}
                    </a>
                </header>

                {article.description ? (
                    <p style={{ margin: 0, opacity: 0.85, lineHeight: 1.35 }}>
                        {article.description}
                    </p>
                ) : null}

                <div style={{ marginTop: "auto" }}>
                    <a
                        href={article.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            display: "inline-block",
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            textDecoration: "none",
                            color: "inherit",
                            fontSize: 13,
                        }}
                    >
                        Read more â†’
                    </a>
                </div>
            </div>
        </article>
    );
}
