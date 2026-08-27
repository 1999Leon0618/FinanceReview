"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Archive,
  Banknote,
  Building2,
  CheckCircle2,
  Download,
  Landmark,
  LoaderCircle,
  Plus,
  Sparkles,
  TrendingUp,
  Upload,
  WalletCards,
} from "lucide-react";
import {
  SaleDialog,
  SnapshotEditor,
  SoldHistoryDialog,
} from "@/components/finance-dashboard";
import type { DashboardData, PositionView, SaleView } from "@/lib/types";

const twd = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });
const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
});
const money = (value?: string | null) => `NT$${twd.format(Number(value ?? 0))}`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error ?? "操作失敗");
  return body as T;
}

export default function FinanceDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState("6m");
  const [editor, setEditor] = useState(false);
  const [sale, setSale] = useState<PositionView | null>(null);
  const [historySale, setHistorySale] = useState<SaleView | null>(null);
  const [historyTrend, setHistoryTrend] = useState<
    Array<{
      capturedAt: string;
      quantity: string;
      marketValueTwd: string;
      costValueTwd: string;
    }>
  >([]);
  const [merged, setMerged] = useState(false);
  const [error, setError] = useState("");
  const upload = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await request<DashboardData>(`/api/dashboard?range=${range}`));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法讀取資料");
    }
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    request<DashboardData>(`/api/dashboard?range=${range}`)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError("");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "無法讀取資料");
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const positions = useMemo(
    () => data?.latest?.accounts.flatMap((account) => account.positions) ?? [],
    [data],
  );
  const displayPositions = useMemo(
    () =>
      merged
        ? Object.values(
            positions.reduce<Record<string, PositionView>>((all, item) => {
              const key = `${item.market}:${item.symbol}`;
              if (!all[key]) all[key] = { ...item, accountName: "跨帳戶合併" };
              else {
                all[key].quantity = String(
                  Number(all[key].quantity) + Number(item.quantity),
                );
                all[key].marketValueTwd = String(
                  Number(all[key].marketValueTwd) + Number(item.marketValueTwd),
                );
                all[key].costValueTwd = String(
                  Number(all[key].costValueTwd) + Number(item.costValueTwd),
                );
                all[key].unrealizedPnlTwd = String(
                  Number(all[key].unrealizedPnlTwd) +
                    Number(item.unrealizedPnlTwd),
                );
              }
              return all;
            }, {}),
          )
        : positions,
    [positions, merged],
  );

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const result = await request<{ imported: number; skipped: number }>(
        "/api/backup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: await file.text(),
        },
      );
      alert(
        `匯入完成：新增 ${result.imported} 筆，略過 ${result.skipped} 筆。`,
      );
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "匯入失敗");
    }
  };

  const openSoldHistory = async (item: SaleView) => {
    try {
      const trend = await request<typeof historyTrend>(
        `/api/trends/securities/${item.securityId}`,
      );
      setHistoryTrend(trend);
      setHistorySale(item);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法讀取持倉歷史");
    }
  };

  const saved = () => {
    setEditor(false);
    setSale(null);
    load();
  };

  const latest = data?.latest;
  const firstTrendValue = Number(data?.trend[0]?.totalAssetValueTwd ?? 0);
  const latestValue = Number(latest?.totalAssetValueTwd ?? 0);
  const trendChange = latestValue - firstTrendValue;
  const trendChangePct = firstTrendValue
    ? (trendChange / firstTrendValue) * 100
    : 0;
  const securitiesRatio = latestValue
    ? (Number(latest?.totalSecuritiesTwd ?? 0) / latestValue) * 100
    : 0;

  return (
    <main className="min-h-screen text-[#17231c]">
      <header className="sticky top-0 z-30 border-b border-[#dce4dd]/80 bg-[#f7f9f5]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1380px] items-center justify-between gap-5 px-6 max-sm:px-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-[#173c2d] text-xs font-black text-[#d8f477] shadow-[0_8px_22px_rgba(23,60,45,.18)]">
              FR
            </div>
            <div>
              <p className="text-sm font-bold tracking-[-.02em]">
                FinanceReview
              </p>
              <p className="text-[9px] font-bold tracking-[.14em] text-[#89958d]">
                PRIVATE WEALTH LOG
              </p>
            </div>
          </div>
          <nav className="flex items-center rounded-full border border-[#dce4dd] bg-white/75 p-1 text-xs max-md:hidden">
            <a
              className="rounded-full bg-[#173c2d] px-4 py-2 font-semibold text-white"
              href="#top"
            >
              總覽
            </a>
            <a
              className="rounded-full px-4 py-2 text-[#66736b]"
              href="#accounts"
            >
              帳戶與持倉
            </a>
            <a
              className="rounded-full px-4 py-2 text-[#66736b]"
              href="#history"
            >
              歷史紀錄
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              aria-label="下載備份"
              title="下載備份"
              className="icon-button max-sm:hidden"
              href="/api/backup"
              download
            >
              <Download size={16} />
            </a>
            <button
              aria-label="還原備份"
              title="還原備份"
              className="icon-button max-sm:hidden"
              onClick={() => upload.current?.click()}
            >
              <Upload size={16} />
            </button>
            <input
              ref={upload}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => importFile(event.target.files?.[0])}
            />
            <button
              className="primary rounded-full! px-4!"
              onClick={() => setEditor(true)}
            >
              <Plus size={16} />
              新增紀錄
            </button>
          </div>
        </div>
      </header>

      <section
        id="top"
        className="mx-auto max-w-[1380px] px-6 pb-16 pt-10 max-sm:px-4 max-sm:pt-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">MY FINANCIAL POSITION</p>
            <h1 className="mt-2 text-[clamp(2rem,4vw,3.35rem)] font-semibold leading-none tracking-[-.055em]">
              我的資產全貌
            </h1>
            <p className="mt-3 text-sm text-[#718078]">
              {new Date().toLocaleDateString("zh-TW", { dateStyle: "full" })}
              ・資料只保存在這台電腦
            </p>
          </div>
          {latest && (
            <div className="rounded-full border border-[#d9e2da] bg-white/70 px-4 py-2 text-xs text-[#657269]">
              最後更新・{dateFormatter.format(new Date(latest.capturedAt))}
            </div>
          )}
        </div>

        {error && <p className="notice error mt-6">{error}</p>}
        {!data ? (
          <div className="mt-16 grid place-items-center py-20 text-sm text-[#748178]">
            <LoaderCircle className="mb-3 animate-spin" />
            正在整理資產資料…
          </div>
        ) : !latest ? (
          <EmptyState onCreate={() => setEditor(true)} />
        ) : (
          <>
            <section className="mt-9 grid grid-cols-[minmax(0,1.55fr)_minmax(310px,.65fr)] gap-5 max-xl:grid-cols-1">
              <NetWorthCard
                latest={latest}
                trend={data.trend}
                range={range}
                onRange={setRange}
                trendChange={trendChange}
                trendChangePct={trendChangePct}
              />
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                <OverviewCard
                  icon={<TrendingUp size={18} />}
                  label="證券市值"
                  value={money(latest.totalSecuritiesTwd)}
                  detail={`未實現損益 ${money(latest.unrealizedPnlTwd)}`}
                  positive={Number(latest.unrealizedPnlTwd) >= 0}
                  ratio={securitiesRatio}
                />
                <OverviewCard
                  icon={<Banknote size={18} />}
                  label="現金餘額"
                  value={money(latest.totalCashTwd)}
                  detail={`占總資產 ${(100 - securitiesRatio).toFixed(1)}%`}
                  ratio={100 - securitiesRatio}
                  accounts={latest.accounts.map((account) => account.name)}
                />
              </div>
            </section>

            <section id="accounts" className="mt-12 scroll-mt-24">
              <SectionHeading
                eyebrow="ACCOUNTS"
                title="帳戶與現金"
                description="最新快照中的帳戶狀態"
              />
              <div className="mt-5 grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
                {latest.accounts.map((account) => (
                  <article key={account.accountId} className="account-card">
                    <div className="flex items-center justify-between">
                      <div className="overview-icon">
                        {account.accountType === "bank" ? (
                          <Landmark size={18} />
                        ) : (
                          <Building2 size={18} />
                        )}
                      </div>
                      <span className="rounded-full bg-[#f2f5f1] px-2.5 py-1 text-[10px] text-[#738078]">
                        {account.accountType === "bank"
                          ? "銀行"
                          : account.accountType === "brokerage"
                            ? "券商"
                            : "現金"}
                      </span>
                    </div>
                    <h3 className="mt-5 font-semibold">{account.name}</h3>
                    <p className="mt-1 text-xs text-[#849087]">
                      {account.institution || "未設定機構"}
                    </p>
                    <div className="mt-5 space-y-2 border-t border-[#e9eee9] pt-4">
                      {account.cashBalances.length ? (
                        account.cashBalances.map((balance) => (
                          <div
                            key={balance.currency}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="text-[#7b887f]">
                              {balance.currency}
                            </span>
                            <strong className="font-semibold">
                              {number.format(Number(balance.amount))}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#98a29b]">沒有現金餘額</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-12">
              <SectionHeading
                eyebrow="HOLDINGS"
                title="股票與 ETF"
                description="依最新行情計算持倉價值"
                action={
                  <button
                    className="secondary rounded-full!"
                    onClick={() => setMerged((value) => !value)}
                  >
                    {merged ? <Building2 size={15} /> : <Landmark size={15} />}
                    {merged ? "依帳戶" : "合併同標的"}
                  </button>
                }
              />
              <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dce4dd] bg-white/90 shadow-[0_14px_45px_rgba(27,52,39,.04)]">
                {displayPositions.length === 0 ? (
                  <div className="py-14 text-center">
                    <TrendingUp className="mx-auto text-[#a0aaa3]" />
                    <p className="mt-3 text-sm text-[#7c8981]">
                      目前沒有股票持倉
                    </p>
                  </div>
                ) : (
                  displayPositions.map((item, index) => (
                    <HoldingRow
                      key={
                        merged
                          ? `${item.market}:${item.symbol}`
                          : item.positionId
                      }
                      item={item}
                      divided={index > 0}
                      canSell={!merged}
                      onSell={() => setSale(item)}
                    />
                  ))
                )}
              </div>
            </section>

            <section
              id="history"
              className="mt-12 grid scroll-mt-24 grid-cols-[minmax(0,1fr)_minmax(320px,.72fr)] gap-5 max-lg:grid-cols-1"
            >
              <HistoryPanel data={data} />
              <SoldPanel data={data} onOpen={openSoldHistory} />
            </section>
          </>
        )}

        {editor && (
          <SnapshotEditor
            latest={latest ?? null}
            onClose={() => setEditor(false)}
            onSaved={saved}
          />
        )}
        {sale && (
          <SaleDialog
            position={sale}
            onClose={() => setSale(null)}
            onSaved={saved}
          />
        )}
        {historySale && (
          <SoldHistoryDialog
            sale={historySale}
            trend={historyTrend}
            onClose={() => setHistorySale(null)}
          />
        )}
      </section>
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-10 overflow-hidden rounded-[32px] border border-[#dbe4dc] bg-white shadow-[0_24px_80px_rgba(23,60,45,.08)]">
      <div className="grid min-h-[440px] grid-cols-[1fr_.85fr] max-lg:grid-cols-1">
        <div className="flex flex-col justify-center p-12 max-sm:p-7">
          <p className="eyebrow">YOUR FIRST SNAPSHOT</p>
          <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-[-.05em] max-sm:text-3xl">
            從今天開始，看見資產如何改變。
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-7 text-[#6d7b72]">
            每次只要輸入一筆銀行餘額或股票持倉，既有資料會自動保留；每次保存都會成為往後可比較的歷史節點。
          </p>
          <button
            className="primary mt-7 w-fit rounded-full! px-5!"
            onClick={onCreate}
          >
            <Sparkles size={16} />
            新增第一筆紀錄
          </button>
        </div>
        <div className="relative overflow-hidden bg-[#173c2d] p-10 text-white">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-[#c8ef71]/10" />
          <div className="relative flex h-full flex-col justify-between">
            <WalletCards size={34} className="text-[#d6f47a]" />
            <div>
              <p className="text-xs font-semibold tracking-[.14em] text-white/45">
                LOCAL FIRST
              </p>
              <p className="mt-3 text-2xl font-medium leading-snug">
                你的財務資料不需要離開這台電腦。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NetWorthCard({
  latest,
  trend,
  range,
  onRange,
  trendChange,
  trendChangePct,
}: {
  latest: NonNullable<DashboardData["latest"]>;
  trend: DashboardData["trend"];
  range: string;
  onRange: (range: string) => void;
  trendChange: number;
  trendChangePct: number;
}) {
  return (
    <article className="relative overflow-hidden rounded-[30px] bg-[#173c2d] p-7 text-white shadow-[0_24px_70px_rgba(23,60,45,.16)] max-sm:p-5">
      <div className="absolute right-0 top-0 h-48 w-48 translate-x-12 -translate-y-12 rounded-full border-[38px] border-[#c9ee75]/8" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[.14em] text-white/45">
            TOTAL NET WORTH
          </p>
          <p className="mt-3 text-[clamp(2.3rem,5vw,4.2rem)] font-semibold tracking-[-.06em]">
            {money(latest.totalAssetValueTwd)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 ${trendChange >= 0 ? "bg-[#cff27b]/15 text-[#d8f68e]" : "bg-[#f59b8d]/15 text-[#ffc0b6]"}`}
            >
              {trendChange >= 0 ? "+" : ""}
              {trendChangePct.toFixed(1)}%
            </span>
            <span className="text-white/46">
              {range === "6m"
                ? "近六個月"
                : range === "1y"
                  ? "近一年"
                  : "全部歷史"}
            </span>
          </div>
        </div>
        <select
          aria-label="走勢範圍"
          className="rounded-full border border-white/12 bg-white/8 px-3 py-2 text-xs text-white outline-none"
          value={range}
          onChange={(event) => onRange(event.target.value)}
        >
          <option className="text-black" value="6m">
            6 個月
          </option>
          <option className="text-black" value="1y">
            1 年
          </option>
          <option className="text-black" value="all">
            全部
          </option>
        </select>
      </div>
      <div className="relative mt-5 h-52">
        {trend.length < 2 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/12 text-sm text-white/38">
            再建立一份快照，就能看見資產走勢
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="heroAssetFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d2f27e" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#d2f27e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
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
              />
              <Tooltip
                formatter={(value) => money(String(value))}
                labelFormatter={(value) =>
                  dateFormatter.format(new Date(String(value)))
                }
                contentStyle={{ borderRadius: 14, border: 0, fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="totalAssetValueTwd"
                stroke="#d4f47c"
                strokeWidth={2.5}
                fill="url(#heroAssetFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  detail,
  positive,
  ratio,
  accounts,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
  ratio: number;
  accounts?: string[];
}) {
  return (
    <article className="overview-card">
      <div className="flex items-start justify-between">
        <div className="overview-icon">{icon}</div>
        {positive !== undefined && (
          <span className={`status ${positive ? "fresh" : "manual"}`}>
            {positive ? "正報酬" : "負報酬"}
          </span>
        )}
      </div>
      <p className="mt-7 text-xs font-semibold tracking-[.12em] text-[#7a877f]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-[-.04em]">{value}</p>
      <p
        className={`mt-3 text-xs ${positive === true ? "positive" : positive === false ? "negative" : "text-[#78857d]"}`}
      >
        {detail}
      </p>
      {accounts ? (
        <div className="mt-5 flex -space-x-2">
          {accounts.slice(0, 5).map((account) => (
            <div
              title={account}
              key={account}
              className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-[#e3ece4] text-[10px] font-bold text-[#37664d]"
            >
              {account.slice(0, 1)}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-[#e9eee9]">
          <div
            className="h-full rounded-full bg-[#4a8464]"
            style={{ width: `${Math.min(Math.max(ratio, 0), 100)}%` }}
          />
        </div>
      )}
    </article>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <div className="flex items-center gap-4">
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}

function HoldingRow({
  item,
  divided,
  canSell,
  onSell,
}: {
  item: PositionView;
  divided: boolean;
  canSell: boolean;
  onSell: () => void;
}) {
  return (
    <div
      className={`holding-row ${divided ? "border-t border-[#e9eee9]" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#173c2d] text-[10px] font-bold text-[#d6f479]">
          {item.symbol.slice(0, 4)}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="mt-1 truncate text-xs text-[#7e8a82]">
            {item.symbol}・{item.accountName}
          </p>
        </div>
      </div>
      <HoldingValue
        label="持有數量"
        value={number.format(Number(item.quantity))}
      />
      <HoldingValue
        label="平均成本 / 現價"
        value={`${number.format(Number(item.averageCost))} / ${number.format(Number(item.marketPrice))}`}
      />
      <HoldingValue
        label="未實現損益"
        value={money(item.unrealizedPnlTwd)}
        tone={Number(item.unrealizedPnlTwd) >= 0 ? "positive" : "negative"}
      />
      <HoldingValue
        label="市值"
        value={money(item.marketValueTwd)}
        align="right"
      />
      <div className="flex items-center justify-end gap-2">
        <span className={`status ${item.quoteStatus}`}>
          {item.quoteStatus === "fresh"
            ? "最新"
            : item.quoteStatus === "stale"
              ? "沿用"
              : "手動"}
        </span>
        {canSell && (
          <button
            className="rounded-full border border-[#ead9d6] px-3 py-1.5 text-[11px] font-semibold text-[#9b5149]"
            onClick={onSell}
          >
            全部賣出
          </button>
        )}
      </div>
    </div>
  );
}

function HoldingValue({
  label,
  value,
  tone,
  align,
}: {
  label: string;
  value: string;
  tone?: string;
  align?: "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="holding-label">{label}</p>
      <p className={`holding-value ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function HistoryPanel({ data }: { data: DashboardData }) {
  const visible = data.history.slice(0, 8);
  return (
    <article className="rounded-[24px] border border-[#dce4dd] bg-white/90 p-6">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">SNAPSHOTS</p>
          <h2>歷史快照</h2>
        </div>
        <Archive size={18} className="text-[#78857d]" />
      </div>
      <div className="mt-6">
        {visible.map((item, index) => (
          <div key={item.id} className="timeline-row">
            <div className="flex flex-col items-center">
              <span
                className={`h-2.5 w-2.5 rounded-full ${index === 0 ? "bg-[#4d825f] ring-4 ring-[#e2eee4]" : "bg-[#c5cec7]"}`}
              />
              {index < visible.length - 1 && (
                <span className="mt-1 h-full w-px bg-[#e3e9e4]" />
              )}
            </div>
            <div className="flex flex-1 items-start justify-between gap-4 pb-5">
              <div>
                <p className="text-sm font-medium">
                  {index === 0
                    ? "最新快照"
                    : dateFormatter.format(new Date(item.capturedAt))}
                </p>
                <p className="mt-1 text-xs text-[#829087]">
                  證券 {money(item.totalSecuritiesTwd)}・現金{" "}
                  {money(item.totalCashTwd)}
                </p>
              </div>
              <strong className="text-sm font-semibold">
                {money(item.totalAssetValueTwd)}
              </strong>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function SoldPanel({
  data,
  onOpen,
}: {
  data: DashboardData;
  onOpen: (sale: SaleView) => void;
}) {
  return (
    <article
      id="sold"
      className="rounded-[24px] border border-[#dce4dd] bg-white/90 p-6"
    >
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">CLOSED</p>
          <h2>已售出</h2>
        </div>
        <span className="rounded-full bg-[#f2f5f1] px-2.5 py-1 text-xs text-[#77847c]">
          {data.sold.length}
        </span>
      </div>
      {data.sold.length === 0 ? (
        <div className="grid min-h-52 place-items-center text-center">
          <div>
            <CheckCircle2 className="mx-auto text-[#8dab96]" />
            <p className="mt-3 text-sm font-medium">尚無全部賣出紀錄</p>
            <p className="mt-1 text-xs text-[#849087]">
              結束的持倉會保留在這裡
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {data.sold.slice(0, 6).map((item) => (
            <button
              key={item.id}
              onClick={() => onOpen(item)}
              className="flex w-full items-center justify-between rounded-2xl border border-[#e5ebe6] bg-[#fafcf9] p-4 text-left"
            >
              <div>
                <p className="text-sm font-semibold">
                  {item.symbol}・{item.securityName}
                </p>
                <p className="mt-1 text-xs text-[#819087]">
                  {item.accountName}・
                  {new Date(item.soldAt).toLocaleDateString("zh-TW")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold">
                  {number.format(Number(item.quantity))} 股
                </p>
                <p className="mt-1 text-[10px] text-[#839087]">查看走勢</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
