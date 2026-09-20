"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Check,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { requestJson } from "@/lib/client-request";
import WeeklyResearchPanel from "./weekly-research-panel";
import type {
  CandlePoint,
  ResearchPreferences,
  WatchlistItem,
} from "@/lib/types";

type ResearchTab = "watchlist" | "weekly";

const quoteNumber = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 4,
});

function QuoteCard({
  item,
  selected,
  onToggle,
  onOpenChart,
  onRemove,
}: {
  item: WatchlistItem;
  selected?: boolean;
  onToggle?: () => void;
  onOpenChart?: () => void;
  onRemove?: () => void;
}) {
  const change = Number(item.quote.changePercent ?? 0);
  const changeValue = Number(item.quote.changeValue);
  const changeClass =
    change > 0
      ? "research-quote-positive"
      : change < 0
        ? "research-quote-negative"
        : "research-quote-flat";
  const statusLabel =
    item.quote.status === "fresh"
      ? "最新"
      : item.quote.status === "missing"
        ? "無行情"
        : "待更新";
  return (
    <article
      className={`research-quote-card ${selected ? "selected" : ""} ${!item.enabled ? "disabled" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="research-quote-market">
            {item.market}
            <span>{item.held ? "持有" : "觀察"}</span>
          </p>
          <h3>{item.symbol}</h3>
          <p className="research-quote-name">{item.name}</p>
        </div>
        <span className={`research-quote-status ${item.quote.status}`}>
          {statusLabel}
        </span>
      </div>
      <div className="research-quote-value">
        <p>
          {item.quote.price == null
            ? "—"
            : quoteNumber.format(Number(item.quote.price))}
          <small>{item.quote.currency}</small>
        </p>
        <span className={changeClass}>
          {item.quote.changeValue != null && Number.isFinite(changeValue)
            ? quoteNumber.format(changeValue)
            : "—"}
          <b>
            {item.quote.changePercent == null
              ? "—"
              : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          </b>
        </span>
      </div>
      <div className="research-quote-footer">
        <time>
          {item.quote.quoteAsOf
            ? new Date(item.quote.quoteAsOf).toLocaleString("zh-TW", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "尚未更新"}
        </time>
        {(onToggle || onOpenChart || onRemove) && (
          <div>
            {onToggle && (
              <button className="research-card-action" onClick={onToggle}>
                {item.enabled ? <Check size={14} /> : <RotateCcw size={14} />}
                {item.enabled ? "追蹤中" : "重新追蹤"}
              </button>
            )}
            {onOpenChart && (
              <button
                className={`research-card-action ${selected ? "active" : ""}`}
                onClick={onOpenChart}
              >
                <BarChart3 size={14} />
                走勢
              </button>
            )}
            {onRemove && (
              <button className="research-card-action" onClick={onRemove}>
                移除
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function CandleShape(props: Record<string, unknown>) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const payload = props.payload as CandlePoint & { range: [number, number] };
  const spread = Math.max(payload.high - payload.low, 0.0001);
  const openY = y + ((payload.high - payload.open) / spread) * height;
  const closeY = y + ((payload.high - payload.close) / spread) * height;
  const up = payload.close >= payload.open;
  const color = up ? "#dc2626" : "#059669";
  const top = Math.min(openY, closeY);
  return (
    <g>
      <line
        x1={x + width / 2}
        x2={x + width / 2}
        y1={y}
        y2={y + height}
        stroke={color}
      />
      <rect
        x={x + width * 0.18}
        y={top}
        width={Math.max(width * 0.64, 1)}
        height={Math.max(Math.abs(closeY - openY), 1)}
        fill={color}
      />
    </g>
  );
}

type CandleChartPoint = CandlePoint & { range: [number, number] };
type ChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ payload: CandleChartPoint }>;
};

const chartNumber = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 2,
});

function CandleTooltip({ active, payload }: ChartTooltipProps) {
  const candle = payload?.[0]?.payload;
  if (!active || !candle) return null;
  return (
    <div className="research-chart-tooltip">
      <strong>{candle.date.slice(0, 10)}</strong>
      <div className="research-chart-tooltip-grid">
        <span>開盤</span>
        <b>{chartNumber.format(candle.open)}</b>
        <span>最高</span>
        <b>{chartNumber.format(candle.high)}</b>
        <span>最低</span>
        <b>{chartNumber.format(candle.low)}</b>
        <span>收盤</span>
        <b>{chartNumber.format(candle.close)}</b>
      </div>
    </div>
  );
}

function VolumeTooltip({ active, payload }: ChartTooltipProps) {
  const candle = payload?.[0]?.payload;
  if (!active || !candle) return null;
  return (
    <div className="research-chart-tooltip">
      <strong>{candle.date.slice(0, 10)}</strong>
      <p>成交量：{chartNumber.format(candle.volume)}</p>
    </div>
  );
}

function Kline({ candles }: { candles: CandlePoint[] }) {
  const data = candles.map((item) => ({
    ...item,
    range: [item.low, item.high],
  }));
  if (data.length === 0)
    return (
      <p className="rounded-xl bg-[#f4f7f4] p-4 text-sm text-[#718078]">
        目前無法取得 K 線。
      </p>
    );
  return (
    <div className="research-kline space-y-2">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 12, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => String(value).slice(5, 10)}
              minTickGap={24}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              domain={["auto", "auto"]}
              width={56}
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CandleTooltip />} />
            <Bar
              dataKey="range"
              shape={<CandleShape />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
          >
            <XAxis dataKey="date" hide />
            <YAxis hide />
            <Tooltip content={<VolumeTooltip />} />
            <Bar dataKey="volume" fill="#8aa59a" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WatchlistPanel({
  items,
  reload,
}: {
  items: WatchlistItem[];
  reload: () => Promise<void>;
}) {
  const [market, setMarket] = useState<"TWSE" | "TPEX" | "US">("TWSE");
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "TW" | "US">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<1 | 3 | 6 | 12>(3);
  const [chartBusy, setChartBusy] = useState(false);
  const [candles, setCandles] = useState<Record<string, CandlePoint[]>>({});

  const add = async () => {
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, symbol, origin: "manual" }),
      });
      setSymbol("");
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "新增標的失敗");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{
        failures: Array<{ symbol: string; reason: string }>;
      }>("/api/watchlist/refresh", { method: "POST" });
      if (result.failures.length > 0)
        setError(
          result.failures
            .map((item) => `${item.symbol}：${item.reason}`)
            .join("；"),
        );
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "行情更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: WatchlistItem) => {
    try {
      await requestJson(`/api/watchlist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新自選標的失敗");
    }
  };
  const remove = async (item: WatchlistItem) => {
    try {
      await requestJson(`/api/watchlist/${item.id}`, { method: "DELETE" });
      if (selectedId === item.id) setSelectedId(null);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移除自選標的失敗");
    }
  };

  const showKline = async (
    item: WatchlistItem,
    range: 1 | 3 | 6 | 12 = chartRange,
  ) => {
    setError("");
    setSelectedId(item.id);
    setChartRange(range);
    const cacheKey = `${item.id}:${range}`;
    if (candles[cacheKey]) return;
    setChartBusy(true);
    try {
      const result = await requestJson<{ candles: CandlePoint[] }>(
        `/api/watchlist/${item.id}/candles?range=${range}`,
      );
      setCandles((current) => ({
        ...current,
        [cacheKey]: result.candles,
      }));
    } catch (cause) {
      setSelectedId(null);
      setError(cause instanceof Error ? cause.message : "K 線取得失敗");
    } finally {
      setChartBusy(false);
    }
  };

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;
  const visibleItems = items.filter((item) => {
    const marketMatches =
      filter === "all" ||
      (filter === "US" ? item.market === "US" : item.market !== "US");
    const keyword = query.trim().toUpperCase();
    return (
      marketMatches &&
      (!keyword ||
        item.symbol.toUpperCase().includes(keyword) ||
        item.name.toUpperCase().includes(keyword))
    );
  });
  const enabledCount = items.filter((item) => item.enabled).length;
  const heldCount = items.filter((item) => item.held).length;
  const attentionCount = items.filter(
    (item) => item.quote.status !== "fresh",
  ).length;

  return (
    <div className="research-market-workspace">
      <section className="research-market-overview">
        <div>
          <p className="eyebrow">MARKET WATCH</p>
          <h2>我的觀察清單</h2>
          <p>聚焦持倉與研究標的，快速掌握價格、漲跌與技術走勢。</p>
        </div>
        <div className="research-market-metrics">
          <div>
            <span>追蹤中</span>
            <strong>{enabledCount}</strong>
          </div>
          <div>
            <span>目前持有</span>
            <strong>{heldCount}</strong>
          </div>
          <div>
            <span>需要更新</span>
            <strong>{attentionCount}</strong>
          </div>
        </div>
      </section>

      <section className="research-add-panel">
        <div className="research-add-copy">
          <strong>新增觀察標的</strong>
          <span>輸入單一股票或 ETF 代碼</span>
        </div>
        <div className="research-add-form">
          <label>
            <span className="sr-only">市場</span>
            <select
              className="field"
              value={market}
              onChange={(event) =>
                setMarket(event.target.value as typeof market)
              }
            >
              <option value="TWSE">TWSE</option>
              <option value="TPEX">TPEX</option>
              <option value="US">US</option>
            </select>
          </label>
          <label className="research-symbol-input">
            <span className="sr-only">標的代碼</span>
            <input
              className="field"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder={market === "US" ? "例如 AAPL" : "例如 2330"}
            />
          </label>
          <button
            className="primary"
            disabled={busy || !symbol.trim()}
            onClick={add}
          >
            <Plus size={16} />
            新增自選
          </button>
          <button
            className="secondary"
            disabled={busy || items.length === 0}
            onClick={refresh}
          >
            <RefreshCw className={busy ? "animate-spin" : ""} size={16} />
            更新行情
          </button>
        </div>
      </section>

      {error && <p className="notice error">{error}</p>}

      {selectedItem && (
        <section className="research-chart-panel">
          <header>
            <div>
              <p>
                {selectedItem.market} · {selectedItem.name}
              </p>
              <h3>{selectedItem.symbol} 技術走勢</h3>
            </div>
            <div className="research-chart-actions">
              <div aria-label="K 線期間">
                {([1, 3, 6, 12] as const).map((range) => (
                  <button
                    key={range}
                    className={chartRange === range ? "active" : ""}
                    disabled={chartBusy}
                    onClick={() => showKline(selectedItem, range)}
                  >
                    {range}月
                  </button>
                ))}
              </div>
              <button
                className="icon-button"
                aria-label="關閉 K 線"
                onClick={() => setSelectedId(null)}
              >
                <X size={16} />
              </button>
            </div>
          </header>
          {chartBusy ? (
            <div className="research-chart-loading">
              <LoaderCircle className="animate-spin" size={22} />
              正在取得走勢
            </div>
          ) : (
            <Kline
              candles={candles[`${selectedItem.id}:${chartRange}`] ?? []}
            />
          )}
        </section>
      )}

      <section className="research-list-section">
        <header className="research-list-toolbar">
          <div className="research-filter-tabs" aria-label="自選市場篩選">
            {(
              [
                ["all", "全部"],
                ["TW", "台股"],
                ["US", "美股"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
                <span>
                  {value === "all"
                    ? items.length
                    : items.filter((item) =>
                        value === "US"
                          ? item.market === "US"
                          : item.market !== "US",
                      ).length}
                </span>
              </button>
            ))}
          </div>
          <label className="research-watch-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋代碼或名稱"
            />
          </label>
        </header>
        {items.length === 0 ? (
          <p className="research-empty-state">目前沒有台美股自選標的。</p>
        ) : visibleItems.length === 0 ? (
          <p className="research-empty-state">找不到符合條件的標的。</p>
        ) : (
          <div className="research-quote-grid">
            {visibleItems.map((item) => (
              <QuoteCard
                key={item.id}
                item={item}
                selected={selectedId === item.id}
                onToggle={() => toggle(item)}
                onOpenChart={() => showKline(item)}
                onRemove={() => remove(item)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ResearchWorkspace() {
  const [tab, setTab] = useState<ResearchTab>("watchlist");
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const reload = useCallback(async () => {
    setError("");
    try {
      const nextWatchlist = await requestJson<WatchlistItem[]>(
        "/api/watchlist?includeRemoved=true",
      );
      setWatchlist(nextWatchlist);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "研究資料載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    requestJson<WatchlistItem[]>("/api/watchlist?includeRemoved=true")
      .then((nextWatchlist) => {
        if (!cancelled) setWatchlist(nextWatchlist);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "研究資料載入失敗");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    requestJson<ResearchPreferences>("/api/research-preferences")
      .then((value) => setHasApiKey(value.hasApiKey))
      .catch(() => setHasApiKey(null));
  }, []);

  const tabs = useMemo(
    () => [
      { id: "watchlist" as const, label: "行情面板", detail: "自選與走勢" },
      { id: "weekly" as const, label: "每週報告", detail: "AI 研究與建議" },
    ],
    [],
  );

  if (loading)
    return (
      <div className="grid min-h-64 place-items-center">
        <LoaderCircle className="animate-spin" />
      </div>
    );

  return (
    <div className="research-workspace">
      {error && <p className="notice error">{error}</p>}
      {hasApiKey === false && (
        <div className="notice">
          尚未設定 OpenAI API Key。
          <Link
            className="ml-2 underline"
            href="/settings#research-report-settings"
          >
            前往報告設定
          </Link>
        </div>
      )}
      <nav className="research-tabs" aria-label="投資研究分頁">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            aria-current={tab === item.id ? "page" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.id === "watchlist" ? (
              <BarChart3 size={15} />
            ) : (
              <FileText size={15} />
            )}
            <span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </span>
          </button>
        ))}
      </nav>
      {tab === "watchlist" && (
        <WatchlistPanel
          items={watchlist.filter((item) => !item.removedAt)}
          reload={reload}
        />
      )}
      {tab === "weekly" && (
        <WeeklyResearchPanel onKeyStatusChange={setHasApiKey} />
      )}
    </div>
  );
}
