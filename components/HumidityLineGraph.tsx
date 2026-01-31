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
            <h3 className="text-white text-2xl font-bold mb-6 text-center">
                💧 Humidity Trends
            </h3>

            <div className="w-full h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={chartData}
                        margin={{ top: 20, right: 30, bottom: 80, left: 20 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis
                            dataKey="time"
                            tick={{ fill: "white", fontSize: 12 }}
                            angle={-45}
                            textAnchor="end"
                            height={90}
                            stroke="rgba(255,255,255,0.3)"
                        />
                        <YAxis
                            tick={{ fill: "white", fontSize: 12 }}
                            stroke="rgba(255,255,255,0.3)"
                            domain={[0, 100]}
                            label={{
                                value: "Humidity (%)",
                                angle: -90,
                                position: "insideLeft",
                                style: { fill: "white", fontSize: 14 }
                            }}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "rgba(0,0,0,0.8)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                borderRadius: "8px",
                                color: "white"
                            }}
                            formatter={(value: any) => [`${value ?? 0}%`, "Humidity"]}
                        />
                        <Legend
                            wrapperStyle={{ color: "white" }}
                            formatter={() => "Humidity"}
                        />
                        <Line
                            type="monotone"
                            dataKey="humidity"
                            stroke="#51cf66"
                            strokeWidth={3}
                            dot={{ fill: "#51cf66", r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default HumidityLineGraph;