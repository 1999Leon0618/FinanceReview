"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Archive,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
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
import { createResearchTemplate } from "@/lib/research-templates";
import type {
  CandlePoint,
  ResearchMarketScope,
  ResearchNote,
  ResearchNoteBlock,
  ResearchNoteType,
  ResearchSource,
  ResearchTodo,
  WatchlistItem,
} from "@/lib/types";

type ResearchTab = "watchlist" | "TW" | "US" | "todos";
type EditableSource = Omit<ResearchSource, "id" | "noteId" | "accessedAt"> & {
  id?: string;
  publishedLocal: string;
};
type EditorState = {
  id?: string;
  marketScope: ResearchMarketScope;
  noteType: ResearchNoteType;
  reportDate: string;
  tradingDate: string;
  asOf: string;
  title: string;
  subtitle: string;
  summary: string;
  noRelevantContent: boolean;
  document: { schemaVersion: 1; blocks: ResearchNoteBlock[] };
  sources: EditableSource[];
  expectedRevision?: number;
};

// Keep the map separate from generated labels so template titles stay deterministic.
const noteTypeLabel = (type: ResearchNoteType) =>
  type === "premarket"
    ? "盤前簡報"
    : type === "intraday"
      ? "盤中快報"
      : "盤後研究";

const taipeiDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => new Date(value).toISOString();
const newId = () => crypto.randomUUID();

function reportTitle(
  market: ResearchMarketScope,
  type: ResearchNoteType,
  day: string,
) {
  if (type === "intraday")
    return `盤中快報：${market === "TW" ? "台股" : "美股"}事件`;
  return `${day} ${market === "TW" ? "台股" : "美股"}${noteTypeLabel(type)}`;
}

function emptyEditor(
  marketScope: ResearchMarketScope,
  noteType: ResearchNoteType,
): EditorState {
  const day = taipeiDay();
  return {
    marketScope,
    noteType,
    reportDate: day,
    tradingDate: day,
    asOf: new Date().toISOString(),
    title: reportTitle(marketScope, noteType, day),
    subtitle: "",
    summary: "",
    noRelevantContent: false,
    document: createResearchTemplate(marketScope, noteType),
    sources: [],
  };
}

function noteEditor(note: ResearchNote): EditorState {
  return {
    id: note.id,
    marketScope: note.marketScope,
    noteType: note.noteType,
    reportDate: note.reportDate,
    tradingDate: note.tradingDate,
    asOf: note.asOf,
    title: note.title,
    subtitle: note.subtitle ?? "",
    summary: note.summary ?? "",
    noRelevantContent: note.noRelevantContent,
    document: note.document,
    sources: note.sources.map((source) => ({
      id: source.id,
      blockId: source.blockId,
      watchlistItemId: source.watchlistItemId,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
      publishedAt: source.publishedAt,
      publishedLocal: toLocalInput(source.publishedAt),
    })),
    expectedRevision: note.revision,
  };
}

function QuoteCard({ item }: { item: WatchlistItem }) {
  const change = Number(item.quote.changePercent ?? 0);
  return (
    <article className="rounded-2xl border border-[#dce4dd] bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#718078]">
            {item.market} · {item.held ? "持有" : "未持有"}
          </p>
          <h3 className="mt-1 text-lg font-bold">{item.symbol}</h3>
          <p className="text-xs text-[#718078]">{item.name}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.quote.status === "fresh" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
        >
          {item.quote.status === "missing" ? "無行情" : item.quote.status}
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold">
        {item.quote.price ?? "—"}{" "}
        <small className="text-xs">{item.quote.currency}</small>
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${change > 0 ? "text-red-600" : change < 0 ? "text-emerald-600" : "text-[#718078]"}`}
      >
        {item.quote.changeValue ?? "—"}（
        {item.quote.changePercent
          ? `${Number(item.quote.changePercent).toFixed(2)}%`
          : "—"}
        ）
      </p>
      <p className="mt-3 text-[11px] text-[#849088]">
        {item.quote.quoteAsOf
          ? new Date(item.quote.quoteAsOf).toLocaleString("zh-TW")
          : "尚未更新"}
      </p>
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
  const [expanded, setExpanded] = useState<string | null>(null);
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
      await requestJson("/api/watchlist/refresh", { method: "POST" });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "行情更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: WatchlistItem) => {
    await requestJson(`/api/watchlist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    await reload();
  };

  const showKline = async (item: WatchlistItem) => {
    if (expanded === item.id) return setExpanded(null);
    setError("");
    setExpanded(item.id);
    if (candles[item.id]) return;
    try {
      const result = await requestJson<{ candles: CandlePoint[] }>(
        `/api/watchlist/${item.id}/candles?range=3`,
      );
      setCandles((current) => ({ ...current, [item.id]: result.candles }));
    } catch (cause) {
      setExpanded(null);
      setError(cause instanceof Error ? cause.message : "K 線取得失敗");
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-32 text-xs font-semibold">
            市場
            <select
              className="field mt-2"
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
          <label className="min-w-48 flex-1 text-xs font-semibold">
            標的代碼
            <input
              className="field mt-2"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value.toUpperCase())}
              placeholder="2330、0050、AAPL"
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
            刷新自選行情
          </button>
        </div>
        <p className="mt-3 text-xs text-[#718078]">
          持倉與額外自選會在投資頁「更新全部行情」時一併更新；此按鈕只刷新快取，不建立資產快照。
        </p>
        {error && <p className="notice error mt-4">{error}</p>}
      </section>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#cdd8d0] p-10 text-center text-sm text-[#718078]">
          目前沒有台美股自選標的。
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className={!item.enabled ? "opacity-60" : ""}>
              <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                <QuoteCard item={item} />
                <div className="flex gap-2 lg:flex-col lg:justify-center">
                  <button className="secondary" onClick={() => toggle(item)}>
                    {item.enabled ? (
                      <Check size={15} />
                    ) : (
                      <RotateCcw size={15} />
                    )}
                    {item.enabled ? "追蹤中" : "重新追蹤"}
                  </button>
                  <button className="secondary" onClick={() => showKline(item)}>
                    <BarChart3 size={15} />K 線{" "}
                    {expanded === item.id ? (
                      <ChevronUp size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </button>
                </div>
              </div>
              {expanded === item.id && (
                <div className="mt-3 rounded-2xl border border-[#dce4dd] bg-white p-4 dark:border-white/10 dark:bg-white/5">
                  <Kline candles={candles[item.id] ?? []} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportPreview({ note }: { note: ResearchNote }) {
  const snapshots = new Map(
    note.quoteSnapshots.map((item) => [item.blockId, item]),
  );
  return (
    <article className="rounded-3xl border border-[#e3dfd4] bg-[#fbfaf5] p-6 shadow-sm dark:border-white/10 dark:bg-white/5 md:p-9">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-[#98483e]">
        {note.marketScope === "TW" ? "台股" : "美股"}
        {noteTypeLabel(note.noteType)} · {note.tradingDate}
      </p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight">{note.title}</h2>
      {note.subtitle && <p className="mt-3 text-[#68746d]">{note.subtitle}</p>}
      {note.summary && (
        <p className="mt-5 rounded-xl bg-[#dceff1] p-4 leading-7">
          {note.summary}
        </p>
      )}
      {note.noRelevantContent && (
        <p className="mt-5 rounded-xl bg-amber-50 p-4 font-semibold text-amber-800">
          今日無相關內容
        </p>
      )}
      <div className="mt-8 space-y-7">
        {note.document.blocks.map((block) => {
          if (block.type === "metric-grid")
            return (
              <div
                key={block.id}
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              >
                {block.items.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="rounded-xl bg-[#f3dedd] p-4"
                  >
                    <p className="text-xs text-[#98483e]">{item.label}</p>
                    <strong className="mt-2 block text-xl">{item.value}</strong>
                    {item.detail && (
                      <p className="mt-1 text-xs text-[#6f6964]">
                        {item.detail}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          if (block.type === "callout")
            return (
              <div key={block.id} className="rounded-xl bg-[#dceff1] p-5">
                <p className="mb-2 text-xs font-bold text-[#315f66]">
                  {block.label}
                </p>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {block.markdown}
                </ReactMarkdown>
              </div>
            );
          if (block.type === "markdown")
            return (
              <div key={block.id} className="research-markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {block.markdown}
                </ReactMarkdown>
              </div>
            );
          const snapshot = snapshots.get(block.id);
          if (!snapshot)
            return (
              <p key={block.id} className="notice">
                引用行情尚未保存。
              </p>
            );
          const item: WatchlistItem = {
            id: snapshot.watchlistItemId,
            securityId: "",
            providerSymbol: snapshot.symbol,
            market: snapshot.market,
            symbol: snapshot.symbol,
            name: snapshot.name,
            securityType: "stock",
            quoteCurrency: snapshot.currency,
            origin: "report",
            enabled: true,
            held: false,
            quote: snapshot,
            createdAt: "",
            updatedAt: "",
          };
          return (
            <div key={block.id}>
              {block.noRelevantContent && (
                <p className="mb-2 text-sm text-[#718078]">
                  此標的今日無相關內容
                </p>
              )}
              {snapshot.view === "kline" ? (
                <Kline candles={snapshot.candles} />
              ) : (
                <QuoteCard item={item} />
              )}
            </div>
          );
        })}
      </div>
      <section className="mt-10 border-t border-[#cbbfb3] pt-6">
        <h3 className="font-bold">來源</h3>
        {note.sources.length === 0 ? (
          <p className="mt-2 text-sm text-[#718078]">尚未加入來源。</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {note.sources.map((source) => (
              <li key={source.id}>
                <a
                  className="underline"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.publisher}：{source.title}
                </a>
                <span className="ml-2 text-xs text-[#718078]">
                  {source.publishedAt.slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-6 text-xs text-[#849088]">
        資料截止 {new Date(note.asOf).toLocaleString("zh-TW")} · 修訂{" "}
        {note.revision}
      </p>
    </article>
  );
}

function ReportEditor({
  state,
  watchlist,
  onCancel,
  onSaved,
}: {
  state: EditorState;
  watchlist: WatchlistItem[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const markdownIndex = form.document.blocks.findIndex(
    (block) => block.type === "markdown",
  );
  const calloutIndex = form.document.blocks.findIndex(
    (block) => block.type === "callout",
  );
  const metricIndex = form.document.blocks.findIndex(
    (block) => block.type === "metric-grid",
  );
  const markdown =
    markdownIndex >= 0
      ? (
          form.document.blocks[markdownIndex] as Extract<
            ResearchNoteBlock,
            { type: "markdown" }
          >
        ).markdown
      : "";
  const callout =
    calloutIndex >= 0
      ? (
          form.document.blocks[calloutIndex] as Extract<
            ResearchNoteBlock,
            { type: "callout" }
          >
        ).markdown
      : "";
  const metrics =
    metricIndex >= 0
      ? (
          form.document.blocks[metricIndex] as Extract<
            ResearchNoteBlock,
            { type: "metric-grid" }
          >
        ).items
      : [];
  const updateBlock = (index: number, block: ResearchNoteBlock) =>
    setForm((current) => ({
      ...current,
      document: {
        ...current.document,
        blocks: current.document.blocks.map((item, itemIndex) =>
          itemIndex === index ? block : item,
        ),
      },
    }));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const payload = {
        ...form,
        subtitle: form.subtitle || null,
        summary: form.summary || null,
        sources: form.sources.map(({ publishedLocal, ...source }) => ({
          ...source,
          publishedAt: fromLocalInput(publishedLocal),
        })),
      };
      await requestJson(
        form.id ? `/api/research-notes/${form.id}` : "/api/research-notes",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "研究報告儲存失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#15251f]/70 p-3 md:p-8">
      <section className="mx-auto max-w-5xl rounded-3xl bg-[#f7f8f5] p-5 shadow-2xl dark:bg-[#14241e] md:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">RESEARCH REPORT</p>
            <h2 className="text-2xl font-bold">
              {form.id ? "編輯研究報告" : `新增${noteTypeLabel(form.noteType)}`}
            </h2>
          </div>
          <button className="icon-button" aria-label="關閉" onClick={onCancel}>
            <X size={18} />
          </button>
        </header>
        {error && <p className="notice error mt-4">{error}</p>}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <label className="text-xs font-semibold">
            市場
            <select
              className="field mt-2"
              value={form.marketScope}
              onChange={(event) =>
                setForm({
                  ...form,
                  marketScope: event.target.value as ResearchMarketScope,
                })
              }
            >
              <option value="TW">台股</option>
              <option value="US">美股</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            類型
            <select
              className="field mt-2"
              value={form.noteType}
              onChange={(event) =>
                setForm({
                  ...form,
                  noteType: event.target.value as ResearchNoteType,
                })
              }
            >
              <option value="premarket">盤前簡報</option>
              <option value="intraday">盤中快報</option>
              <option value="postmarket">盤後研究</option>
            </select>
          </label>
          <label className="text-xs font-semibold">
            報告日期（台北）
            <input
              className="field mt-2"
              type="date"
              value={form.reportDate}
              onChange={(event) =>
                setForm({ ...form, reportDate: event.target.value })
              }
            />
          </label>
          <label className="text-xs font-semibold">
            市場交易日期
            <input
              className="field mt-2"
              type="date"
              value={form.tradingDate}
              onChange={(event) =>
                setForm({
                  ...form,
                  tradingDate: event.target.value,
                })
              }
            />
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold">
            標題
            <input
              className="field mt-2"
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
            />
          </label>
          <label className="text-xs font-semibold">
            資料截止時間
            <input
              className="field mt-2"
              type="datetime-local"
              value={toLocalInput(form.asOf)}
              onChange={(event) =>
                setForm({ ...form, asOf: fromLocalInput(event.target.value) })
              }
            />
          </label>
        </div>
        <label className="mt-4 block text-xs font-semibold">
          副標
          <input
            className="field mt-2"
            value={form.subtitle}
            onChange={(event) =>
              setForm({ ...form, subtitle: event.target.value })
            }
          />
        </label>
        <label className="mt-4 block text-xs font-semibold">
          摘要
          <textarea
            className="field mt-2 min-h-20"
            value={form.summary}
            onChange={(event) =>
              setForm({ ...form, summary: event.target.value })
            }
          />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.noRelevantContent}
            onChange={(event) =>
              setForm({ ...form, noRelevantContent: event.target.checked })
            }
          />
          整份報告今日無相關內容
        </label>

        <section className="mt-7 rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">關鍵數字卡</h3>
            <button
              className="secondary"
              disabled={metrics.length >= 6}
              onClick={() => {
                const next = { label: "指標", value: "—", detail: "" };
                if (metricIndex >= 0)
                  updateBlock(metricIndex, {
                    ...(form.document.blocks[metricIndex] as Extract<
                      ResearchNoteBlock,
                      { type: "metric-grid" }
                    >),
                    items: [...metrics, next],
                  });
                else
                  setForm({
                    ...form,
                    document: {
                      ...form.document,
                      blocks: [
                        { id: newId(), type: "metric-grid", items: [next] },
                        ...form.document.blocks,
                      ],
                    },
                  });
              }}
            >
              <Plus size={14} />
              新增
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {metrics.map((metric, index) => (
              <div
                key={index}
                className="grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto]"
              >
                <input
                  className="field"
                  value={metric.label}
                  onChange={(event) =>
                    updateBlock(metricIndex, {
                      ...(form.document.blocks[metricIndex] as Extract<
                        ResearchNoteBlock,
                        { type: "metric-grid" }
                      >),
                      items: metrics.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <input
                  className="field"
                  value={metric.value}
                  onChange={(event) =>
                    updateBlock(metricIndex, {
                      ...(form.document.blocks[metricIndex] as Extract<
                        ResearchNoteBlock,
                        { type: "metric-grid" }
                      >),
                      items: metrics.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <input
                  className="field"
                  value={metric.detail ?? ""}
                  onChange={(event) =>
                    updateBlock(metricIndex, {
                      ...(form.document.blocks[metricIndex] as Extract<
                        ResearchNoteBlock,
                        { type: "metric-grid" }
                      >),
                      items: metrics.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, detail: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <button
                  className="icon-button"
                  aria-label="移除數字卡"
                  onClick={() => {
                    if (metrics.length === 1) {
                      setForm({
                        ...form,
                        document: {
                          ...form.document,
                          blocks: form.document.blocks.filter(
                            (_, blockIndex) => blockIndex !== metricIndex,
                          ),
                        },
                      });
                      return;
                    }
                    updateBlock(metricIndex, {
                      ...(form.document.blocks[metricIndex] as Extract<
                        ResearchNoteBlock,
                        { type: "metric-grid" }
                      >),
                      items: metrics.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    });
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <label className="mt-6 block text-xs font-semibold">
          今日定調／前瞻
          <textarea
            className="field mt-2 min-h-24"
            value={callout}
            onChange={(event) =>
              calloutIndex >= 0 &&
              updateBlock(calloutIndex, {
                ...(form.document.blocks[calloutIndex] as Extract<
                  ResearchNoteBlock,
                  { type: "callout" }
                >),
                markdown: event.target.value,
              })
            }
          />
        </label>
        <label className="mt-6 block text-xs font-semibold">
          研究內容（Markdown）
          <textarea
            className="field mt-2 min-h-80 font-mono text-sm"
            value={markdown}
            onChange={(event) =>
              markdownIndex >= 0 &&
              updateBlock(markdownIndex, {
                ...(form.document.blocks[markdownIndex] as Extract<
                  ResearchNoteBlock,
                  { type: "markdown" }
                >),
                markdown: event.target.value,
              })
            }
          />
        </label>

        <section className="mt-7 rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold">自選標的卡片</h3>
            <div className="flex gap-2">
              <select id="research-watchstock" className="field min-w-48">
                <option value="">選擇標的</option>
                {watchlist.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.market} {item.symbol} {item.name}
                  </option>
                ))}
              </select>
              <select id="research-watchstock-view" className="field">
                <option value="card">card</option>
                <option value="kline">kline</option>
              </select>
              <button
                className="secondary"
                onClick={() => {
                  const itemId = (
                    globalThis.document.getElementById(
                      "research-watchstock",
                    ) as unknown as HTMLSelectElement
                  ).value;
                  const view = (
                    globalThis.document.getElementById(
                      "research-watchstock-view",
                    ) as unknown as HTMLSelectElement
                  ).value as "card" | "kline";
                  if (itemId)
                    setForm({
                      ...form,
                      document: {
                        ...form.document,
                        blocks: [
                          ...form.document.blocks,
                          {
                            id: newId(),
                            type: "watchstock",
                            watchlistItemId: itemId,
                            view,
                          },
                        ],
                      },
                    });
                }}
              >
                <Plus size={14} />
                插入
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {form.document.blocks
              .filter((block) => block.type === "watchstock")
              .map((block) => {
                const target = watchlist.find(
                  (item) =>
                    item.id ===
                    (
                      block as Extract<
                        ResearchNoteBlock,
                        { type: "watchstock" }
                      >
                    ).watchlistItemId,
                );
                return (
                  <div
                    key={block.id}
                    className="flex items-center justify-between rounded-xl bg-[#f4f7f4] p-3 text-sm dark:bg-white/5"
                  >
                    <div>
                      <span>
                        {target
                          ? `${target.market} ${target.symbol} ${target.name}`
                          : "標的不存在"}{" "}
                        ·{" "}
                        {(
                          block as Extract<
                            ResearchNoteBlock,
                            { type: "watchstock" }
                          >
                        ).view ?? "card"}
                      </span>
                      <label className="mt-2 flex items-center gap-2 text-xs text-[#718078]">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            (
                              block as Extract<
                                ResearchNoteBlock,
                                { type: "watchstock" }
                              >
                            ).noRelevantContent,
                          )}
                          onChange={(event) => {
                            const blockIndex = form.document.blocks.findIndex(
                              (item) => item.id === block.id,
                            );
                            updateBlock(blockIndex, {
                              ...(block as Extract<
                                ResearchNoteBlock,
                                { type: "watchstock" }
                              >),
                              noRelevantContent: event.target.checked,
                            });
                          }}
                        />
                        此標的今日無相關內容
                      </label>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() =>
                        setForm({
                          ...form,
                          document: {
                            ...form.document,
                            blocks: form.document.blocks.filter(
                              (item) => item.id !== block.id,
                            ),
                          },
                        })
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                );
              })}
          </div>
        </section>

        <section className="mt-7 rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">結構化來源</h3>
            <button
              className="secondary"
              onClick={() =>
                setForm({
                  ...form,
                  sources: [
                    ...form.sources,
                    {
                      title: "",
                      publisher: "",
                      url: "",
                      publishedAt: "",
                      publishedLocal: toLocalInput(form.asOf),
                      blockId: null,
                      watchlistItemId: null,
                    },
                  ],
                })
              }
            >
              <Plus size={14} />
              新增來源
            </button>
          </div>
          <div className="mt-4 space-y-4">
            {form.sources.map((source, index) => (
              <div
                key={source.id ?? index}
                className="grid gap-2 rounded-xl bg-[#f4f7f4] p-3 dark:bg-white/5 md:grid-cols-2"
              >
                <input
                  className="field"
                  placeholder="來源標題"
                  value={source.title}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sources: form.sources.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <input
                  className="field"
                  placeholder="媒體"
                  value={source.publisher}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sources: form.sources.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, publisher: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <input
                  className="field"
                  type="url"
                  placeholder="https://"
                  value={source.url}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sources: form.sources.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, url: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <select
                  className="field"
                  aria-label="來源關聯標的"
                  value={source.watchlistItemId ?? ""}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      sources: form.sources.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              watchlistItemId: event.target.value || null,
                            }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="">不關聯標的</option>
                  {watchlist.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.market} {item.symbol} {item.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="field flex-1"
                    type="datetime-local"
                    value={source.publishedLocal}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        sources: form.sources.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, publishedLocal: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    className="icon-button"
                    aria-label="移除來源"
                    onClick={() =>
                      setForm({
                        ...form,
                        sources: form.sources.filter(
                          (_, itemIndex) => itemIndex !== index,
                        ),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-8 flex justify-end gap-3 border-t border-[#dce4dd] pt-5">
          <button className="secondary" onClick={onCancel}>
            取消
          </button>
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            儲存研究報告
          </button>
        </footer>
      </section>
    </div>
  );
}

function ReportsPanel({
  market,
  notes,
  watchlist,
  reload,
}: {
  market: ResearchMarketScope;
  notes: ResearchNote[];
  watchlist: WatchlistItem[];
  reload: () => Promise<void>;
}) {
  const marketNotes = notes.filter((note) => note.marketScope === market);
  const [selected, setSelected] = useState<string | null>(
    marketNotes[0]?.id ?? null,
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const current =
    marketNotes.find((note) => note.id === selected) ?? marketNotes[0];
  const archive = async (note: ResearchNote) => {
    await requestJson(`/api/research-notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !note.archivedAt }),
    });
    await reload();
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {(["premarket", "intraday", "postmarket"] as ResearchNoteType[]).map(
          (type) => (
            <button
              key={type}
              className="primary"
              onClick={() => setEditor(emptyEditor(market, type))}
            >
              <Plus size={15} />
              新增{noteTypeLabel(type)}
            </button>
          ),
        )}
      </div>
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          {marketNotes.length === 0 ? (
            <p className="rounded-xl border border-dashed p-5 text-sm text-[#718078]">
              尚無研究報告。
            </p>
          ) : (
            marketNotes.map((note) => (
              <button
                key={note.id}
                className={`w-full rounded-xl border p-4 text-left ${current?.id === note.id ? "border-[#75904f] bg-[#eef5dc]" : "border-[#dce4dd] bg-white dark:border-white/10 dark:bg-white/5"}`}
                onClick={() => setSelected(note.id)}
              >
                <p className="text-xs font-bold text-[#718078]">
                  {note.tradingDate} · {noteTypeLabel(note.noteType)}
                </p>
                <strong className="mt-1 block line-clamp-2">
                  {note.title}
                </strong>
              </button>
            ))
          )}
        </aside>
        <div>
          {current ? (
            <>
              <div className="mb-3 flex justify-end gap-2">
                <button
                  className="secondary"
                  onClick={() => setEditor(noteEditor(current))}
                >
                  <FileText size={15} />
                  編輯
                </button>
                <button className="secondary" onClick={() => archive(current)}>
                  {current.archivedAt ? (
                    <RotateCcw size={15} />
                  ) : (
                    <Archive size={15} />
                  )}
                  {current.archivedAt ? "還原" : "封存"}
                </button>
              </div>
              <ReportPreview note={current} />
            </>
          ) : (
            <div className="rounded-2xl border border-dashed p-16 text-center text-[#718078]">
              建立第一份{market === "TW" ? "台股" : "美股"}研究報告。
            </div>
          )}
        </div>
      </div>
      {editor && (
        <ReportEditor
          state={editor}
          watchlist={watchlist}
          onCancel={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function TodosPanel({
  todos,
  notes,
  watchlist,
  reload,
}: {
  todos: ResearchTodo[];
  notes: ResearchNote[];
  watchlist: WatchlistItem[];
  reload: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [market, setMarket] = useState<ResearchMarketScope>("TW");
  const [requiresNote, setRequiresNote] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const create = async () => {
    setError("");
    try {
      await requestJson("/api/research-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketScope: market,
          title,
          details: details.trim() || null,
          scheduledFor: scheduledLocal ? fromLocalInput(scheduledLocal) : null,
          requiresNote,
          watchlistItemIds: selectedItemIds,
        }),
      });
      setTitle("");
      setDetails("");
      setScheduledLocal("");
      setSelectedItemIds([]);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "待辦建立失敗");
    }
  };
  const update = async (
    todo: ResearchTodo,
    status: "open" | "completed",
    noteId?: string | null,
  ) => {
    setError("");
    setBusyId(todo.id);
    try {
      const body: { status: "open" | "completed"; noteId?: string | null } = {
        status,
      };
      if (noteId !== undefined) body.noteId = noteId;
      await requestJson(`/api/research-todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "待辦更新失敗");
    } finally {
      setBusyId(null);
    }
  };
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <div className="grid gap-3 md:grid-cols-[140px_1fr_auto]">
          <select
            className="field"
            value={market}
            onChange={(event) => {
              setMarket(event.target.value as ResearchMarketScope);
              setSelectedItemIds([]);
            }}
          >
            <option value="TW">台股</option>
            <option value="US">美股</option>
          </select>
          <input
            className="field"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="要查證的事件或研究事項"
          />
          <button className="primary" disabled={!title.trim()} onClick={create}>
            <Plus size={15} />
            新增待辦
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <textarea
            className="field min-h-20"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            placeholder="事件細節、查證方向或完成條件（選填）"
          />
          <label className="text-xs font-semibold">
            預定時間（選填）
            <input
              className="field mt-2"
              type="datetime-local"
              value={scheduledLocal}
              onChange={(event) => setScheduledLocal(event.target.value)}
            />
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold">關聯標的（選填）</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {watchlist
              .filter((item) =>
                market === "US" ? item.market === "US" : item.market !== "US",
              )
              .map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedItemIds.includes(item.id)}
                    onChange={(event) =>
                      setSelectedItemIds((current) =>
                        event.target.checked
                          ? [...current, item.id]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                  {item.symbol} {item.name}
                </label>
              ))}
            {watchlist.every((item) =>
              market === "US" ? item.market !== "US" : item.market === "US",
            ) && <span className="text-xs text-[#718078]">尚無可關聯標的</span>}
          </div>
        </fieldset>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiresNote}
            onChange={(event) => setRequiresNote(event.target.checked)}
          />
          完成前必須關聯研究報告
        </label>
        {error && <p className="notice error mt-3">{error}</p>}
      </section>
      <div className="space-y-3">
        {todos.map((todo) => (
          <article
            key={todo.id}
            className={`rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5 ${todo.status === "completed" ? "opacity-65" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#718078]">
                  {todo.marketScope === "TW" ? "台股" : "美股"} ·{" "}
                  {todo.requiresNote ? "需產出研究" : "一般待辦"}
                </p>
                <h3 className="mt-1 font-bold">{todo.title}</h3>
                {todo.details && (
                  <p className="mt-2 text-sm text-[#59675f]">{todo.details}</p>
                )}
                {todo.scheduledFor && (
                  <p className="mt-2 text-xs text-[#718078]">
                    預定：{new Date(todo.scheduledFor).toLocaleString("zh-TW")}
                  </p>
                )}
                {todo.watchlistItemIds.length > 0 && (
                  <p className="mt-1 text-xs text-[#718078]">
                    標的：
                    {todo.watchlistItemIds
                      .map(
                        (id) =>
                          watchlist.find((item) => item.id === id)?.symbol ??
                          id,
                      )
                      .join("、")}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-[#eef5dc] px-2 py-1 text-xs">
                {todo.status === "open" ? "待處理" : "已完成"}
              </span>
            </div>
            {todo.requiresNote && (
              <label className="mt-4 block text-xs font-semibold">
                關聯研究報告
                <select
                  className="field mt-2"
                  disabled={busyId === todo.id}
                  value={todo.noteId ?? ""}
                  onChange={(event) =>
                    update(todo, todo.status, event.target.value || null)
                  }
                >
                  <option value="">尚未關聯</option>
                  {notes
                    .filter(
                      (note) =>
                        note.marketScope === todo.marketScope &&
                        !note.archivedAt,
                    )
                    .map((note) => (
                      <option key={note.id} value={note.id}>
                        {note.tradingDate} {note.title}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="mt-4">
              <button
                className="secondary"
                disabled={busyId === todo.id}
                onClick={() =>
                  update(todo, todo.status === "open" ? "completed" : "open")
                }
              >
                {todo.status === "open" ? (
                  <Check size={15} />
                ) : (
                  <RotateCcw size={15} />
                )}
                {todo.status === "open" ? "標記完成" : "重新開啟"}
              </button>
            </div>
          </article>
        ))}
        {todos.length === 0 && (
          <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-[#718078]">
            目前沒有研究待辦。
          </p>
        )}
      </div>
    </div>
  );
}

export default function ResearchWorkspace() {
  const [tab, setTab] = useState<ResearchTab>("watchlist");
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [notes, setNotes] = useState<ResearchNote[]>([]);
  const [todos, setTodos] = useState<ResearchTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setError("");
    try {
      const [nextWatchlist, nextNotes, nextTodos] = await Promise.all([
        requestJson<WatchlistItem[]>("/api/watchlist"),
        requestJson<ResearchNote[]>("/api/research-notes?archived=true"),
        requestJson<ResearchTodo[]>("/api/research-todos"),
      ]);
      setWatchlist(nextWatchlist);
      setNotes(nextNotes);
      setTodos(nextTodos);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "研究資料載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requestJson<WatchlistItem[]>("/api/watchlist"),
      requestJson<ResearchNote[]>("/api/research-notes?archived=true"),
      requestJson<ResearchTodo[]>("/api/research-todos"),
    ])
      .then(([nextWatchlist, nextNotes, nextTodos]) => {
        if (cancelled) return;
        setWatchlist(nextWatchlist);
        setNotes(nextNotes);
        setTodos(nextTodos);
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
  const tabs = useMemo(
    () => [
      { id: "watchlist" as const, label: "行情面板" },
      { id: "TW" as const, label: "台股研究" },
      { id: "US" as const, label: "美股研究" },
      { id: "todos" as const, label: "待辦" },
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
    <div className="space-y-6">
      {error && <p className="notice error">{error}</p>}
      <nav
        className="flex gap-2 overflow-x-auto border-b border-[#dce4dd] pb-3"
        aria-label="投資研究分頁"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            className={
              tab === item.id
                ? "primary whitespace-nowrap"
                : "secondary whitespace-nowrap"
            }
            onClick={() => setTab(item.id)}
          >
            {item.id === "watchlist" ? (
              <BarChart3 size={15} />
            ) : item.id === "todos" ? (
              <Check size={15} />
            ) : (
              <FileText size={15} />
            )}
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "watchlist" && (
        <WatchlistPanel items={watchlist} reload={reload} />
      )}
      {tab === "TW" && (
        <ReportsPanel
          market="TW"
          notes={notes}
          watchlist={watchlist}
          reload={reload}
        />
      )}
      {tab === "US" && (
        <ReportsPanel
          market="US"
          notes={notes}
          watchlist={watchlist}
          reload={reload}
        />
      )}
      {tab === "todos" && (
        <TodosPanel
          todos={todos}
          notes={notes}
          watchlist={watchlist}
          reload={reload}
        />
      )}
    </div>
  );
}
