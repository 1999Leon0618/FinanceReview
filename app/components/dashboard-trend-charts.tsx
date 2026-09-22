"use client";

import { LoaderCircle } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardData } from "@/lib/types";

const twd = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const money = (value?: string | null) => `NT$${twd.format(Number(value ?? 0))}`;
const compactTwd = (value: number) => {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000)
    return `NT$${(value / 100_000_000).toFixed(1)}億`;
  if (absolute >= 10_000) return `NT$${Math.round(value / 10_000)}萬`;
  return `NT$${twd.format(value)}`;
};
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  });
const privateValue = (hidden: boolean, value: string) =>
  hidden ? "••••••" : value;

export function HeroAssetChart({
  trend,
  chartDomain,
  valuesHidden,
}: {
  trend: DashboardData["trend"];
  chartDomain: [number, number];
  valuesHidden: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={trend}
        margin={{ top: 8, right: 2, bottom: 0, left: -8 }}
      >
        <defs>
          <linearGradient id="heroAssetFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d2f27e" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#d2f27e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          stroke="rgba(255,255,255,.07)"
          strokeDasharray="3 5"
          vertical={false}
        />
        <XAxis
          dataKey="capturedAt"
          tickFormatter={(value) =>
            new Date(value).toLocaleDateString("zh-TW", {
              month: "numeric",
              day: "numeric",
            })
          }
          tick={{ fill: "rgba(255,255,255,.38)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={36}
          tickMargin={8}
        />
        <YAxis
          orientation="right"
          domain={chartDomain}
          tickFormatter={(value) =>
            valuesHidden ? "•••" : compactTwd(Number(value))
          }
          tick={{ fill: "rgba(255,255,255,.34)", fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickCount={3}
          allowDataOverflow
        />
        <Tooltip
          formatter={(value) => [
            privateValue(valuesHidden, money(String(value))),
            "資產淨值",
          ]}
          labelFormatter={(value) =>
            new Date(String(value)).toLocaleDateString("zh-TW", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          }
          cursor={{ stroke: "rgba(255,255,255,.22)", strokeWidth: 1 }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid rgba(22,45,34,.1)",
            background: "rgba(255,255,255,.97)",
            boxShadow: "0 12px 32px rgba(5,20,12,.2)",
            color: "#183025",
            fontSize: 11,
            padding: "8px 10px",
          }}
          labelStyle={{ color: "#718078", marginBottom: 4 }}
          itemStyle={{ color: "#244c39", fontWeight: 650 }}
        />
        <Area
          type="monotone"
          dataKey="totalAssetValueTwd"
          stroke="#d4f47c"
          strokeWidth={2.5}
          fill="url(#heroAssetFill)"
          baseValue={chartDomain[0]}
          dot={{
            r: 3,
            fill: "#d4f47c",
            stroke: "#1b2e25",
            strokeWidth: 2,
          }}
          activeDot={{
            r: 5,
            fill: "#d4f47c",
            stroke: "white",
            strokeWidth: 2,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type TrendChartProps<T extends { capturedAt: string }> = {
  data: T[];
  lines: Array<{ key: keyof T & string; label: string; color: string }>;
  loading: boolean;
  error: string;
  valuesHidden: boolean;
  insufficientMessage?: string;
  allowSinglePoint?: boolean;
  xTickFormatter?: (value: string) => string;
  xLabelFormatter?: (value: string) => string;
};

export function TrendChart<T extends { capturedAt: string }>({
  data,
  lines,
  loading,
  error,
  valuesHidden,
  insufficientMessage = "至少需要兩個日期的快照才能顯示走勢",
  allowSinglePoint = false,
  xTickFormatter = shortDate,
  xLabelFormatter = (value) =>
    new Date(String(value)).toLocaleDateString("zh-TW"),
}: TrendChartProps<T>) {
  if (loading)
    return (
      <div className="grid h-64 place-items-center text-sm text-[#7b887f]">
        <LoaderCircle className="animate-spin" />
      </div>
    );
  if (error) return <div className="notice error">{error}</div>;
  if (valuesHidden)
    return (
      <div className="grid h-64 place-items-center text-sm text-[#7b887f]">
        財務數字已隱藏
      </div>
    );
  if (data.length === 0 || (data.length < 2 && !allowSinglePoint))
    return (
      <div className="grid h-64 place-items-center text-sm text-[#7b887f]">
        {insufficientMessage}
      </div>
    );
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-[#68776e]">
        {lines.map((line) => (
          <span className="flex items-center gap-1.5" key={line.key}>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: line.color }}
            />
            {line.label}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#e8ece8" vertical={false} />
            <XAxis
              dataKey="capturedAt"
              tickFormatter={xTickFormatter}
              fontSize={11}
            />
            <YAxis
              tickFormatter={(value) => compactTwd(Number(value))}
              fontSize={11}
              width={54}
            />
            <Tooltip
              labelFormatter={(value) => xLabelFormatter(String(value))}
              formatter={(value, name) => [money(String(value)), String(name)]}
            />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2.25}
                dot={allowSinglePoint && data.length === 1 ? { r: 4 } : false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
