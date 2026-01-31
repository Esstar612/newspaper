"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Legend,
  Cell,
} from "recharts";

type WeatherConditions = {
  [key: string]: number;
};

interface WeatherPieChartProps {
  data: WeatherConditions;
}

const COLORS: Record<string, string> = {
  Clear: "#FFD93D",
  Clouds: "#95A5A6",
  Rain: "#3498DB",
  Drizzle: "#5DADE2",
  Thunderstorm: "#8E44AD",
  Snow: "#ECF0F1",
  Mist: "#BDC3C7",
  Fog: "#95A5A6",
};

const DEFAULT_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#FFA07A",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E2",
];

const WeatherPieChart: React.FC<WeatherPieChartProps> = ({ data }) => {
  const chartData = useMemo(() => {
    const entries = Object.entries(data ?? {});
    return entries.map(([name, value]) => ({ name, value }));
  }, [data]);

  const total = useMemo(
      () => chartData.reduce((sum, d) => sum + d.value, 0),
      [chartData]
  );

  if (!chartData.length) return null;

  return (
      <div className="w-full">
        <h3 className="text-white text-2xl font-bold mb-6 text-center">
          ☁️ Weather Conditions Distribution
        </h3>

        <div className="w-full h-[450px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={150}
                  label={(entry) => {
                    const percentage = total ? ((entry.value / total) * 100).toFixed(1) : 0;
                    return `${entry.name} (${percentage}%)`;
                  }}
                  labelLine={{ stroke: "white", strokeWidth: 1 }}
              >
                {chartData.map((entry, index) => (
                    <Cell
                        key={`cell-${index}`}
                        fill={COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                        stroke="rgba(255,255,255,0.3)"
                        strokeWidth={2}
                    />
                ))}
              </Pie>
              <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.8)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "8px",
                    color: "white"
                  }}
                  formatter={(value: any) => {
                    const numValue = typeof value === 'number' ? value : 0;
                    const percentage = total ? ((numValue / total) * 100).toFixed(1) : 0;
                    return [`${numValue} occurrences (${percentage}%)`, "Count"];
                  }}
              />
              <Legend
                  wrapperStyle={{ color: "white" }}
                  formatter={(value: string, entry: any) => {
                    const percentage = total && entry?.payload?.value
                        ? ((entry.payload.value / total) * 100).toFixed(1)
                        : 0;
                    return `${value} (${percentage}%)`;
                  }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
  );
};

export default WeatherPieChart;