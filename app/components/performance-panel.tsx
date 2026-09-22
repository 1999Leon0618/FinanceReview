"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BenchmarkId, PerformanceReport } from "@/lib/types";

const twd = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const money = (value?: string | null) => `NT$${twd.format(Number(value ?? 0))}`;
const hiddenValue = "••••••";
const privateValue = (hidden: boolean, value: string) =>
  hidden ? hiddenValue : value;
const shortDate = (value: string) =>
  new Date(value).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  });

export function PerformancePanel({
  report,
  loading,
  benchmark,
  onBenchmark,
  valuesHidden,
}: {
  report: PerformanceReport | null;
  loading: boolean;
  benchmark: BenchmarkId;
  onBenchmark: (value: BenchmarkId) => void;
  valuesHidden: boolean;
}) {
  const metric = (value: string | null, suffix = "%") =>
    value === null
      ? "資料不足"
      : privateValue(
          valuesHidden,
          `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}${suffix}`,
        );
  const hasPerformance = report?.cumulativeReturnPct !== null;
  return (
    <details
      id="performance"
      className="dashboard-disclosure dashboard-disclosure-dark content-section scroll-mt-24"
    >
      <summary className="dashboard-disclosure-summary">
        <div>
          <p className="text-[10px] font-semibold tracking-[.18em] text-white/42">
            PERFORMANCE
          </p>
          <h2 className="mt-1 text-lg font-semibold">投資績效與基準比較</h2>
          <p className="mt-1 text-xs leading-5 text-white/48">
            {hasPerformance && report
              ? `資金流調整報酬 ${metric(report.cumulativeReturnPct)}`
              : "至少需要兩份期間內快照才能計算績效"}
          </p>
        </div>
        <span className="dashboard-disclosure-action">
          展開分析
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </summary>
      <div className="dashboard-disclosure-body">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs leading-5 text-white/48">
            排除投入與提領，以快照間資金流中點估算；指數均以期初 100 正規化。
          </p>
          <select
            aria-label="比較基準"
            className="range-select"
            value={benchmark}
            onChange={(event) => onBenchmark(event.target.value as BenchmarkId)}
          >
            <option className="text-black" value="twii">
              臺灣加權指數
            </option>
            <option className="text-black" value="sp500">
              S&amp;P 500（SPY）
            </option>
            <option className="text-black" value="global">
              全球股票（VT）
            </option>
          </select>
        </div>

        {loading && !report ? (
          <div className="grid min-h-64 place-items-center text-sm text-white/45">
            <LoaderCircle className="mb-2 animate-spin" />
            正在計算績效…
          </div>
        ) : !hasPerformance || !report ? (
          <div className="mt-6 grid min-h-48 place-items-center rounded-2xl border border-dashed border-white/12 text-sm text-white/42">
            至少需要兩份期間內快照才能計算績效。
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-4 gap-2 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {[
                ["資金流調整報酬", metric(report.cumulativeReturnPct)],
                ["年化報酬", metric(report.annualizedReturnPct)],
                ["最大回撤", metric(report.maxDrawdownPct)],
                [
                  `超越 ${report.benchmarkName}`,
                  metric(report.excessReturnPct),
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-white/[.065] p-4">
                  <p className="text-[11px] text-white/42">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={report.series}
                  margin={{ top: 10, right: 8, bottom: 0, left: -12 }}
                >
                  <CartesianGrid
                    stroke="rgba(255,255,255,.07)"
                    strokeDasharray="3 5"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="capturedAt"
                    tickFormatter={shortDate}
                    tick={{ fill: "rgba(255,255,255,.38)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={42}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      valuesHidden ? "•••" : Number(value).toFixed(0)
                    }
                    tick={{ fill: "rgba(255,255,255,.35)", fontSize: 9 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      valuesHidden ? hiddenValue : Number(value).toFixed(2),
                      name === "portfolioIndex"
                        ? "投資組合"
                        : report.benchmarkName,
                    ]}
                    labelFormatter={(value) =>
                      new Date(String(value)).toLocaleDateString("zh-TW")
                    }
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid rgba(22,45,34,.1)",
                      background: "rgba(255,255,255,.97)",
                      color: "#183025",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="portfolioIndex"
                    name="portfolioIndex"
                    stroke="#d4f47c"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="benchmarkIndex"
                    name="benchmarkIndex"
                    stroke="#87b7ff"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/45">
              <span>
                期初資產{" "}
                {privateValue(valuesHidden, money(report.beginningValueTwd))}
              </span>
              <span>
                期末資產{" "}
                {privateValue(valuesHidden, money(report.endingValueTwd))}
              </span>
              <span>
                外部淨投入{" "}
                {privateValue(valuesHidden, money(report.externalNetFlowTwd))}
              </span>
              {report.benchmarkError && (
                <span className="text-[#ffd0c8]">{report.benchmarkError}</span>
              )}
              {report.calculationWarning && (
                <span className="text-[#ffe49a]">
                  {report.calculationWarning}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </details>
  );
}
