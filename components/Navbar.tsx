"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItemStyle = {
    padding: "8px 16px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 600,
    transition: "all 0.2s",
};

export default function Navbar() {
    const pathname = usePathname();

    const linkStyle = (path: string) => ({
        ...navItemStyle,
        backgroundColor: pathname === path ? "#3b82f6" : "transparent",
        color: pathname === path ? "white" : "#94a3b8",
    });

    return (
        <nav style={{ display: "flex", gap: "0.5rem" }}>
            <Link href="/news" style={linkStyle("/news")}>News</Link>
            <Link href="/stocks" style={linkStyle("/stocks")}>Stocks</Link>
            <Link href="/weather" style={linkStyle("/weather")}>Weather</Link>
        </nav>
    );
}
