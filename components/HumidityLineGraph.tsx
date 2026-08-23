"use client";

import React, { useMemo } from "react";
import {
    ResponsiveContainer,
    LineChart,
    Line,
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

interface HumidityLineGraphProps {
    data: WeatherDataPoint[];
}

const HumidityLineGraph: React.FC<HumidityLineGraphProps> = ({ data }) => {
    const chartData = useMemo(
        () =>
            (data ?? []).map((d) => ({
                time: new Date(d.dt_txt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                }),
                humidity: d.main.humidity,
            })),
        [data]
    );

    if (!chartData.length) return null;

    return (
        <div className="w-full">
            <h3 className="mb-4 font-serif text-xl font-semibold text-ink">Humidity trend</h3>

            <div className="w-full h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
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
                            domain={[0, 100]}
                            label={{
                                value: "Humidity (%)",
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
                            formatter={(value: any) => [`${value ?? 0}%`, "Humidity"]}
                        />
                        <Legend
                            wrapperStyle={{ color: "var(--ink)" }}
                            formatter={(value: string) => (
                                <span style={{ color: "var(--ink)" }}>{value}</span>
                            )}
                        />
                        <Line
                            type="monotone"
                            dataKey="humidity"
                            name="Humidity (%)"
                            stroke="var(--positive)"
                            strokeWidth={3}
                            dot={{ fill: "var(--positive)", r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default HumidityLineGraph;