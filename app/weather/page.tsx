"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
    Button,
    Card,
    EmptyState,
    ErrorBanner,
    Icon,
    PageHeader,
    Skeleton,
    TextField,
    cn,
} from "@/components/ui";

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

/**
 * Condition gradients for the hero card.
 *
 * These used to paint the whole page, and two of them (fog, snow) ended in near-white
 * while the text over them stayed hardcoded white — unreadable. They are now scoped to
 * the hero card and every stop is dark enough to carry white text.
 */
const weatherBackgrounds: Record<string, string> = {
    clear: "linear-gradient(160deg, #1e6091 0%, #0d3b66 100%)",
    clouds: "linear-gradient(160deg, #3d4a5c 0%, #232b36 100%)",
    rain: "linear-gradient(160deg, #2c3e50 0%, #1a2530 100%)",
    drizzle: "linear-gradient(160deg, #3a5a73 0%, #22303d 100%)",
    thunderstorm: "linear-gradient(160deg, #141e30 0%, #243b55 100%)",
    snow: "linear-gradient(160deg, #4a5a6a 0%, #2a3642 100%)",
    mist: "linear-gradient(160deg, #4a5568 0%, #2d3444 100%)",
    fog: "linear-gradient(160deg, #4a5568 0%, #2d3444 100%)",
    default: "linear-gradient(160deg, #24304a 0%, #161e2e 100%)",
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

                    // Reverse-geocode through OpenWeather rather than a third party, so
                    // the name we prefill is one its forward search can actually find.
                    // Other reverse geocoders return administrative areas such as
                    // "Metro Vancouver Regional District", which resolve to nothing.
                    const response = await fetch(
                        `/api/geocoding?lat=${latitude}&lon=${longitude}`,
                        { cache: "no-store" }
                    );
                    if (!response.ok) return;

                    const places: LocationSuggestion[] = await response.json();
                    const place = Array.isArray(places) ? places[0] : null;
                    if (!place?.name) return;

                    // Same format the suggestion list uses, so the box reads consistently.
                    setQ(
                        place.state
                            ? `${place.name}, ${place.state}, ${place.country}`
                            : `${place.name}, ${place.country}`
                    );

                    // Then actually fetch. This page used to resolve the location,
                    // prefill the box, and stop — leaving an empty "Search for a City"
                    // screen for someone who had already granted location access.
                    await searchByCoords(latitude, longitude);
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

    const hasForecast = forecastList.length > 0;

    return (
        <div className="min-h-screen">
            <div className="mx-auto max-w-page px-4 py-8 sm:px-6">
                <PageHeader title="Weather" subtitle="Current conditions and a 5-day outlook" />

                {/* Search */}
                <div className="mb-6 border-y border-line py-3">
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            search(q);
                        }}
                        className="flex flex-col gap-2 sm:flex-row sm:items-end"
                    >
                        <div className="relative min-w-0 flex-1">
                            <TextField
                                label="City"
                                hideLabel
                                value={q}
                                onChange={(e) => {
                                    setQ(e.target.value);
                                    setShowSuggestions(true);
                                }}
                                onFocus={() => setShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
                                placeholder="Search for a city…"
                                autoComplete="off"
                                role="combobox"
                                aria-expanded={showSuggestions && suggestions.length > 0}
                                aria-controls="city-suggestions"
                            />

                            {showSuggestions && suggestions.length > 0 && (
                                <ul
                                    id="city-suggestions"
                                    role="listbox"
                                    className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-line bg-raised shadow-lift"
                                >
                                    {suggestions.map((s, i) => (
                                        <li key={`${s.name}-${s.lat}-${i}`} role="option" aria-selected={false}>
                                            <button
                                                type="button"
                                                onMouseDown={() => handleSuggestionClick(s)}
                                                className="block w-full px-3 py-2 text-left text-base text-ink transition-colors hover:bg-surface"
                                            >
                                                {s.name}
                                                <span className="text-ink-subtle">
                                                    {s.state ? `, ${s.state}` : ""}, {s.country}
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <Button type="submit" disabled={loading}>
                                <Icon name="search" size={16} />
                                Search
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={useMyLocation}
                                disabled={geolocating || loading}
                            >
                                <Icon name="location" size={16} />
                                {geolocating ? "Locating…" : "My location"}
                            </Button>
                        </div>
                    </form>
                </div>

                {error && (
                    <div className="mb-6">
                        <ErrorBanner
                            title="Could not load weather"
                            message={error}
                            onRetry={q ? () => search(q) : undefined}
                        />
                    </div>
                )}

                {loading && (
                    <div className="space-y-6">
                        <Skeleton className="h-56 w-full rounded-lg" />
                        <div className="grid gap-5 lg:grid-cols-2">
                            <Skeleton className="h-72 w-full rounded-lg" />
                            <Skeleton className="h-72 w-full rounded-lg" />
                        </div>
                    </div>
                )}

                {!loading && !data && !error && (
                    <EmptyState
                        icon={<Icon name="globe" size={40} />}
                        title="Search for a city"
                        hint="Enter a city name, or use your current location."
                    />
                )}

                {!loading && data && (
                    <div className="space-y-6">
                        {/*
                          * The condition gradient lives here rather than on the page, so
                          * the rest of the UI keeps its theme tokens and the white text
                          * below always has a dark ground under it.
                          */}
                        <div
                            className="overflow-hidden rounded-lg border border-line"
                            style={{ background: pageBackground }}
                        >
                            <div className="flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
                                <div className="flex items-center gap-5">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={`https://openweathermap.org/img/wn/${data.icon}@4x.png`}
                                        alt={data.description}
                                        width={120}
                                        height={120}
                                        className="h-24 w-24 shrink-0 sm:h-32 sm:w-32"
                                    />
                                    <div>
                                        <p className="font-serif text-2xl font-semibold text-white">
                                            {data.location}
                                        </p>
                                        <p className="text-lg capitalize text-white/80">{data.description}</p>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <p className="tabular text-6xl font-semibold leading-none text-white">
                                        {Math.round(data.temperature)}°
                                    </p>
                                    <dl className="mt-3 flex justify-end gap-5 text-sm text-white/80">
                                        <div>
                                            <dt className="text-2xs uppercase tracking-wide text-white/60">
                                                Humidity
                                            </dt>
                                            <dd className="tabular">{data.humidity}%</dd>
                                        </div>
                                        <div>
                                            <dt className="text-2xs uppercase tracking-wide text-white/60">
                                                Local time
                                            </dt>
                                            <dd className="tabular">{data.time}</dd>
                                        </div>
                                    </dl>
                                </div>
                            </div>
                        </div>

                        {hasForecast && (
                            <section aria-label="Five day forecast" className="space-y-5">
                                <h2 className="font-serif text-2xl font-semibold text-ink">5-day forecast</h2>
                                <div className="grid gap-5 lg:grid-cols-2">
                                    <Card>
                                        <TemperatureBarGraph data={forecastList} />
                                    </Card>
                                    <Card>
                                        <HumidityLineGraph data={forecastList} />
                                    </Card>
                                    <Card className={cn("lg:col-span-2")}>
                                        <WeatherPieChart data={weatherConditions} />
                                    </Card>
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
