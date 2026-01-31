"use client";

import Link from "next/link";

export default function Home() {
    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#0f172a" }}>

            {/* Hero Section */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "4rem 1.5rem" }}>
                <div style={{ textAlign: "center", marginBottom: "4rem" }}>
                    <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 800, color: "white", margin: "0 0 1rem 0", letterSpacing: "-2px" }}>
                        The Newspaper
                    </h1>
                    <p style={{ fontSize: "clamp(18px, 3vw, 24px)", color: "#94a3b8", margin: 0, maxWidth: "600px", marginLeft: "auto", marginRight: "auto" }}>
                        Markets, news, and weather — all in one place.
                    </p>
                </div>

                {/* Feature Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem", marginBottom: "4rem" }}>
                    {/* News Card */}
                    <Link href="/news" style={{ textDecoration: "none" }}>
                        <div
                            style={{
                                backgroundColor: "#1e293b",
                                borderRadius: "16px",
                                padding: "2rem",
                                border: "1px solid rgba(255,255,255,0.1)",
                                transition: "all 0.3s",
                                cursor: "pointer",
                                height: "100%",
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = "translateY(-8px)";
                                e.currentTarget.style.borderColor = "#3b82f6";
                                e.currentTarget.style.boxShadow = "0 20px 40px rgba(59,130,246,0.2)";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                                e.currentTarget.style.boxShadow = "none";
                            }}
                        >
                            <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📰</div>
                            <h2 style={{ fontSize: "28px", fontWeight: 700, color: "white", margin: "0 0 0.75rem 0" }}>
                                News
                            </h2>
                            <p style={{ fontSize: "16px", color: "#94a3b8", lineHeight: "1.6", margin: 0 }}>
                                Read the latest articles from multiple sources
                            </p>
                        </div>
                    </Link>

                    {/* Stocks Card */}
                    <Link href="/stocks" style={{ textDecoration: "none" }}>
                        <div
                            style={{
                                backgroundColor: "#1e293b",
                                borderRadius: "16px",
                                padding: "2rem",
                                border: "1px solid rgba(255,255,255,0.1)",
                                transition: "all 0.3s",
                                cursor: "pointer",
                                height: "100%",
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = "translateY(-8px)";
                                e.currentTarget.style.borderColor = "#3b82f6";
                                e.currentTarget.style.boxShadow = "0 20px 40px rgba(59,130,246,0.2)";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                                e.currentTarget.style.boxShadow = "none";
                            }}
                        >
                            <div style={{ fontSize: "48px", marginBottom: "1rem" }}>📊</div>
                            <h2 style={{ fontSize: "28px", fontWeight: 700, color: "white", margin: "0 0 0.75rem 0" }}>
                                Stocks
                            </h2>
                            <p style={{ fontSize: "16px", color: "#94a3b8", lineHeight: "1.6", margin: 0 }}>
                                Track stock prices and market data
                            </p>
                        </div>
                    </Link>

                    {/* Weather Card */}
                    <Link href="/weather" style={{ textDecoration: "none" }}>
                        <div
                            style={{
                                backgroundColor: "#1e293b",
                                borderRadius: "16px",
                                padding: "2rem",
                                border: "1px solid rgba(255,255,255,0.1)",
                                transition: "all 0.3s",
                                cursor: "pointer",
                                height: "100%",
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.transform = "translateY(-8px)";
                                e.currentTarget.style.borderColor = "#3b82f6";
                                e.currentTarget.style.boxShadow = "0 20px 40px rgba(59,130,246,0.2)";
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                                e.currentTarget.style.boxShadow = "none";
                            }}
                        >
                            <div style={{ fontSize: "48px", marginBottom: "1rem" }}>⛅</div>
                            <h2 style={{ fontSize: "28px", fontWeight: 700, color: "white", margin: "0 0 0.75rem 0" }}>
                                Weather
                            </h2>
                            <p style={{ fontSize: "16px", color: "#94a3b8", lineHeight: "1.6", margin: 0 }}>
                                View weather forecasts and visualizations
                            </p>
                        </div>
                    </Link>
                </div>

                {/* Features Section */}
                <div style={{ backgroundColor: "#1e293b", borderRadius: "16px", padding: "2.5rem", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <h2 style={{ fontSize: "28px", fontWeight: 700, color: "white", margin: "0 0 2rem 0" }}>
                        Features
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                            <div style={{ fontSize: "24px" }}>✓</div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: 600, color: "white", marginBottom: "0.25rem" }}>
                                    Multi-source news aggregation
                                </div>
                                <div style={{ fontSize: "14px", color: "#94a3b8" }}>
                                    NYT, NewsAPI and more
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                            <div style={{ fontSize: "24px" }}>✓</div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: 600, color: "white", marginBottom: "0.25rem" }}>
                                    Real-time stock market data
                                </div>
                                <div style={{ fontSize: "14px", color: "#94a3b8" }}>
                                    Live prices and currency conversion
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                            <div style={{ fontSize: "24px" }}>✓</div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: 600, color: "white", marginBottom: "0.25rem" }}>
                                    Weather forecasts
                                </div>
                                <div style={{ fontSize: "14px", color: "#94a3b8" }}>
                                    With Recharts visualizations
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                            <div style={{ fontSize: "24px" }}>✓</div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: 600, color: "white", marginBottom: "0.25rem" }}>
                                    Search and filter articles
                                </div>
                                <div style={{ fontSize: "14px", color: "#94a3b8" }}>
                                    Find exactly what you need
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                            <div style={{ fontSize: "24px" }}>✓</div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: 600, color: "white", marginBottom: "0.25rem" }}>
                                    Responsive design
                                </div>
                                <div style={{ fontSize: "14px", color: "#94a3b8" }}>
                                    Works on all devices
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
                            <div style={{ fontSize: "24px" }}>✓</div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: 600, color: "white", marginBottom: "0.25rem" }}>
                                    Location-aware
                                </div>
                                <div style={{ fontSize: "14px", color: "#94a3b8" }}>
                                    Personalized content for your region
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CTA Section */}
                <div style={{ textAlign: "center", marginTop: "4rem" }}>
                    <p style={{ fontSize: "18px", color: "#94a3b8", marginBottom: "1.5rem" }}>
                        Ready to get started?
                    </p>
                    <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                        <Link href="/news" style={{ textDecoration: "none" }}>
                            <button
                                style={{
                                    backgroundColor: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    padding: "14px 32px",
                                    borderRadius: "12px",
                                    fontSize: "16px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = "#2563eb";
                                    e.currentTarget.style.transform = "scale(1.05)";
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = "#3b82f6";
                                    e.currentTarget.style.transform = "scale(1)";
                                }}
                            >
                                Browse News
                            </button>
                        </Link>
                        <Link href="/stocks" style={{ textDecoration: "none" }}>
                            <button
                                style={{
                                    backgroundColor: "transparent",
                                    color: "#3b82f6",
                                    border: "2px solid #3b82f6",
                                    padding: "14px 32px",
                                    borderRadius: "12px",
                                    fontSize: "16px",
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = "#3b82f6";
                                    e.currentTarget.style.color = "white";
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                    e.currentTarget.style.color = "#3b82f6";
                                }}
                            >
                                Check Stocks
                            </button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: "4rem", padding: "2rem 1.5rem", textAlign: "center" }}>
                <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
                    The Newspaper © {new Date().getFullYear()} • Your one-stop information hub
                </p>
            </footer>
        </div>
    );
}