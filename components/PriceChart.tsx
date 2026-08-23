"use client";

import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { money } from "@/lib/format";

export type PricePoint = { t: number; close: number };

/**
 * Daily close history. Colour follows direction over the window — green if the
 * period ended higher than it started — which is the convention on every finance
 * site and saves the reader parsing the axis.
 */
export function PriceChart({ points, currency = "USD" }: { points: PricePoint[]; currency?: string }) {
    if (points.length < 2) {
        return (
            <div className="grid h-64 place-items-center text-base text-ink-subtle">
                Not enough history to chart.
            </div>
        );
    }

    const rising = points[points.length - 1].close >= points[0].close;
    const stroke = rising ? "var(--positive)" : "var(--negative)";

    const closes = points.map((p) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const pad = (max - min) * 0.08 || max * 0.02;

    const dateLabel = (t: number) =>
        new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

    return (
        <div className="h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis
                        dataKey="t"
                        tickFormatter={dateLabel}
                        tick={{ fill: "var(--ink-subtle)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={32}
                    />
                    <YAxis
                        domain={[min - pad, max + pad]}
                        tickFormatter={(v: number) => money(v, currency)}
                        tick={{ fill: "var(--ink-subtle)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        width={78}
                    />
                    <Tooltip
                        contentStyle={{
                            background: "var(--raised)",
                            border: "1px solid var(--line-strong)",
                            borderRadius: 8,
                            color: "var(--ink)",
                        }}
                        labelFormatter={(t) => dateLabel(Number(t))}
                        formatter={(v) => [money(Number(v), currency), "Close"]}
                    />
                    <Area
                        type="monotone"
                        dataKey="close"
                        stroke={stroke}
                        strokeWidth={2}
                        fill="url(#priceFill)"
                        dot={false}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
