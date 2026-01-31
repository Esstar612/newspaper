"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
    userCountry?: string;
    showLocation?: boolean;
};

const navItemBase = {
    padding: "8px 16px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 600,
    transition: "all 0.2s",
} as const;

export default function Header({ userCountry, showLocation = false }: Props) {
    const pathname = usePathname();

    const linkStyle = (path: string) => ({
        ...navItemBase,
        backgroundColor: pathname === path ? "#3b82f6" : "transparent",
        color: pathname === path ? "white" : "#94a3b8",
    });

    return (
        <header
            style={{
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                backgroundColor: "#1e293b",
                position: "sticky",
                top: 0,
                zIndex: 50,
            }}
        >
            <div
                style={{
                    maxWidth: "1400px",
                    margin: "0 auto",
                    padding: "1.25rem 1.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "2rem",
                }}
            >
                {/* Branding + Nav */}
                <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
                    {/* Clickable Logo/Title */}
                    <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <div
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "18px",
                            }}
                        >
                            📰
                        </div>
                        <span style={{ fontSize: "20px", fontWeight: 700, color: "white" }}>
                            The Newspaper
                        </span>
                    </Link>

                    <nav style={{ display: "flex", gap: "0.5rem" }}>
                        <Link href="/news" style={linkStyle("/news")}>News</Link>
                        <Link href="/stocks" style={linkStyle("/stocks")}>Stocks</Link>
                        <Link href="/weather" style={linkStyle("/weather")}>Weather</Link>
                    </nav>
                </div>

                {/* Optional Country Indicator */}
                {showLocation && userCountry ? (
                    <div
                        style={{
                            fontSize: "14px",
                            color: "#94a3b8",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}
                    >
                        <span>📍</span>
                        <span style={{ fontWeight: 600, textTransform: "uppercase" }}>
                            {userCountry}
                        </span>
                    </div>
                ) : null}
            </div>
        </header>
    );
}