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

// Condition hues, tuned to sit alongside the app palette rather than the
// flat-UI set these were originally copied from.
const COLORS: Record<string, string> = {
  Clear: "#f0b429",
  Clouds: "#8b98ac",
  Rain: "#60a5fa",
  Drizzle: "#7dd3fc",
  Thunderstorm: "#a78bfa",
  Snow: "#e2e8f0",
  Mist: "#94a3b8",
  Fog: "#64748b",
};

const DEFAULT_COLORS = [
  "#60a5fa",
  "#4ade80",
  "#f0b429",
  "#a78bfa",
  "#7dd3fc",
  "#f87171",
  "#8b98ac",
  "#e2e8f0",
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
        <h3 className="mb-4 font-serif text-xl font-semibold text-ink">Conditions breakdown</h3>

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
                  label={(props: any) => {
                    const percentage = total ? ((props.value / total) * 100).toFixed(1) : 0;
                    return (
                        <text
                            x={props.x}
                            y={props.y}
                            textAnchor={props.textAnchor}
                            dominantBaseline="central"
                            fill="var(--ink-muted)"
                            fontSize={12}
                        >
                          {`${props.name} (${percentage}%)`}
                        </text>
                    );
                  }}
                  labelLine={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
              >
                {chartData.map((entry, index) => (
                    <Cell
                        key={`cell-${index}`}
                        fill={COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                        stroke="var(--line-strong)"
                        strokeWidth={2}
                    />
                ))}
              </Pie>
              <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--raised)",
                    border: "1px solid var(--line-strong)",
                    borderRadius: "8px",
                    color: "var(--ink)"
                  }}
                  itemStyle={{ color: "var(--ink)" }}
                  labelStyle={{ color: "var(--ink-muted)" }}
                  formatter={(value: any) => {
                    const numValue = typeof value === 'number' ? value : 0;
                    const percentage = total ? ((numValue / total) * 100).toFixed(1) : 0;
                    return [`${numValue} occurrences (${percentage}%)`, "Count"];
                  }}
              />
              <Legend
                  wrapperStyle={{ color: "var(--ink)" }}
                  formatter={(value: string, entry: any) => {
                    const percentage = total && entry?.payload?.value
                        ? ((entry.payload.value / total) * 100).toFixed(1)
                        : 0;
                    return (
                        <span style={{ color: "var(--ink)" }}>{`${value} (${percentage}%)`}</span>
                    );
                  }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
  );
};

export default WeatherPieChart;