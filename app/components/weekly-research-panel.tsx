"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ResearchPreferences, WeeklyResearchReport } from "@/lib/types";
import { requestJson } from "@/lib/client-request";
import {
  allocationTooltipText,
  attributionChartData,
  concentrationMetrics,
  etfOverlapChartData,
  heldStockEventsByWeight,
  indexExposureMetrics,
  lookThroughExposureChartData,
  marketAllocationChartData,
  namedPercentTooltip,
  securityTypeAllocationChartData,
  topHoldingsChartData,
  weeklyPerformanceChartData,
} from "@/lib/research-chart-data";

const emptyPreferences: ResearchPreferences = {
  reportLanguage: "zh-TW",
  investmentGoal: null,
  investmentHorizon: null,
  riskTolerance: null,
  hasApiKey: false,
};
const attributionEffectLabels = {
  positive: "正向",
  negative: "負向",
  neutral: "中性",
  unknown: "無法判定",
};
const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--muted)",
];
const lookThroughColors = {
  direct: "#2563eb",
  indirect: "#f59e0b",
  leveraged: "#db2777",
};

const percentTooltip = (value: unknown): [string, string] => [
  `${Number(value ?? 0).toFixed(3)}%`,
  "占比",
];
type PieTooltipProps = {
  active?: boolean;
  payload?: Array<{
    value?: number | string;
    payload?: { name?: string };
  }>;
};

function MarketPieTooltip({ active, payload }: PieTooltipProps) {
  const item = payload?.[0];
  if (!active || !item) return null;
  return (
    <div className="rounded-lg border border-[#dce4dd] bg-[var(--surface)] px-3 py-2 text-sm shadow-sm dark:border-white/10">
      {allocationTooltipText(item.payload?.name, item.value)}
    </div>
  );
}

function PortfolioSnapshotCharts({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const marketData = marketAllocationChartData(evidence);
  const securityTypeData = securityTypeAllocationChartData(evidence);
  const holdingsData = topHoldingsChartData(evidence);
  const concentration = concentrationMetrics(evidence);
  if (
    marketData.length === 0 &&
    securityTypeData.length === 0 &&
    holdingsData.length === 0 &&
    concentration.length === 0
  )
    return null;
  return (
    <section className="mt-5" aria-label="投資組合配置圖表">
      {concentration.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {concentration.map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-[#f4f7ef] p-3 dark:bg-white/5"
            >
              <p className="text-xs text-[#718078]">{item.label} 集中度</p>
              <strong className="mt-1 block text-lg">{item.value}%</strong>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {marketData.length > 0 && (
          <figure className="rounded-xl border border-[#dce4dd] p-3 dark:border-white/10">
            <figcaption className="font-bold">市場占比</figcaption>
            <p className="text-xs text-[#718078]">證券部位內占比</p>
            <div className="h-64" aria-label="各市場證券部位占比圓環圖">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={marketData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="48%"
                    outerRadius="72%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {marketData.map((item, index) => (
                      <Cell
                        key={item.name}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<MarketPieTooltip />} />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </figure>
        )}
        {securityTypeData.length > 0 && (
          <figure className="rounded-xl border border-[#dce4dd] p-3 dark:border-white/10">
            <figcaption className="font-bold">資產類型占比</figcaption>
            <p className="text-xs text-[#718078]">股票、ETF 與基金配置</p>
            <div className="h-64" aria-label="各類型證券部位占比圓環圖">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={securityTypeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="48%"
                    outerRadius="72%"
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {securityTypeData.map((item, index) => (
                      <Cell
                        key={item.name}
                        fill={chartColors[index % chartColors.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<MarketPieTooltip />} />
                  <Legend verticalAlign="bottom" iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </figure>
        )}
        {holdingsData.length > 0 && (
          <figure className="rounded-xl border border-[#dce4dd] p-3 dark:border-white/10 lg:col-span-2">
            <figcaption className="font-bold">主要持倉</figcaption>
            <p className="text-xs text-[#718078]">
              前十大持倉；其餘標的合併為「其他」
            </p>
            <div
              style={{ height: Math.max(256, holdingsData.length * 30) }}
              aria-label="主要持倉占比水平長條圖"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={holdingsData}
                  layout="vertical"
                  margin={{ top: 8, right: 46, bottom: 8, left: 8 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--line)" />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={58}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip formatter={percentTooltip} />
                  <Bar
                    dataKey="value"
                    name="持倉占比"
                    fill="var(--chart-1)"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="value"
                      position="right"
                      formatter={(value: unknown) =>
                        `${Number(value).toFixed(3)}%`
                      }
                      fill="var(--foreground)"
                      fontSize={11}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
        )}
      </div>
    </section>
  );
}

function portfolioRiskChartData(evidence: Record<string, unknown>) {
  return {
    lookThrough: lookThroughExposureChartData(evidence),
    overlaps: etfOverlapChartData(evidence),
    indexExposure: indexExposureMetrics(evidence),
  };
}

function PortfolioRiskCharts({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const { lookThrough, overlaps, indexExposure } =
    portfolioRiskChartData(evidence);
  if (
    lookThrough.length === 0 &&
    overlaps.length === 0 &&
    indexExposure.length === 0
  )
    return null;
  return (
    <section className="mt-4 space-y-4" aria-label="投資組合穿透與重疊圖表">
      {indexExposure.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {indexExposure.map((item) => (
            <div
              key={item.label}
              className="rounded-xl bg-[#f4f7ef] p-3 dark:bg-white/5"
            >
              <p className="text-xs text-[#718078]">
                {item.label} 每日目標名目曝險
              </p>
              <strong className="mt-1 block text-lg">{item.value}%</strong>
            </div>
          ))}
        </div>
      )}
      {lookThrough.length > 0 && (
        <figure className="rounded-xl border border-[#dce4dd] p-3 dark:border-white/10">
          <figcaption className="font-bold">底層標的穿透曝險</figcaption>
          <p className="text-xs text-[#718078]">
            直接持有＋ETF 間接曝險＋槓桿 ETF 每日名目增額
          </p>
          <div
            style={{ height: Math.max(240, lookThrough.length * 42) }}
            aria-label="底層標的直接與間接曝險堆疊圖"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={lookThrough}
                layout="vertical"
                margin={{ top: 12, right: 52, bottom: 8, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={62}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={namedPercentTooltip} />
                <Legend />
                <Bar
                  dataKey="directPct"
                  name="直接持有"
                  stackId="exposure"
                  fill={lookThroughColors.direct}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="etfIndirectPct"
                  name="ETF 間接"
                  stackId="exposure"
                  fill={lookThroughColors.indirect}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="leveragedAdjustmentPct"
                  name="槓桿每日增額"
                  stackId="exposure"
                  fill={lookThroughColors.leveraged}
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
      {overlaps.length > 0 && (
        <figure className="rounded-xl border border-[#dce4dd] p-3 dark:border-white/10">
          <figcaption className="font-bold">ETF 重疊</figcaption>
          <p className="text-xs text-[#718078]">依共同成分權重估算</p>
          <div
            style={{ height: Math.max(200, overlaps.length * 46) }}
            aria-label="ETF 配對重疊比例圖"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overlaps}
                layout="vertical"
                margin={{ top: 12, right: 52, bottom: 8, left: 8 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--line)" />
                <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={108}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  formatter={(value, _name, entry) => [
                    `${Number(value ?? 0).toFixed(2)}%（${entry.payload.commonHoldingsCount} 檔共同持股）`,
                    "重疊比例",
                  ]}
                />
                <Bar
                  dataKey="value"
                  name="重疊比例"
                  fill="var(--chart-2)"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(value: unknown) => `${Number(value)}%`}
                    fill="var(--foreground)"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
      )}
    </section>
  );
}

function WeeklyPerformanceChart({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const data = weeklyPerformanceChartData(evidence);
  if (data.length === 0) return null;
  return (
    <figure className="mt-4 rounded-xl border border-[#dce4dd] p-3 dark:border-white/10">
      <figcaption className="font-bold">本週績效比較</figcaption>
      <p className="text-xs text-[#718078]">
        前一交易週最後收盤至本交易週最後收盤
      </p>
      <div
        style={{ height: Math.max(220, data.length * 42) }}
        aria-label="投資組合與市場基準本週績效比較圖"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 12, right: 52, bottom: 8, left: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--line)" />
            <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={122}
              tick={{ fontSize: 11 }}
            />
            <ReferenceLine x={0} stroke="var(--muted)" />
            <Tooltip
              formatter={(value) => [
                `${Number(value ?? 0) >= 0 ? "+" : ""}${Number(value ?? 0).toFixed(2)}%`,
                "週報酬",
              ]}
            />
            <Bar dataKey="value" name="週報酬" isAnimationActive={false}>
              {data.map((item) => (
                <Cell
                  key={item.name}
                  fill={
                    item.value >= 0
                      ? "var(--chart-positive)"
                      : "var(--chart-negative)"
                  }
                />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(value: unknown) => {
                  const number = Number(value);
                  return `${number >= 0 ? "+" : ""}${number}%`;
                }}
                fill="var(--foreground)"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function AttributionChart({ evidence }: { evidence: Record<string, unknown> }) {
  const data = attributionChartData(evidence);
  if (data.length === 0) return null;
  return (
    <figure className="mt-4 rounded-xl border border-[#dce4dd] p-3 dark:border-white/10">
      <figcaption className="font-bold">主要正負貢獻</figcaption>
      <p className="text-xs text-[#718078]">估算貢獻＝期初權重 × 週報酬</p>
      <div
        style={{ height: Math.max(220, data.length * 42) }}
        aria-label="主要持倉正負貢獻水平長條圖"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 12, right: 52, bottom: 8, left: 8 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--line)" />
            <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="name"
              width={62}
              tick={{ fontSize: 11 }}
            />
            <ReferenceLine x={0} stroke="var(--muted)" />
            <Tooltip
              formatter={(value, _name, entry) => [
                `${Number(value ?? 0) >= 0 ? "+" : ""}${Number(value ?? 0).toFixed(2)}%（期初權重 ${entry.payload.beginningWeightPct}%，週報酬 ${entry.payload.weeklyReturnPct}%）`,
                "估算貢獻",
              ]}
            />
            <Bar dataKey="value" name="估算貢獻" isAnimationActive={false}>
              {data.map((item) => (
                <Cell
                  key={item.name}
                  fill={
                    item.value >= 0
                      ? "var(--chart-positive)"
                      : "var(--chart-negative)"
                  }
                />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                formatter={(value: unknown) => {
                  const number = Number(value);
                  return `${number >= 0 ? "+" : ""}${number}%`;
                }}
                fill="var(--foreground)"
                fontSize={11}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

type StructuredSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
};

function evidenceSources(evidence: Record<string, unknown>) {
  if (!Array.isArray(evidence.researchSources)) return [];
  return evidence.researchSources.filter((value): value is StructuredSource => {
    if (!value || typeof value !== "object") return false;
    const source = value as Partial<StructuredSource>;
    if (
      typeof source.id !== "string" ||
      typeof source.title !== "string" ||
      typeof source.publisher !== "string" ||
      typeof source.url !== "string" ||
      !(typeof source.publishedAt === "string" || source.publishedAt === null)
    )
      return false;
    try {
      return new URL(source.url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

function SourceText({
  children,
  sources,
}: {
  children: string;
  sources: StructuredSource[];
}) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const parts = children.split(/(\[[A-Za-z0-9_-]+])/g);
  return parts.map((part, index): ReactNode => {
    const id = part.match(/^\[([A-Za-z0-9_-]+)]$/)?.[1];
    const source = id ? byId.get(id) : null;
    if (!source) return part;
    return (
      <a
        key={`${source.id}-${index}`}
        className="underline"
        href={source.url}
        target="_blank"
        rel="noreferrer"
        title={`${source.publisher}${source.publishedAt ? ` · ${source.publishedAt}` : ""}`}
      >
        [{source.title}]
      </a>
    );
  });
}

function WeeklyEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const structuredSources = evidenceSources(evidence);
  const allocation = (evidence.allocation ?? []) as Array<{
    market: string;
    symbol: string;
    weightPct: number;
    quoteAsOf?: string | null;
  }>;
  const watchlist = (evidence.watchlist ?? []) as Array<{
    market: string;
    symbol: string;
    quoteAsOf: string | null;
    status: string;
  }>;
  return (
    <details className="mt-7 rounded-xl border p-4 text-sm">
      <summary className="cursor-pointer font-bold">檢視當次使用的資料</summary>
      <p className="mt-3 font-semibold">持倉配置比例</p>
      {allocation.length === 0 ? (
        <p>沒有可計算的投資持倉。</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {allocation.map((item, index) => (
            <li key={`${item.market}-${item.symbol}-${index}`}>
              {item.market} {item.symbol}：{Number(item.weightPct).toFixed(3)}%
              （行情 {item.quoteAsOf?.slice(0, 10) ?? "日期不明"}）
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 font-semibold">自選行情</p>
      {watchlist.length === 0 ? (
        <p>沒有追蹤中的自選標的。</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {watchlist.map((item, index) => (
            <li key={`${item.market}-${item.symbol}-${index}`}>
              {item.market} {item.symbol}：{item.status}（
              {item.quoteAsOf?.slice(0, 10) ?? "無行情"}）
            </li>
          ))}
        </ul>
      )}
      {structuredSources.length > 0 && (
        <>
          <p className="mt-4 font-semibold">外部結構化來源</p>
          <ul className="mt-1 space-y-1">
            {structuredSources.map((source) => (
              <li key={source.id}>
                <a
                  className="underline"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title}
                </a>
                （{source.publisher}
                {source.publishedAt ? `，${source.publishedAt}` : ""}）
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}

export default function WeeklyResearchPanel({
  onKeyStatusChange,
}: {
  onKeyStatusChange?: (hasKey: boolean) => void;
}) {
  const [preferences, setPreferences] =
    useState<ResearchPreferences>(emptyPreferences);
  const [reports, setReports] = useState<WeeklyResearchReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected =
    reports.find((report) => report.id === selectedId) ?? reports[0];
  const selectedSources = selected ? evidenceSources(selected.evidence) : [];
  const selectedSecurityEvents = selected
    ? heldStockEventsByWeight(
        selected.content.securityEvents,
        selected.evidence,
      )
    : [];
  const selectedRiskCharts = selected
    ? portfolioRiskChartData(selected.evidence)
    : { lookThrough: [], overlaps: [], indexExposure: [] };
  const hasSelectedRiskCharts =
    selectedRiskCharts.lookThrough.length > 0 ||
    selectedRiskCharts.overlaps.length > 0 ||
    selectedRiskCharts.indexExposure.length > 0;
  const reload = useCallback(async () => {
    const [nextPreferences, nextReports] = await Promise.all([
      requestJson<ResearchPreferences>("/api/research-preferences"),
      requestJson<WeeklyResearchReport[]>("/api/weekly-reports"),
    ]);
    setPreferences(nextPreferences);
    setReports(nextReports);
    onKeyStatusChange?.(nextPreferences.hasApiKey);
  }, [onKeyStatusChange]);
  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson<ResearchPreferences>("/api/research-preferences"),
      requestJson<WeeklyResearchReport[]>("/api/weekly-reports"),
    ])
      .then(([nextPreferences, nextReports]) => {
        if (!active) return;
        setPreferences(nextPreferences);
        setReports(nextReports);
        onKeyStatusChange?.(nextPreferences.hasApiKey);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "週報載入失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onKeyStatusChange]);
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  };
  const generate = () =>
    run(async () => {
      if (!preferences.hasApiKey)
        throw new Error("尚未設定 OpenAI API Key，請先前往設定頁儲存");
      const report = await requestJson<WeeklyResearchReport>(
        "/api/weekly-reports",
        { method: "POST" },
      );
      await reload();
      setSelectedId(report.id);
    }, "研究週報已產生");
  if (loading)
    return (
      <div className="grid min-h-40 place-items-center">
        載入每週研究報告中…
      </div>
    );
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-xl font-bold">每週 AI 研究報告</h2>
        <p className="mt-2 text-sm text-[#59675f]">
          每週日
          07:00（台灣時間）自動產生。開發期間可手動產生；每次結果都會保存。
        </p>
        <p className="mt-2 text-sm text-[#59675f]">
          傳送至
          OpenAI：投資持倉比例、自選標的、公開行情，以及下方投資背景。不傳帳戶餘額、持倉數量或金額。API
          費用由你的金鑰所屬帳戶承擔。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="primary" disabled={busy} onClick={generate}>
            {busy ? "處理中…" : "立即產生報告"}
          </button>
          <span className="text-sm">
            {preferences.hasApiKey
              ? "API Key 已設定"
              : "尚未設定 OpenAI API Key"}
          </span>
        </div>
        {error && (
          <p role="alert" className="notice error mt-3">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice mt-3">
            {message}
          </p>
        )}
      </section>
      <section className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <h2 className="text-lg font-bold">歷次週報</h2>
          {reports.length === 0 && (
            <p className="rounded-xl border border-dashed p-5 text-sm">
              尚無每週報告。
            </p>
          )}
          {reports.map((report) => (
            <button
              key={report.id}
              className={`w-full rounded-xl border p-4 text-left ${selected?.id === report.id ? "border-[#75904f] bg-[#eef5dc]" : "border-[#dce4dd] bg-white dark:bg-white/5"}`}
              onClick={() => setSelectedId(report.id)}
            >
              <strong className="block">{report.weekStart} 當週</strong>
              <span className="text-xs">
                {new Date(report.generatedAt).toLocaleString("zh-TW")} ·{" "}
                {report.triggerType === "manual" ? "手動" : "排程"} ·{" "}
                {report.language}
              </span>
            </button>
          ))}
        </div>
        {selected && (
          <article className="rounded-2xl border border-[#dce4dd] bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm text-[#718078]">
              {selected.weekStart} 當週 · 資料截止{" "}
              {new Date(selected.periodEnd).toLocaleString("zh-TW")}
            </p>
            <h2 className="mt-3 text-2xl font-bold">Portfolio Snapshot</h2>
            <p className="mt-4 whitespace-pre-wrap leading-7">
              <SourceText sources={selectedSources}>
                {selected.content.portfolioSnapshot}
              </SourceText>
            </p>
            <PortfolioSnapshotCharts evidence={selected.evidence} />
            <h3 className="mt-7 text-lg font-bold">本週市場</h3>
            <p className="mt-2 whitespace-pre-wrap leading-7">
              <SourceText sources={selectedSources}>
                {selected.content.weeklyMarket}
              </SourceText>
            </p>
            <WeeklyPerformanceChart evidence={selected.evidence} />
            {selected.content.portfolioAttribution.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">
                  Portfolio Attribution
                </h3>
                <AttributionChart evidence={selected.evidence} />
                <ul className="mt-2 space-y-3">
                  {selected.content.portfolioAttribution.map((item, index) => (
                    <li
                      key={index}
                      className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                    >
                      <strong>
                        {item.driver} · {attributionEffectLabels[item.effect]}
                      </strong>
                      <p>
                        <SourceText sources={selectedSources}>
                          {item.explanation}
                        </SourceText>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {(selected.content.portfolioRisk.length > 0 ||
              hasSelectedRiskCharts) && (
              <>
                <h3 className="mt-7 text-lg font-bold">Portfolio Risk</h3>
                <PortfolioRiskCharts evidence={selected.evidence} />
                {selected.content.portfolioRisk.length > 0 && (
                  <ul className="mt-2 space-y-3">
                    {selected.content.portfolioRisk.map((item, index) => (
                      <li
                        key={index}
                        className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                      >
                        <strong>
                          <SourceText sources={selectedSources}>
                            {item.risk}
                          </SourceText>
                        </strong>
                        <p>
                          依據：
                          <SourceText sources={selectedSources}>
                            {item.evidence}
                          </SourceText>
                        </p>
                        <p className="text-sm">
                          應對：
                          <SourceText sources={selectedSources}>
                            {item.response}
                          </SourceText>
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {selectedSecurityEvents.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">個股重要事件</h3>
                <ul className="mt-2 space-y-3">
                  {selectedSecurityEvents.map((item, index) => (
                    <li
                      key={`${item.symbol}-${index}`}
                      className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                    >
                      <strong>{item.symbol}</strong>
                      <p>
                        <SourceText sources={selectedSources}>
                          {item.event}
                        </SourceText>
                      </p>
                      <p className="text-sm">
                        投資組合關聯：{item.portfolioRelevance}
                      </p>
                      <p className="text-sm text-[#805b4e]">
                        風險：{item.risk}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {selected.content.nextWeekWatch.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">下週觀察</h3>
                <ul className="mt-2 space-y-3">
                  {selected.content.nextWeekWatch.map((item, index) => (
                    <li
                      key={index}
                      className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                    >
                      <strong>{item.focus}</strong>
                      <p>
                        觀察條件：
                        <SourceText sources={selectedSources}>
                          {item.condition}
                        </SourceText>
                      </p>
                      <p className="text-sm">原因：{item.reason}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {selected.content.dataQuality.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">Data Quality</h3>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {selected.content.dataQuality.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            <WeeklyEvidence evidence={selected.evidence} />
          </article>
        )}
      </section>
    </div>
  );
}
