"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";

const TemperatureBarGraph = dynamic(() => import("@/components/TemperatureBarGraph"), { ssr: false });
const HumidityLineGraph = dynamic(() => import("@/components/HumidityLineGraph"), { ssr: false });
const WeatherPieChart = dynamic(() => import("@/components/WeatherPieChart"), { ssr: false });

type WeatherUI = {
    location: string;
    temperature: number;
    condition: string;
    description: string;
    icon: string;
    humidity: number;
    time: string;
};

type WeatherDataPoint = {
    dt_txt: string;
    main: {
        temp: number;
        humidity: number;
    };
    weather: Array<{
        main: string;
        description: string;
        icon?: string;
    }>;
};

type ForecastUI = {
    city: string;
    timezone: number;
    list: WeatherDataPoint[];
};

type LocationSuggestion = {
    name: string;
    country: string;
    state?: string;
    lat: number;
    lon: number;
};

/** ✅ Background gradients by weather condition */
const weatherBackgrounds: Record<string, string> = {
    clear: "linear-gradient(to bottom, #4facfe 0%, #00f2fe 100%)",
    clouds: "linear-gradient(to bottom, #bdc3c7 0%, #2c3e50 100%)",
    rain: "linear-gradient(to bottom, #536976 0%, #292e49 100%)",
    drizzle: "linear-gradient(to bottom, #4b79a1 0%, #283e51 100%)",
    thunderstorm: "linear-gradient(to bottom, #141e30 0%, #243b55 100%)",
    snow: "linear-gradient(to bottom, #e6dada 0%, #274046 100%)",
    mist: "linear-gradient(to bottom, #606c88 0%, #3f4c6b 100%)",
    fog: "linear-gradient(to bottom, #757f9a 0%, #d7dde8 100%)",
    default: "#0f172a",
};

function pickBackground(condition: string): string {
    const c = (condition || "").toLowerCase();
    return weatherBackgrounds[c] || weatherBackgrounds.default;
}

export default function WeatherPage() {
    const [q, setQ] = useState("");
    const [data, setData] = useState<WeatherUI | null>(null);
    const [forecast, setForecast] = useState<ForecastUI | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [geolocating, setGeolocating] = useState(false);

    const pageBackground = useMemo(() => pickBackground(data?.condition ?? ""), [data?.condition]);

    // Only autofill search box, don't load weather
    useEffect(() => {
        loadUserLocation();
    }, []);

    async function loadUserLocation() {
        if (!navigator.geolocation) return;

        setGeolocating(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    // Get city name from coordinates
                    const response = await fetch(
                        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
                    );
                    const locationData = await response.json();
                    const cityName = locationData.city || locationData.locality || "";
                    if (cityName) {
                        setQ(cityName); // Just set the search box, don't fetch weather
                    }
                } catch (err) {
                    console.error("Failed to get location:", err);
                } finally {
                    setGeolocating(false);
                }
            },
            () => setGeolocating(false),
            { timeout: 10000 }
        );
    }

    // Use this function for the "My Location" button
    async function useMyLocation() {
        if (!navigator.geolocation) return;

        setGeolocating(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    await searchByCoords(latitude, longitude);
                } catch (err) {
                    console.error("Failed to load weather:", err);
                } finally {
                    setGeolocating(false);
                }
            },
            () => setGeolocating(false),
            { timeout: 10000 }
        );
    }

    async function searchByCoords(lat: number, lon: number) {
        try {
            setError("");
            setLoading(true);

            const [wRes, fRes] = await Promise.all([
                fetch(`/api/weather?lat=${lat}&lon=${lon}`, { cache: "no-store" }),
                fetch(`/api/forecast?lat=${lat}&lon=${lon}`, { cache: "no-store" }),
            ]);

            const wJson: unknown = await wRes.json();
            const fJson: unknown = await fRes.json();

            if (!wRes.ok || !wJson || typeof wJson !== "object") {
                throw new Error("Failed to load weather.");
            }
            if (!fRes.ok || !fJson || typeof fJson !== "object") {
                throw new Error("Failed to load forecast.");
            }

            setData(wJson as WeatherUI);
            setForecast(fJson as ForecastUI);

            if (wJson && typeof wJson === "object" && "location" in wJson) {
                setQ(String(wJson.location));
            }
        } catch (e: unknown) {
            setData(null);
            setForecast(null);
            setError(e instanceof Error ? e.message : "Failed to load weather.");
        } finally {
            setLoading(false);
        }
    }

    async function search(cityName: string) {
        const city = cityName.trim();
        if (!city) return;

        try {
            setError("");
            setLoading(true);
            setShowSuggestions(false);

            const [wRes, fRes] = await Promise.all([
                fetch(`/api/weather?q=${encodeURIComponent(city)}`, { cache: "no-store" }),
                fetch(`/api/forecast?q=${encodeURIComponent(city)}`, { cache: "no-store" }),
            ]);

            const wJson: unknown = await wRes.json();
            const fJson: unknown = await fRes.json();

            if (!wRes.ok || !wJson || typeof wJson !== "object") {
                throw new Error("Failed to load weather.");
            }
            if (!fRes.ok || !fJson || typeof fJson !== "object") {
                throw new Error("Failed to load forecast.");
            }

            setData(wJson as WeatherUI);
            setForecast(fJson as ForecastUI);
        } catch (e: unknown) {
            setData(null);
            setForecast(null);
            setError(e instanceof Error ? e.message : "Failed to load weather.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const fetchSuggestions = async () => {
            if (q.trim().length < 2) {
                setSuggestions([]);
                return;
            }

            try {
                const response = await fetch(`/api/geocoding?q=${encodeURIComponent(q.trim())}`);
                if (response.ok) {
                    const resJson = await response.json();
                    setSuggestions((resJson ?? []).slice(0, 5));
                }
            } catch (err) {
                console.error("Failed to fetch suggestions:", err);
            }
        };

        const timeoutId = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timeoutId);
    }, [q]);

    const handleSuggestionClick = (suggestion: LocationSuggestion) => {
        const cityName = suggestion.state
            ? `${suggestion.name}, ${suggestion.state}, ${suggestion.country}`
            : `${suggestion.name}, ${suggestion.country}`;
        setQ(cityName);
        setShowSuggestions(false);
        search(suggestion.name);
    };

    const forecastList = forecast?.list ?? [];

    const weatherConditions = useMemo(() => {
        const acc: Record<string, number> = {};
        for (const entry of forecastList) {
            const condition = entry.weather?.[0]?.main ?? "Unknown";
            acc[condition] = (acc[condition] || 0) + 1;
        }
        return acc;
    }, [forecastList]);

    return (
        <div style={{ minHeight: "100vh", background: pageBackground, transition: "background 350ms ease", }}>

            {/* Page Header */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 1.5rem 1.5rem" }}>
                <h1 style={{ fontSize: "32px", fontWeight: 700, color: "white", margin: "0 0 0.5rem 0" }}>
                    Weather Dashboard
                </h1>
                <p style={{ fontSize: "16px", color: "#94a3b8", margin: 0 }}>
                    Real-time weather conditions and 5-day forecast
                </p>
            </div>

            {/* Search Bar */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 1.5rem 2rem" }}>
                <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "1rem", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        <div style={{ flex: 1, position: "relative" }}>
                            <input
                                id="weather-search-input"
                                type="text"
                                value={q}
                                onChange={(e) => {
                                    setQ(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") search(q);
                                    if (e.key === "Escape") setShowSuggestions(false);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                placeholder="Search for a city..."
                                style={{
                                    width: "100%",
                                    padding: "10px 16px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backgroundColor: "#0f172a",
                                    color: "white",
                                    fontSize: "15px",
                                    outline: "none",
                                }}
                            />

                            {showSuggestions && suggestions.length > 0 && (
                                <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: "8px", backgroundColor: "#1e293b", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "300px", overflowY: "auto", zIndex: 10 }}>
                                    {suggestions.map((suggestion, index) => (
                                        <div
                                            key={index}
                                            style={{ padding: "12px 16px", cursor: "pointer", borderBottom: index < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.2s" }}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                handleSuggestionClick(suggestion);
                                            }}
                                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#334155")}
                                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                        >
                                            <div style={{ fontSize: "15px", fontWeight: 600, color: "white", marginBottom: "2px" }}>
                                                📍 {suggestion.name}{suggestion.state && `, ${suggestion.state}`}
                                            </div>
                                            <div style={{ fontSize: "13px", color: "#94a3b8" }}>{suggestion.country}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => search(q)}
                            disabled={loading}
                            style={{
                                backgroundColor: "#3b82f6",
                                color: "white",
                                border: "none",
                                padding: "10px 24px",
                                borderRadius: "8px",
                                cursor: loading ? "not-allowed" : "pointer",
                                fontSize: "14px",
                                fontWeight: 600,
                                opacity: loading ? 0.5 : 1,
                            }}
                        >
                            {loading ? "⏳" : "🔍 Search"}
                        </button>

                        <button
                            onClick={useMyLocation}
                            disabled={geolocating || loading}
                            style={{
                                backgroundColor: "#334155",
                                color: "white",
                                border: "none",
                                padding: "10px 20px",
                                borderRadius: "8px",
                                cursor: geolocating || loading ? "not-allowed" : "pointer",
                                fontSize: "14px",
                                fontWeight: 600,
                                opacity: geolocating || loading ? 0.5 : 1,
                            }}
                        >
                            {geolocating ? "📍..." : "📍 My Location"}
                        </button>
                    </div>

                    {error && (
                        <div style={{ marginTop: "12px", padding: "12px", backgroundColor: "#991b1b20", color: "#fca5a5", borderRadius: "8px", border: "1px solid #991b1b40", fontSize: "14px" }}>
                            ⚠️ {error}
                        </div>
                    )}
                </div>
            </div>

            {/* Content */}
            <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "0 1.5rem 3rem" }}>
                {/* Current Weather */}
                {data && (
                    <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "2rem", border: "1px solid rgba(255,255,255,0.1)", marginBottom: "2rem" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2rem" }}>
                            <div>
                                <div style={{ fontSize: "64px", fontWeight: 700, color: "white", marginBottom: "8px" }}>
                                    {Math.round(data.temperature)}°C
                                </div>
                                <div style={{ fontSize: "24px", color: "#3b82f6", fontWeight: 600, marginBottom: "4px" }}>
                                    {data.condition}
                                </div>
                                <div style={{ fontSize: "14px", color: "#94a3b8", textTransform: "capitalize" }}>
                                    {data.description}
                                </div>
                            </div>

                            {data.icon && (
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <img
                                        src={`https://openweathermap.org/img/wn/${data.icon}@4x.png`}
                                        alt={data.condition}
                                        style={{ width: "150px", height: "150px" }}
                                    />
                                </div>
                            )}

                            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                <div style={{ padding: "12px", backgroundColor: "#0f172a", borderRadius: "8px" }}>
                                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>LOCATION</div>
                                    <div style={{ fontSize: "16px", color: "white", fontWeight: 600 }}>📍 {data.location}</div>
                                </div>
                                <div style={{ padding: "12px", backgroundColor: "#0f172a", borderRadius: "8px" }}>
                                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>HUMIDITY</div>
                                    <div style={{ fontSize: "16px", color: "white", fontWeight: 600 }}>💧 {data.humidity}%</div>
                                </div>
                                <div style={{ padding: "12px", backgroundColor: "#0f172a", borderRadius: "8px" }}>
                                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>TIME</div>
                                    <div style={{ fontSize: "16px", color: "white", fontWeight: 600 }}>🕒 {data.time}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Charts */}
                {forecastList.length > 0 && (
                    <>
                        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "white", marginBottom: "1.5rem" }}>
                            5-Day Forecast
                        </h2>

                        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                            <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "1.5rem", border: "1px solid rgba(255,255,255,0.1)" }}>
                                <TemperatureBarGraph data={forecastList} />
                            </div>

                            <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "1.5rem", border: "1px solid rgba(255,255,255,0.1)" }}>
                                <HumidityLineGraph data={forecastList} />
                            </div>

                            <div style={{ backgroundColor: "#1e293b", borderRadius: "12px", padding: "1.5rem", border: "1px solid rgba(255,255,255,0.1)" }}>
                                <WeatherPieChart data={weatherConditions} />
                            </div>
                        </div>
                    </>
                )}

                {/* Empty State */}
                {!data && !loading && !geolocating && (
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "64px", marginBottom: "1rem" }}>🌍</div>
                        <h2 style={{ fontSize: "24px", fontWeight: 600, color: "white", marginBottom: "8px" }}>
                            Search for a City
                        </h2>
                        <p style={{ fontSize: "16px" }}>
                            Enter a city name or use your current location
                        </p>
                    </div>
                )}

                {/* Loading */}
                {(loading || geolocating) && !data && (
                    <div style={{ textAlign: "center", padding: "80px 20px", color: "#64748b" }}>
                        <div style={{ fontSize: "48px", marginBottom: "1rem" }}>⏳</div>
                        <div style={{ fontSize: "18px" }}>
                            {geolocating ? "Getting your location..." : "Loading weather..."}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}