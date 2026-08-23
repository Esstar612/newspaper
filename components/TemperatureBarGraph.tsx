"use client";

import React, { useMemo } from "react";
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";

type WeatherDataPoint = {
    dt_txt: string;
    main: {
        temp: number;
        humidity: number;
    };
    weather: Array<{
        main: string;
        description: string;
    }>;
};

interface TemperatureBarGraphProps {
    data: WeatherDataPoint[];
}

export default function TemperatureBarGraph({ data }: TemperatureBarGraphProps) {
    const chartData = useMemo(
        () =>
            (data ?? []).map((d) => ({
                time: new Date(d.dt_txt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                }),
                temp: Math.round(d.main.temp),
            })),
        [data]
    );

    if (!chartData.length) return null;

    return (
        <div className="w-full">
            <h3 className="mb-4 font-serif text-xl font-semibold text-ink">Temperature forecast</h3>

            <div className="w-full h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        margin={{ top: 20, right: 30, bottom: 80, left: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                        <XAxis
                            dataKey="time"
                            tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={90}
                            stroke="var(--line-strong)"
                        />
                        <YAxis
                            tick={{ fill: "var(--ink-muted)", fontSize: 12 }}
                            stroke="var(--line-strong)"
                            label={{
                                value: "Temperature (°C)",
                                angle: -90,
                                position: "insideLeft",
                                style: { fill: "var(--ink-muted)", fontSize: 14 }
                            }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--raised)",
                                border: "1px solid var(--line-strong)",
                                borderRadius: "8px",
                                color: "var(--ink)"
                            }}
                            itemStyle={{ color: "var(--ink)" }}
                            labelStyle={{ color: "var(--ink-muted)" }}
                            formatter={(value: number | string | undefined) => [`${value ?? 0}°C`, "Temperature"]}
                        />
                        <Legend
                            wrapperStyle={{ color: "var(--ink)" }}
                            formatter={(value: string) => (
                                <span style={{ color: "var(--ink)" }}>{value}</span>
                            )}
                        />
                        <Bar
                            dataKey="temp"
                            name="Temperature (°C)"
                            fill="var(--accent)"
                            radius={[8, 8, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}