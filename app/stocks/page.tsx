"use client";

import { useState, useEffect } from "react";

type StockData = {
    last?: number;
    [key: string]: number | undefined;
};

export default function StocksPage() {
    const [stock, setStock] = useState("AAPL");
    const [currency, setCurrency] = useState("USD");
    const [currencies, setCurrencies] = useState<string[]>([]);
    const [stockData, setStockData] = useState<StockData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const STOCKS = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "META",
        "TSLA", "BRK.A", "BABA", "V", "JNJ"
    ];

    useEffect(() => {
        const fetchCurrencies = async () => {
            try {
                const response = await fetch("https://api.frankfurter.app/currencies");
                if (!response.ok) throw new Error("Failed to fetch currencies");
                const data = await response.json();
                setCurrencies(Object.keys(data));
            } catch (error) {
                console.error("Error fetching currencies:", error);
            }
        };

        fetchCurrencies();
    }, []);

    const fetchStockData = async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch(`/api/stocks/${stock}?currency=${currency}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            setStockData(data);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Failed to fetch stock data");
        } finally {
            setLoading(false);
        }
    };

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
                </div>

                {/* Stock Data Display */}
                {stockData && (
                    <div>
                        <h2 style={{ fontSize: "28px", fontWeight: 700, color: "white", marginBottom: "1.5rem" }}>
                            {stock}
                        </h2>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
                            {Object.entries(stockData).map(([key, value]) => (
                                <div
                                    key={key}
                                    style={{
                                        backgroundColor: "#1e293b",
                                        borderRadius: "12px",
                                        padding: "1.5rem",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                    }}
                                >
                                    <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px", fontWeight: 600 }}>
                                        {key}
                                    </div>
                                    <div style={{ fontSize: "32px", fontWeight: 700, color: "white" }}>
                                        {typeof value === "number" ? value.toFixed(2) : value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {!stockData && !loading && !error && (
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "64px", marginBottom: "1rem" }}>📈</div>
                        <h2 style={{ fontSize: "24px", fontWeight: 600, color: "white", marginBottom: "8px" }}>
                            Select a Stock
                        </h2>
                        <p style={{ fontSize: "16px" }}>
                            Choose a stock symbol and currency, then click "Fetch Price"
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