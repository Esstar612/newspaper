"use client";

import { useCallback, useEffect, useState } from "react";

type Quote = {
    symbol: string;
    currency: string;
    last: number;
    change: number | null;
    changePercent: number | null;
    bid: number | null;
    ask: number | null;
    volume: number | null;
    updated: number | null;
    converted: { currency: string; last: number; rate: number } | null;
};

const STOCKS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META",
    "TSLA", "BRK.A", "BABA", "V", "JNJ"
];

const money = (value: number, currency: string) => {
    try {
        return new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        // Intl throws on codes it does not recognise; the raw number still beats nothing.
        return `${value.toFixed(2)} ${currency}`;
    }
};

const compact = (value: number) =>
    new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);

export default function StocksPage() {
    const [stock, setStock] = useState("AAPL");
    const [currency, setCurrency] = useState("USD");
    // Seeded so the picker is never empty, even if the currency list fails to load.
    const [currencies, setCurrencies] = useState<string[]>(["USD"]);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [currencyNotice, setCurrencyNotice] = useState("");

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const response = await fetch("/api/currencies");
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                if (cancelled) return;

                if (Array.isArray(data.codes) && data.codes.length > 0) {
                    setCurrencies(data.codes);
                }
                if (data.degraded) {
                    setCurrencyNotice("Live currency list unavailable - showing common currencies.");
                }
            } catch (err) {
                if (cancelled) return;
                // Previously this was a bare console.error, so a failure looked like
                // a dead dropdown with no explanation.
                setCurrencyNotice(
                    err instanceof Error
                        ? `Could not load currency list (${err.message}).`
                        : "Could not load currency list."
                );
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const fetchStockData = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch(
                `/api/stocks/${encodeURIComponent(stock)}?currency=${encodeURIComponent(currency)}`
            );
            const data = await response.json();

            if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);

            setQuote(data as Quote);
        } catch (err) {
            setQuote(null);
            setError(err instanceof Error ? err.message : "Failed to fetch stock data");
        } finally {
            setLoading(false);
        }
    }, [stock, currency]);

    return (
        <div style={{ minHeight: "100vh", backgroundColor: "#0f172a" }}>

            {/* Page Header */}
            <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1.5rem 1.5rem" }}>
                <h1 style={{ fontSize: "32px", fontWeight: 700, color: "white", margin: "0 0 0.5rem 0" }}>
                    Stock Market
                </h1>
                <p style={{ fontSize: "16px", color: "#94a3b8", margin: 0 }}>
                    Track real-time stock prices and market data
                </p>
            </div>

            {/* Content */}
            <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 1.5rem 3rem" }}>
                {/* Control Panel */}
                <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "1.5rem", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "2rem" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "8px", fontWeight: 600 }}>
                                Stock Symbol
                            </label>
                            <select
                                value={stock}
                                onChange={(e) => setStock(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backgroundColor: "#0f172a",
                                    color: "white",
                                    fontSize: "15px",
                                    outline: "none",
                                    cursor: "pointer",
                                }}
                            >
                                {STOCKS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "13px", color: "#94a3b8", marginBottom: "8px", fontWeight: 600 }}>
                                Currency
                            </label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backgroundColor: "#0f172a",
                                    color: "white",
                                    fontSize: "15px",
                                    outline: "none",
                                    cursor: "pointer",
                                }}
                            >
                                {currencies.map((cur) => (
                                    <option key={cur} value={cur}>{cur}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: "flex", alignItems: "flex-end" }}>
                            <button
                                onClick={fetchStockData}
                                disabled={loading}
                                style={{
                                    width: "100%",
                                    padding: "10px 24px",
                                    borderRadius: "8px",
                                    backgroundColor: "#3b82f6",
                                    color: "white",
                                    border: "none",
                                    fontSize: "15px",
                                    fontWeight: 600,
                                    cursor: loading ? "not-allowed" : "pointer",
                                    opacity: loading ? 0.5 : 1,
                                    transition: "all 0.2s",
                                }}
                                onMouseOver={(e) => !loading && (e.currentTarget.style.backgroundColor = "#2563eb")}
                                onMouseOut={(e) => !loading && (e.currentTarget.style.backgroundColor = "#3b82f6")}
                            >
                                {loading ? "Loading..." : "📊 Fetch Price"}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div style={{ padding: "12px", backgroundColor: "#991b1b20", color: "#fca5a5", borderRadius: "8px", border: "1px solid #991b1b40", fontSize: "14px" }}>
                            ⚠️ {error}
                        </div>
                    )}

                    {currencyNotice && !error && (
                        <div style={{ padding: "12px", backgroundColor: "#78350f20", color: "#fcd34d", borderRadius: "8px", border: "1px solid #78350f40", fontSize: "14px" }}>
                            ⚠️ {currencyNotice}
                        </div>
                    )}
                </div>

                {/* Stock Data Display */}
                {quote && !loading && (
                    <div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                            <h2 style={{ fontSize: "28px", fontWeight: 700, color: "white", margin: 0 }}>
                                {quote.symbol}
                            </h2>
                            {quote.updated && (
                                <span style={{ fontSize: "13px", color: "#64748b" }}>
                                    as of {new Date(quote.updated * 1000).toLocaleString()}
                                </span>
                            )}
                        </div>

                        {/* Headline price */}
                        <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "1.75rem", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "1rem" }}>
                            <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", fontWeight: 600 }}>
                                Last price
                            </div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
                                <div style={{ fontSize: "40px", fontWeight: 700, color: "white", lineHeight: 1.1 }}>
                                    {money(quote.converted ? quote.converted.last : quote.last, quote.converted ? quote.converted.currency : quote.currency)}
                                </div>
                                {quote.changePercent !== null && (
                                    <div style={{ fontSize: "18px", fontWeight: 600, color: quote.changePercent >= 0 ? "#4ade80" : "#f87171" }}>
                                        {quote.changePercent >= 0 ? "▲" : "▼"}{" "}
                                        {Math.abs(quote.changePercent * 100).toFixed(2)}%
                                        {quote.change !== null && (
                                            <span style={{ color: "#94a3b8", fontWeight: 500, marginLeft: "8px" }}>
                                                ({quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)})
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {quote.converted && (
                                <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "10px" }}>
                                    {money(quote.last, "USD")} &middot; 1 USD = {quote.converted.rate.toFixed(4)} {quote.converted.currency}
                                </div>
                            )}
                        </div>

                        {/* Secondary metrics */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
                            {([
                                ["Bid", quote.bid === null ? null : money(quote.bid, "USD")],
                                ["Ask", quote.ask === null ? null : money(quote.ask, "USD")],
                                ["Volume", quote.volume === null ? null : compact(quote.volume)],
                            ] as const)
                                .filter(([, value]) => value !== null)
                                .map(([label, value]) => (
                                    <div
                                        key={label}
                                        style={{
                                            backgroundColor: "#1e293b",
                                            borderRadius: "12px",
                                            padding: "1.25rem",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                        }}
                                    >
                                        <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px", fontWeight: 600 }}>
                                            {label}
                                        </div>
                                        <div style={{ fontSize: "22px", fontWeight: 700, color: "white" }}>
                                            {value}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!quote && !loading && !error && (
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "64px", marginBottom: "1rem" }}>📈</div>
                        <h2 style={{ fontSize: "24px", fontWeight: 600, color: "white", marginBottom: "8px" }}>
                            Select a Stock
                        </h2>
                        <p style={{ fontSize: "16px" }}>
                            Choose a stock symbol and currency, then click &ldquo;Fetch Price&rdquo;
                        </p>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "48px", marginBottom: "1rem" }}>⏳</div>
                        <div style={{ fontSize: "18px" }}>Loading stock data...</div>
                    </div>
                )}
            </div>
        </div>
    );
}