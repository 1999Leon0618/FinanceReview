"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
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
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  Banknote,
  BellRing,
  BookOpenText,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  History,
  Landmark,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  TrendingUp,
  Upload,
  UserCog,
  WalletCards,
  X,
} from "lucide-react";
import ResearchWorkspace from "@/components/research-workspace";
import type { QuoteRefreshPreview } from "@/lib/quote-refresh";
import {
  DisplayOrderEditor,
  useDisplayOrder,
} from "@/components/display-order-editor";
import { applyDisplayOrder, type DisplaySection } from "@/lib/display-order";
import { requestJson as request } from "@/lib/client-request";
import {
  creditCardDisplayPayment,
  creditCardPaymentMonthLabel,
  creditCardCycleDates,
  inputDate,
  normalizeCreditCardAccountStatus,
} from "@/lib/credit-card";
import type {
  AccountTrendPoint,
  AccountView,
  AccountStateInput,
  CreditCardAccountInput,
  CreditCardAccountView,
  CreditCardTrendPoint,
  DashboardData,
  BenchmarkId,
  HealthFinding,
  LoanView,
  PerformanceReport,
  PositionView,
  SaleView,
  SecurityTrendPoint,
  SnapshotSummary,
} from "@/lib/types";

const SnapshotEditor = dynamic(() =>
  import("@/components/dashboard-dialogs").then(
    (module) => module.SnapshotEditor,
  ),
);
const SaleDialog = dynamic(() =>
  import("@/components/dashboard-dialogs").then((module) => module.SaleDialog),
);
const SoldHistoryDialog = dynamic(() =>
  import("@/components/dashboard-dialogs").then(
    (module) => module.SoldHistoryDialog,
  ),
);

type ViewAllSection = "accounts" | "loans" | "holdings" | "history" | "sold";
export type FinancePage =
  | "overview"
  | "accounts"
  | "investments"
  | "credit-cards"
  | "research"
  | "settings";
type DashboardNotification = {
  title: string;
  message: string;
  detail?: string;
};

const twd = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });
const percentage = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
});
const money = (value?: string | null) => `NT$${twd.format(Number(value ?? 0))}`;
const percent = (value?: string | null) =>
  value === null || value === undefined
    ? "—"
    : `${percentage.format(Number(value))}%`;
const accountCashTwd = (account: AccountView) =>
  account.cashBalances.reduce(
    (total, balance) =>
      total +
      Number(balance.amount) *
        (balance.currency === "TWD" ? 1 : Number(balance.fxRate?.rate ?? 0)),
    0,
  );
const positionUnrealizedReturnPct = (item: PositionView) => {
  if (item.unrealizedReturnPct !== null) return item.unrealizedReturnPct;
  if (item.securityType !== "future") return null;

  const costNotionalTwd =
    Number(item.averageCost) *
    Number(item.contractMultiplier ?? 0) *
    Number(item.quantity) *
    Number(item.fxRate?.rate ?? 1);
  return costNotionalTwd === 0
    ? null
    : String((Number(item.unrealizedPnlTwd) / costNotionalTwd) * 100);
};
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
const hiddenValue = "••••••";
const dashboardRangeStorageKey = "finance-review-dashboard-range";
const sidebarHiddenStorageKey = "finance-review-sidebar-hidden";
const themeStorageKey = "finance-review-theme";
const valuesHiddenStorageKey = "finance-review-values-hidden";
const privateValue = (hidden: boolean, value: string) =>
  hidden ? hiddenValue : value;

const applySavedTheme = () => {
  const savedTheme = localStorage.getItem(themeStorageKey);
  const nextDarkMode =
    savedTheme === "dark" ||
    (!savedTheme && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", nextDarkMode);
  document.documentElement.style.colorScheme = nextDarkMode ? "dark" : "light";
  return nextDarkMode;
};

export default function FinanceDashboard({
  initialData,
  page = "overview",
  isAdmin = false,
  demoMode = false,
  demoReturnHref = "/pending",
}: {
  initialData: DashboardData;
  page?: FinancePage;
  isAdmin?: boolean;
  demoMode?: boolean;
  demoReturnHref?: string;
}) {
  const [data, setData] = useState<DashboardData | null>(initialData);
  const [range, setRange] = useState("6m");
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [valuesHidden, setValuesHidden] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [benchmark, setBenchmark] = useState<BenchmarkId>("twii");
  const [performance, setPerformance] = useState<PerformanceReport | null>(
    null,
  );
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [staleWarningOpen, setStaleWarningOpen] = useState(false);
  const [editor, setEditor] = useState(false);
  const [creditCardEditor, setCreditCardEditor] = useState(false);
  const [viewAll, setViewAll] = useState<ViewAllSection | null>(null);
  const [sortingSection, setSortingSection] = useState<DisplaySection | null>(
    null,
  );
  const displayOrder = useDisplayOrder();
  const [selectedAccount, setSelectedAccount] = useState<AccountView | null>(
    null,
  );
  const [selectedSecurity, setSelectedSecurity] = useState<PositionView | null>(
    null,
  );
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
  const [error, setError] = useState("");
  const [refreshingQuotes, setRefreshingQuotes] = useState(false);
  const [notification, setNotification] =
    useState<DashboardNotification | null>(null);
  const [pendingQuoteRefresh, setPendingQuoteRefresh] =
    useState<QuoteRefreshPreview | null>(null);
  const [manualQuotePrices, setManualQuotePrices] = useState<
    Record<string, string>
  >({});
  const upload = useRef<HTMLInputElement>(null);
  const notificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedDashboardRange = useRef(range);

  const notify = useCallback((next: DashboardNotification) => {
    if (notificationTimer.current) clearTimeout(notificationTimer.current);
    setNotification(next);
    notificationTimer.current = setTimeout(() => {
      setNotification(null);
      notificationTimer.current = null;
    }, 5000);
  }, []);

  useEffect(
    () => () => {
      if (notificationTimer.current) clearTimeout(notificationTimer.current);
    },
    [],
  );

  const toggleValues = () => {
    const next = !valuesHidden;
    localStorage.setItem(valuesHiddenStorageKey, String(next));
    setValuesHidden(next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedRange = localStorage.getItem(dashboardRangeStorageKey);
      if (savedRange === "6m" || savedRange === "1y" || savedRange === "all")
        setRange(savedRange);
      setSidebarHidden(
        localStorage.getItem(sidebarHiddenStorageKey) === "true",
      );
      setValuesHidden(localStorage.getItem(valuesHiddenStorageKey) === "true");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectRange = (nextRange: string) => {
    setRange(nextRange);
    localStorage.setItem(dashboardRangeStorageKey, nextRange);
  };

  const toggleSidebar = () => {
    setSidebarHidden((current) => {
      const next = !current;
      localStorage.setItem(sidebarHiddenStorageKey, String(next));
      return next;
    });
  };

  useLayoutEffect(() => {
    let nextDarkMode: boolean;
    try {
      nextDarkMode = applySavedTheme();
    } catch {
      nextDarkMode = document.documentElement.classList.contains("dark");
    }
    const timer = window.setTimeout(() => setDarkMode(nextDarkMode), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggleDarkMode = () => {
    const nextDarkMode = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDarkMode);
    document.documentElement.style.colorScheme = nextDarkMode
      ? "dark"
      : "light";
    localStorage.setItem(themeStorageKey, nextDarkMode ? "dark" : "light");
    setDarkMode(nextDarkMode);
  };

  const load = useCallback(async () => {
    if (demoMode) return;
    try {
      setData(await request<DashboardData>(`/api/dashboard?range=${range}`));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法讀取資料");
    }
  }, [demoMode, range]);

  useEffect(() => {
    if (demoMode) return;
    if (loadedDashboardRange.current === range) return;
    loadedDashboardRange.current = range;
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
  }, [demoMode, range]);

  useEffect(() => {
    if (demoMode || page !== "investments") return;
    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) setPerformanceLoading(true);
    }, 0);
    request<PerformanceReport>(
      `/api/performance?range=${range}&benchmark=${benchmark}`,
    )
      .then((result) => {
        if (!cancelled) setPerformance(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "無法計算投資績效");
      })
      .finally(() => {
        if (!cancelled) setPerformanceLoading(false);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [benchmark, demoMode, range, data?.latest?.id, page]);

  useEffect(() => {
    if (!data?.health.shouldWarnOnOpen || !data.health.lastUpdatedAt) return;
    const key = `finance-review-update-warning:${data.health.lastUpdatedAt}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "shown");
    const timer = window.setTimeout(() => setStaleWarningOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [data?.health]);

  const sortedLatest = useMemo(() => {
    const snapshot = data?.latest;
    if (!snapshot) return snapshot;
    return {
      ...snapshot,
      accounts: applyDisplayOrder(
        snapshot.accounts,
        displayOrder.order.accounts,
        (item) => item.accountId,
      ).map((account) => ({
        ...account,
        positions: applyDisplayOrder(
          account.positions,
          displayOrder.order.holdings,
          (item) => item.positionId ?? item.id,
        ),
      })),
      loans: applyDisplayOrder(
        snapshot.loans,
        displayOrder.order.loans,
        (item) => item.loanId ?? item.id,
      ),
      creditCardAccounts: applyDisplayOrder(
        snapshot.creditCardAccounts,
        displayOrder.order.creditCards,
        (item) => item.creditCardAccountId ?? item.id,
      ),
    };
  }, [data, displayOrder.order]);
  const positions = useMemo(
    () =>
      applyDisplayOrder(
        data?.latest?.accounts.flatMap((account) => account.positions) ?? [],
        displayOrder.order.holdings,
        (item) => item.positionId ?? item.id,
      ),
    [data, displayOrder.order.holdings],
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

  const selectImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    void importFile(input.files?.[0]).finally(() => {
      input.value = "";
    });
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

  const saveQuoteRefresh = async (
    preview: QuoteRefreshPreview,
    manualPrices: Record<string, string>,
  ) => {
    const failedIds = new Set(
      preview.failures.map((failure) => failure.positionId),
    );
    let manual = 0;
    let stale = 0;
    const now = new Date().toISOString();
    const accounts: AccountStateInput[] = preview.accounts.map((account) => ({
      ...account,
      positions: account.positions.map((position) => {
        const id = position.positionId ?? position.symbol;
        if (!failedIds.has(id)) return position;
        const entered = manualPrices[id]?.trim() ?? "";
        if (!entered) {
          stale += 1;
          return position;
        }
        if (!/^\d+(?:\.\d+)?$/.test(entered) || Number(entered) <= 0) {
          throw new Error(`${position.symbol} 的手動現值必須大於 0`);
        }
        manual += 1;
        return {
          ...position,
          marketPrice: entered,
          quoteAsOf: now,
          quoteSource: "MANUAL" as const,
          quoteStatus: "manual" as const,
          quoteNote: "行情更新失敗，已手動輸入現值",
        };
      }),
    }));
    const parts: string[] = [];
    if (preview.fresh > 0) parts.push(`${preview.fresh} 筆網路更新`);
    if (manual > 0) parts.push(`${manual} 筆手動輸入`);
    if (stale > 0) parts.push(`${stale} 筆沿用舊資料`);

    await request("/api/quotes/refresh", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawInput: `一鍵更新標的現值（${parts.join("、")}）`,
        baseSnapshotId: preview.baseSnapshotId,
        accounts,
        loans: preview.loans,
      }),
    });
    const warningMessages = preview.failures
      .filter((failure) => !manualPrices[failure.positionId]?.trim())
      .map(
        (failure) =>
          `${failure.symbol} 沿用 ${failure.currency} ${number.format(Number(failure.oldPrice))}`,
      );
    notify({
      title: "現值更新完成",
      message: parts.length > 0 ? parts.join("・") : "行情資料已重新整理",
      detail:
        warningMessages.length > 0 ? warningMessages.join("；") : undefined,
    });
    setPendingQuoteRefresh(null);
    setManualQuotePrices({});
    await load();
  };

  const refreshQuotes = async () => {
    setRefreshingQuotes(true);
    setError("");
    try {
      const preview = await request<QuoteRefreshPreview>(
        "/api/quotes/refresh",
        { method: "POST" },
      );
      if (preview.failures.length > 0) {
        setPendingQuoteRefresh(preview);
        setManualQuotePrices({});
      } else {
        await saveQuoteRefresh(preview, {});
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "標的現值更新失敗");
    } finally {
      setRefreshingQuotes(false);
    }
  };

  const confirmQuoteRefresh = async () => {
    if (!pendingQuoteRefresh) return;
    setRefreshingQuotes(true);
    setError("");
    try {
      await saveQuoteRefresh(pendingQuoteRefresh, manualQuotePrices);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "標的現值保存失敗");
    } finally {
      setRefreshingQuotes(false);
    }
  };

  const latest = sortedLatest;
  const firstTrendValue = Number(data?.trend[0]?.totalAssetValueTwd ?? 0);
  const latestValue = Number(latest?.netWorthTwd ?? 0);
  const trendChange = latestValue - firstTrendValue;
  const trendChangePct = firstTrendValue
    ? (trendChange / firstTrendValue) * 100
    : 0;
  const totalAssets = Number(latest?.totalAssetValueTwd ?? 0);
  const securitiesRatio = totalAssets
    ? (Number(latest?.totalSecuritiesTwd ?? 0) / totalAssets) * 100
    : 0;
  const liabilitiesRatio = totalAssets
    ? (Number(latest?.totalLiabilitiesTwd ?? 0) / totalAssets) * 100
    : 0;
  const cashRatio = totalAssets
    ? (Number(latest?.totalCashTwd ?? 0) / totalAssets) * 100
    : 0;
  const pageMeta = {
    overview: {
      eyebrow: "OVERVIEW",
      title: "財務總覽",
      location: "個人資產中心",
      description: "看見每一次累積，掌握資產的下一步。",
    },
    accounts: {
      eyebrow: "ACCOUNTS",
      title: "帳戶",
      location: "帳戶與現金",
      description: "整理分散的帳戶，讓每一筆現金都有全貌。",
    },
    investments: {
      eyebrow: "INVESTMENTS",
      title: "投資",
      location: "投資持倉與績效",
      description: "從持倉到績效，理解你的投資變化。",
    },
    "credit-cards": {
      eyebrow: "CREDIT CARDS",
      title: "信用卡",
      location: "信用卡帳單",
      description: "集中管理帳單、繳款與額度，安心安排每個月。",
    },
    research: {
      eyebrow: "RESEARCH",
      title: "投資研究",
      location: "台美股研究工作區",
      description: "以自選標的為核心，保存盤前、盤中與盤後研究。",
    },
    settings: {
      eyebrow: "SETTINGS",
      title: "設定",
      location: "帳本設定",
      description: "調整顯示偏好，管理備份與帳本存取。",
    },
  }[page];
  const primarySortSection: DisplaySection =
    page === "investments"
      ? "holdings"
      : page === "credit-cards"
        ? "creditCards"
        : page === "overview"
          ? "loans"
          : "accounts";

  return (
    <main
      className={`dashboard-shell min-h-screen text-[#18231d] ${sidebarHidden ? "sidebar-hidden" : ""} ${demoMode ? "dashboard-demo" : ""}`}
    >
      <a className="skip-to-content" href="#top" tabIndex={0}>
        跳至主要內容
      </a>
      <aside className="dashboard-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <CircleDollarSign size={21} strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-sm font-bold tracking-[-.025em]">
              FinanceReview
            </p>
            <p className="mt-0.5 text-[9px] font-bold tracking-[.18em] text-white/35">
              PERSONAL LEDGER
            </p>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="主要導覽">
          <Link
            className={page === "overview" ? "active" : ""}
            href={demoMode ? "/demo" : "/"}
          >
            <LayoutDashboard size={17} />
            財務總覽
          </Link>
          <Link
            className={page === "accounts" ? "active" : ""}
            href={demoMode ? "/demo" : "/accounts"}
          >
            <WalletCards size={17} />
            帳戶
          </Link>
          <Link
            className={page === "investments" ? "active" : ""}
            href={demoMode ? "/demo" : "/investments"}
          >
            <TrendingUp size={17} />
            投資
          </Link>
          <Link
            className={page === "credit-cards" ? "active" : ""}
            href={demoMode ? "/demo" : "/credit-cards"}
          >
            <CreditCard size={17} />
            信用卡
          </Link>
          <Link
            className={page === "research" ? "active" : ""}
            href={demoMode ? "/demo" : "/research"}
          >
            <BookOpenText size={17} />
            研究
          </Link>
          <Link href={demoMode ? "/demo#history" : "/#history"}>
            <History size={17} />
            歷史紀錄
          </Link>
          <Link
            className={page === "settings" ? "active" : ""}
            href={demoMode ? "/demo?view=settings" : "/settings"}
          >
            <Settings size={17} /> 設定
          </Link>
        </nav>

        <div className="mt-auto">
          <div className="privacy-note">
            <ShieldCheck size={17} />
            <div>
              <p className="font-semibold text-white/80">受保護的個人帳本</p>
              <p className="mt-1 leading-5 text-white/38">
                請定期匯出備份並妥善保存
              </p>
            </div>
          </div>
          {demoMode ? (
            <Link className="demo-sidebar-return" href={demoReturnHref}>
              <ArrowLeft size={15} /> 離開範例
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="dashboard-main">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              aria-label={sidebarHidden ? "顯示左側欄" : "隱藏左側欄"}
              aria-pressed={sidebarHidden}
              title={sidebarHidden ? "顯示左側欄" : "隱藏左側欄"}
              className="sidebar-toggle"
              onClick={toggleSidebar}
            >
              {sidebarHidden ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
            <div className="mobile-brand">
              <div className="brand-mark">
                <CircleDollarSign size={19} />
              </div>
              <span>FinanceReview</span>
            </div>
            <p className="topbar-location">{pageMeta.location}</p>
          </div>
          <Link
            className="icon-button settings-entry"
            href={demoMode ? "/demo?view=settings" : "/settings"}
            aria-label="設定"
            title="設定"
            aria-current={page === "settings" ? "page" : undefined}
          >
            <Settings size={18} />
          </Link>
          {demoMode ? (
            <Link className="primary demo-top-return" href={demoReturnHref}>
              <ArrowLeft size={15} /> 返回申請
            </Link>
          ) : page !== "research" ? (
            <button className="primary" onClick={() => setEditor(true)}>
              <Plus size={16} />
              新增快照
            </button>
          ) : null}
        </header>

        <nav className="mobile-page-nav" aria-label="手機主要導覽">
          <Link
            className={page === "overview" ? "active" : ""}
            href={demoMode ? "/demo" : "/"}
          >
            <LayoutDashboard size={16} />
            總覽
          </Link>
          <Link
            className={page === "accounts" ? "active" : ""}
            href={demoMode ? "/demo" : "/accounts"}
          >
            <WalletCards size={16} />
            帳戶
          </Link>
          <Link
            className={page === "investments" ? "active" : ""}
            href={demoMode ? "/demo" : "/investments"}
          >
            <TrendingUp size={16} />
            投資
          </Link>
          <Link
            className={page === "credit-cards" ? "active" : ""}
            href={demoMode ? "/demo" : "/credit-cards"}
          >
            <CreditCard size={16} />
            信用卡
          </Link>
          <Link
            className={page === "research" ? "active" : ""}
            href={demoMode ? "/demo" : "/research"}
          >
            <BookOpenText size={16} />
            研究
          </Link>
        </nav>

        <section id="top" className="dashboard-content" tabIndex={-1}>
          {demoMode && (
            <div className="demo-notice" role="status">
              <Eye size={17} />
              <div>
                <strong>唯讀範例帳本</strong>
                <span>畫面與正式帳本相同，所有數字都是固定假資料。</span>
              </div>
            </div>
          )}
          <div className="page-intro">
            <div>
              <p className="eyebrow">{pageMeta.eyebrow}</p>
              <h1>{pageMeta.title}</h1>
              <p className="page-description">{pageMeta.description}</p>
              <p>
                {new Date().toLocaleDateString("zh-TW", { dateStyle: "full" })}
                {latest && (
                  <span className="last-updated">
                    <span className="mx-2 text-[#c3c9c4]">/</span>
                    最後更新 {dateFormatter.format(new Date(latest.capturedAt))}
                  </span>
                )}
              </p>
            </div>
            <div className="page-intro-actions">
              {page !== "settings" && page !== "research" && latest && data && (
                <FreshnessBadge health={data.health} />
              )}
              {page !== "settings" && page !== "research" && !demoMode && (
                <button
                  className="secondary"
                  aria-label="自訂排序"
                  disabled={!latest || !displayOrder.ready}
                  onClick={() => setSortingSection(primarySortSection)}
                >
                  <ArrowUpDown size={16} /> 自訂排序
                </button>
              )}
            </div>
          </div>

          {error && <p className="notice error mt-6">{error}</p>}
          {page === "research" ? (
            <ResearchWorkspace />
          ) : page === "settings" ? (
            <div className="settings-sections">
              <section
                className="settings-panel"
                aria-labelledby="display-settings-title"
              >
                <h2 id="display-settings-title">顯示偏好</h2>
                <p>偏好會儲存在此瀏覽器，並套用到所有帳本頁面。</p>
                <div className="settings-row">
                  <div>
                    <h3>深色模式</h3>
                    <p>依照閱讀環境調整畫面明暗。</p>
                  </div>
                  <button
                    className="secondary"
                    aria-label={darkMode ? "切換為淺色模式" : "切換為深色模式"}
                    aria-pressed={darkMode}
                    onClick={toggleDarkMode}
                  >
                    {darkMode ? <Sun size={17} /> : <Moon size={17} />}
                    {darkMode ? "改用淺色" : "改用深色"}
                  </button>
                </div>
                <div className="settings-row">
                  <div>
                    <h3>隱藏財務數字</h3>
                    <p>將金額改為圓點，保留日期與紀錄內容。</p>
                  </div>
                  <button
                    className="secondary"
                    aria-label={valuesHidden ? "顯示財務數字" : "隱藏財務數字"}
                    aria-pressed={valuesHidden}
                    onClick={toggleValues}
                  >
                    {valuesHidden ? <Eye size={17} /> : <EyeOff size={17} />}
                    {valuesHidden ? "顯示金額" : "隱藏金額"}
                  </button>
                </div>
              </section>
              {!demoMode && (
                <section
                  className="settings-panel"
                  aria-labelledby="backup-settings-title"
                >
                  <h2 id="backup-settings-title">資料備份</h2>
                  <p>備份檔包含財務資料，請下載後妥善保存。</p>
                  <div className="settings-row">
                    <div>
                      <h3>匯出帳本</h3>
                      <p>下載 JSON 備份，保存目前的帳本紀錄。</p>
                    </div>
                    <a className="secondary" href="/api/backup" download>
                      <Download size={17} /> 匯出資料
                    </a>
                  </div>
                  <div className="settings-row">
                    <div>
                      <h3>匯入備份</h3>
                      <p>加入備份中的紀錄，已存在的紀錄會略過。</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => upload.current?.click()}
                    >
                      <Upload size={17} /> 匯入資料
                    </button>
                    <input
                      ref={upload}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      aria-label="選擇備份檔"
                      onChange={selectImportFile}
                    />
                  </div>
                </section>
              )}
              {isAdmin && !demoMode && (
                <section
                  className="settings-panel"
                  aria-labelledby="admin-settings-title"
                >
                  <h2 id="admin-settings-title">管理員</h2>
                  <div className="settings-row">
                    <div>
                      <h3>帳本存取權限</h3>
                      <p>查看申請並管理使用者的存取資格。</p>
                    </div>
                    <Link className="secondary" href="/admin/users">
                      <UserCog size={17} /> 使用者審核
                    </Link>
                  </div>
                </section>
              )}
              <Link
                className="settings-return secondary"
                href={demoMode ? "/demo" : "/"}
              >
                <ArrowLeft size={17} /> 返回財務總覽
              </Link>
            </div>
          ) : !data ? (
            <div className="mt-16 grid place-items-center py-20 text-sm text-[#748178]">
              <LoaderCircle className="mb-3 animate-spin" />
              正在整理資產資料…
            </div>
          ) : !latest ? (
            <EmptyState onCreate={() => setEditor(true)} />
          ) : (
            <>
              {page === "overview" && (
                <>
                  <section className="summary-grid">
                    <NetWorthCard
                      latest={latest}
                      trend={data.trend}
                      range={range}
                      onRange={selectRange}
                      trendChange={trendChange}
                      trendChangePct={trendChangePct}
                      valuesHidden={valuesHidden}
                    />
                    <div className="overview-stack">
                      <OverviewCard
                        icon={<TrendingUp size={18} />}
                        label="證券市值"
                        value={money(latest.totalSecuritiesTwd)}
                        detail={`占總資產 ${securitiesRatio.toFixed(1)}%・未實現損益 ${money(latest.unrealizedPnlTwd)}`}
                        positive={Number(latest.unrealizedPnlTwd) >= 0}
                        ratio={securitiesRatio}
                        valuesHidden={valuesHidden}
                      />
                      <OverviewCard
                        icon={<Landmark size={18} />}
                        label="負債總額"
                        value={money(latest.totalLiabilitiesTwd)}
                        detail={`占資產總額 ${liabilitiesRatio.toFixed(1)}%・${latest.loans.length} 筆貸款・${latest.creditCardAccounts.length} 個信用卡群組`}
                        ratio={liabilitiesRatio}
                        valuesHidden={valuesHidden}
                      />
                      <OverviewCard
                        icon={<Banknote size={18} />}
                        label="現金餘額"
                        value={money(latest.totalCashTwd)}
                        detail={`占總資產 ${cashRatio.toFixed(1)}%・${latest.accounts.length} 個帳號`}
                        ratio={cashRatio}
                        accounts={latest.accounts}
                        valuesHidden={valuesHidden}
                      />
                    </div>
                  </section>

                  {!demoMode && (
                    <nav
                      className="workspace-shortcuts"
                      aria-label="資產快捷導覽"
                    >
                      <Link href="/accounts">
                        <Landmark size={19} />
                        <span>
                          帳戶與現金<small>查看各帳戶餘額</small>
                        </span>
                        <ChevronRight size={16} />
                      </Link>
                      <Link href="/investments">
                        <TrendingUp size={19} />
                        <span>
                          投資持倉<small>追蹤標的與績效</small>
                        </span>
                        <ChevronRight size={16} />
                      </Link>
                      <Link href="/credit-cards">
                        <CreditCard size={19} />
                        <span>
                          信用卡帳單<small>掌握繳款與額度</small>
                        </span>
                        <ChevronRight size={16} />
                      </Link>
                    </nav>
                  )}

                  {latest.changeBreakdown.netWorthChangeTwd !== null && (
                    <ChangeBreakdownCard
                      breakdown={latest.changeBreakdown}
                      valuesHidden={valuesHidden}
                    />
                  )}

                  <HealthCenter
                    health={data.health}
                    valuesHidden={valuesHidden}
                    onUpdate={demoMode ? undefined : () => setEditor(true)}
                  />

                  <LoanPanel
                    loans={latest.loans}
                    onViewAll={() => setViewAll("loans")}
                    sortAction={
                      demoMode ? undefined : (
                        <SortButton
                          onClick={() => setSortingSection("loans")}
                          disabled={!displayOrder.ready}
                        />
                      )
                    }
                  />

                  <section
                    id="history"
                    className="history-grid content-section scroll-mt-24"
                  >
                    <HistoryPanel
                      data={data}
                      valuesHidden={valuesHidden}
                      onViewAll={() => setViewAll("history")}
                    />
                    <SoldPanel
                      data={data}
                      onOpen={openSoldHistory}
                      onViewAll={() => setViewAll("sold")}
                    />
                  </section>
                </>
              )}

              {page === "accounts" && (
                <section
                  id="accounts"
                  className="content-section page-primary-section"
                >
                  <SectionHeading
                    eyebrow="ACCOUNTS"
                    title="所有帳戶與現金"
                    description={`${latest.accounts.length} 個帳戶・依最新快照`}
                    action={
                      <SortButton
                        onClick={() => setSortingSection("accounts")}
                        disabled={!displayOrder.ready}
                      />
                    }
                  />
                  {latest.accounts.length === 0 ? (
                    <div className="page-empty-state">目前沒有帳戶資料</div>
                  ) : (
                    <div className="accounts-grid">
                      {latest.accounts.map((account) => (
                        <AccountCard
                          key={account.accountId}
                          account={account}
                          onOpen={() => setSelectedAccount(account)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {page === "investments" && (
                <>
                  <PerformancePanel
                    report={performance}
                    loading={performanceLoading}
                    benchmark={benchmark}
                    onBenchmark={setBenchmark}
                    valuesHidden={valuesHidden}
                  />
                  <section className="content-section">
                    <SectionHeading
                      eyebrow="HOLDINGS"
                      title="所有投資持倉"
                      description={`${positions.length} 筆持倉・依最新行情計算`}
                      action={
                        <div className="section-actions">
                          <SortButton
                            onClick={() => setSortingSection("holdings")}
                            disabled={!displayOrder.ready}
                          />
                          <button
                            className="primary"
                            disabled={
                              refreshingQuotes || positions.length === 0
                            }
                            onClick={refreshQuotes}
                            title="取得全部標的最新行情並建立新快照"
                          >
                            <RefreshCw
                              className={refreshingQuotes ? "animate-spin" : ""}
                              size={15}
                            />
                            {refreshingQuotes ? "更新現值中…" : "一鍵更新現值"}
                          </button>
                        </div>
                      }
                    />
                    <div className="holdings-panel">
                      {positions.length === 0 ? (
                        <div className="py-14 text-center">
                          <TrendingUp className="mx-auto text-[#a0aaa3]" />
                          <p className="mt-3 text-sm text-[#7c8981]">
                            目前沒有投資品項
                          </p>
                        </div>
                      ) : (
                        positions.map((item, index) => (
                          <HoldingRow
                            key={item.positionId}
                            item={item}
                            divided={index > 0}
                            canSell
                            onOpen={() => setSelectedSecurity(item)}
                            onSell={() => setSale(item)}
                          />
                        ))
                      )}
                    </div>
                  </section>
                </>
              )}

              {page === "credit-cards" && (
                <CreditCardPanel
                  accounts={latest.creditCardAccounts}
                  valuesHidden={valuesHidden}
                  onManage={() => setCreditCardEditor(true)}
                  sortAction={
                    <SortButton
                      onClick={() => setSortingSection("creditCards")}
                      disabled={!displayOrder.ready}
                    />
                  }
                />
              )}
            </>
          )}

          {sortingSection && latest && (
            <ViewAllDialog
              eyebrow="DISPLAY ORDER"
              title="自訂排序"
              count="調整帳戶、持倉、貸款與信用卡的顯示順序"
              onClose={() => setSortingSection(null)}
            >
              <DisplayOrderEditor
                initialSection={sortingSection}
                onClose={() => setSortingSection(null)}
                items={{
                  accounts: latest.accounts.map((item) => ({
                    id: item.accountId,
                    label: item.name,
                  })),
                  holdings: positions.map((item) => ({
                    id: item.positionId ?? item.id,
                    label: `${item.accountName}・${item.symbol} ${item.name}`,
                  })),
                  loans: latest.loans.map((item) => ({
                    id: item.loanId ?? item.id,
                    label: item.name,
                  })),
                  creditCards: latest.creditCardAccounts.map((item) => ({
                    id: item.creditCardAccountId ?? item.id,
                    label: `${item.issuer}・${item.name}`,
                  })),
                }}
                onChange={displayOrder.update}
                warning={displayOrder.warning}
              />
            </ViewAllDialog>
          )}
          {viewAll === "accounts" && latest && (
            <ViewAllDialog
              eyebrow="ACCOUNTS"
              title="全部帳戶與現金"
              count={`${latest.accounts.length} 個帳戶`}
              onClose={() => setViewAll(null)}
            >
              {latest.accounts.length === 0 ? (
                <p className="view-all-empty">目前沒有帳戶資料</p>
              ) : (
                <div className="accounts-grid view-all-grid">
                  {latest.accounts.map((account) => (
                    <AccountCard
                      key={account.accountId}
                      account={account}
                      onOpen={() => setSelectedAccount(account)}
                    />
                  ))}
                </div>
              )}
            </ViewAllDialog>
          )}
          {viewAll === "loans" && latest && (
            <ViewAllDialog
              eyebrow="LIABILITIES"
              title="全部貸款與負債"
              count={`${latest.loans.length} 筆貸款`}
              onClose={() => setViewAll(null)}
            >
              {latest.loans.length === 0 ? (
                <p className="view-all-empty">目前沒有貸款資料</p>
              ) : (
                <div className="accounts-grid view-all-grid">
                  {latest.loans.map((loan) => (
                    <LoanCard key={loan.loanId} loan={loan} />
                  ))}
                </div>
              )}
            </ViewAllDialog>
          )}
          {selectedAccount && !selectedSecurity && (
            <AccountDetailDialog
              account={selectedAccount}
              range={range}
              valuesHidden={valuesHidden}
              onOpenSecurity={(item) => {
                setSelectedSecurity(item);
              }}
              onClose={() => setSelectedAccount(null)}
            />
          )}
          {selectedSecurity && data && (
            <SecurityDetailDialog
              security={selectedSecurity}
              positions={positions.filter(
                (item) => item.securityId === selectedSecurity.securityId,
              )}
              sales={data.sold.filter(
                (item) => item.securityId === selectedSecurity.securityId,
              )}
              range={range}
              valuesHidden={valuesHidden}
              returnAccountName={selectedAccount?.name}
              onBack={
                selectedAccount ? () => setSelectedSecurity(null) : undefined
              }
              onClose={() => {
                setSelectedSecurity(null);
                setSelectedAccount(null);
              }}
            />
          )}
          {viewAll === "holdings" && (
            <ViewAllDialog
              eyebrow="HOLDINGS"
              title="全部股票、ETF、基金與期貨"
              count={`${positions.length} 筆持倉`}
              onClose={() => setViewAll(null)}
            >
              {positions.length === 0 ? (
                <p className="view-all-empty">目前沒有投資品項</p>
              ) : (
                <div className="holdings-panel view-all-holdings">
                  {positions.map((item, index) => (
                    <HoldingRow
                      key={item.positionId}
                      item={item}
                      divided={index > 0}
                      canSell
                      onOpen={() => {
                        setViewAll(null);
                        setSelectedSecurity(item);
                      }}
                      onSell={() => {
                        setViewAll(null);
                        setSale(item);
                      }}
                    />
                  ))}
                </div>
              )}
            </ViewAllDialog>
          )}
          {viewAll === "history" && data && (
            <ViewAllDialog
              eyebrow="SNAPSHOTS"
              title="全部歷史快照"
              count={`${data.history.length} 筆快照`}
              onClose={() => setViewAll(null)}
            >
              <HistoryList items={data.history} valuesHidden={valuesHidden} />
            </ViewAllDialog>
          )}
          {viewAll === "sold" && data && (
            <ViewAllDialog
              eyebrow="CLOSED"
              title="全部已售出持倉"
              count={`${data.sold.length} 筆紀錄`}
              onClose={() => setViewAll(null)}
            >
              {data.sold.length === 0 ? (
                <p className="view-all-empty">目前沒有已售出持倉</p>
              ) : (
                <SoldList
                  items={data.sold}
                  onOpen={(item) => {
                    setViewAll(null);
                    openSoldHistory(item);
                  }}
                />
              )}
            </ViewAllDialog>
          )}

          {editor && (
            <SnapshotEditor
              latest={latest ?? null}
              onClose={() => setEditor(false)}
              onSaved={saved}
            />
          )}
          {creditCardEditor && latest && (
            <CreditCardEditor
              latest={latest}
              onClose={() => setCreditCardEditor(false)}
              onSaved={() => {
                setCreditCardEditor(false);
                notify({
                  title: "信用卡資料已更新",
                  message: "已建立新的財務快照並重新計算淨值。",
                });
                void load();
              }}
            />
          )}
          {pendingQuoteRefresh && (
            <QuoteFailureDialog
              preview={pendingQuoteRefresh}
              values={manualQuotePrices}
              busy={refreshingQuotes}
              onChange={(positionId, value) =>
                setManualQuotePrices((current) => ({
                  ...current,
                  [positionId]: value,
                }))
              }
              onClose={() => {
                if (refreshingQuotes) return;
                setPendingQuoteRefresh(null);
                setManualQuotePrices({});
              }}
              onConfirm={confirmQuoteRefresh}
            />
          )}
          {sale && (
            <SaleDialog
              position={sale}
              accounts={latest?.accounts ?? []}
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
          {staleWarningOpen && data && (
            <UpdateWarningDialog
              days={data.health.daysSinceUpdate ?? 180}
              lastUpdatedAt={data.health.lastUpdatedAt}
              onClose={() => setStaleWarningOpen(false)}
              onUpdate={() => {
                setStaleWarningOpen(false);
                setEditor(true);
              }}
            />
          )}
          {notification && (
            <div
              className="fixed right-6 top-6 z-[100] flex w-[min(380px,calc(100vw-2rem))] items-start gap-3 rounded-2xl border border-[#cfe0d3] bg-white p-4 text-[#294b39] shadow-[0_18px_55px_rgba(14,44,29,.2)] max-sm:right-4 max-sm:top-4"
              role="status"
              aria-live="polite"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e4f2e7] text-[#34704f]">
                <CheckCircle2 size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{notification.title}</p>
                <p className="mt-1 text-xs leading-5 text-[#587064]">
                  {notification.message}
                </p>
                {notification.detail && (
                  <p className="mt-1 text-[11px] leading-5 text-[#7a897f]">
                    {notification.detail}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="關閉通知"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#708078] transition hover:bg-[#f1f5f1]"
                onClick={() => setNotification(null)}
              >
                <X size={15} />
              </button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ViewAllDialog({
  eyebrow,
  title,
  count,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  count: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-all-title"
      className="view-all-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="view-all-dialog">
        <header className="view-all-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="view-all-title">{title}</h2>
            <p>{count}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`關閉${title}視窗`}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="view-all-body">{children}</div>
      </div>
    </div>
  );
}

function QuoteFailureDialog({
  preview,
  values,
  busy,
  onChange,
  onClose,
  onConfirm,
}: {
  preview: QuoteRefreshPreview;
  values: Record<string, string>;
  busy: boolean;
  onChange: (positionId: string, value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const hasInvalidPrice = preview.failures.some((failure) => {
    const value = values[failure.positionId]?.trim();
    return Boolean(
      value && (!/^\d+(?:\.\d+)?$/.test(value) || Number(value) <= 0),
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-failure-title"
      className="quote-failure-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="quote-failure-dialog">
        <div className="quote-failure-header">
          <div className="flex items-start gap-3">
            <div className="quote-failure-icon">
              <AlertTriangle size={19} />
            </div>
            <div>
              <h2 id="quote-failure-title">部分標的無法更新</h2>
              <p>可以手動輸入本次現值；欄位留白就會沿用上一份快照資料。</p>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="關閉補價視窗"
            disabled={busy}
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>

        <div className="quote-failure-list">
          {preview.failures.map((failure) => (
            <div className="quote-failure-row" key={failure.positionId}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{failure.symbol}</strong>
                  <span>{failure.name}</span>
                  <small>{failure.accountName}</small>
                </div>
                <p>{failure.reason}</p>
                <p className="old-quote">
                  舊資料：{failure.currency}{" "}
                  {number.format(Number(failure.oldPrice))}
                </p>
              </div>
              <label>
                手動現值（{failure.currency}）
                <input
                  type="number"
                  min="0.0001"
                  step="any"
                  inputMode="decimal"
                  className="field"
                  value={values[failure.positionId] ?? ""}
                  placeholder={`留白即沿用 ${number.format(Number(failure.oldPrice))}`}
                  onChange={(event) =>
                    onChange(failure.positionId, event.target.value)
                  }
                />
              </label>
            </div>
          ))}
        </div>

        <div className="quote-failure-footer">
          <p>
            {preview.fresh > 0
              ? `已有 ${preview.fresh} 筆成功取得網路行情。`
              : "本次所有標的都可手動補價或沿用舊資料。"}
          </p>
          <div>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              取消更新
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || hasInvalidPrice}
              onClick={onConfirm}
            >
              {busy && <LoaderCircle className="animate-spin" size={15} />}
              {busy ? "正在保存…" : "確認並建立快照"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state mt-8 overflow-hidden">
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
        <div className="relative overflow-hidden bg-[#1b2e25] p-10 text-white">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full border-[44px] border-[#c8ef71]/10" />
          <div className="relative flex h-full flex-col justify-between">
            <WalletCards size={34} className="text-[#d6f47a]" />
            <div>
              <p className="text-xs font-semibold tracking-[.14em] text-white/45">
                PRIVATE BY DEFAULT
              </p>
              <p className="mt-3 text-2xl font-medium leading-snug">
                每一筆資料都由你掌握，記得定期匯出備份。
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
  valuesHidden,
}: {
  latest: NonNullable<DashboardData["latest"]>;
  trend: DashboardData["trend"];
  range: string;
  onRange: (range: string) => void;
  trendChange: number;
  trendChangePct: number;
  valuesHidden: boolean;
}) {
  const trendValues = trend.length
    ? trend.map((item) => Number(item.totalAssetValueTwd))
    : [Number(latest.netWorthTwd)];
  const minimum = Math.min(...trendValues);
  const maximum = Math.max(...trendValues);
  const spread = maximum - minimum;
  const padding = Math.max(spread * 0.06, Math.abs(maximum) * 0.003, 1);
  const chartDomain: [number, number] = [minimum - padding, maximum + padding];
  const firstPoint = trend[0];
  const lastPoint = trend.at(-1) ?? firstPoint;

  return (
    <article
      className="net-worth-card flex flex-col self-stretch"
      style={{ alignSelf: "stretch" }}
    >
      <div className="net-worth-orb" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[.14em] text-white/48">
            TOTAL NET WORTH · 資產淨值
          </p>
          <p className="mt-2.5 text-[clamp(2rem,3.7vw,3.15rem)] font-semibold tracking-[-.055em]">
            {privateValue(valuesHidden, money(latest.netWorthTwd))}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 ${trendChange >= 0 ? "bg-[#cff27b]/15 text-[#d8f68e]" : "bg-[#f59b8d]/15 text-[#ffc0b6]"}`}
            >
              {privateValue(
                valuesHidden,
                `${trendChange >= 0 ? "+" : ""}${trendChangePct.toFixed(1)}%`,
              )}
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
        <RangeCombobox value={range} onChange={onRange} />
      </div>
      {trend.length >= 2 && (
        <div className="relative mt-5 grid grid-cols-3 gap-2 border-y border-white/[.08] py-2.5 text-[10px] max-sm:grid-cols-2">
          <div>
            <span className="text-white/38">期間</span>
            <p className="mt-0.5 font-medium text-white/78">
              {shortDate(firstPoint.capturedAt)} →{" "}
              {shortDate(lastPoint.capturedAt)}
            </p>
          </div>
          <div>
            <span className="text-white/38">期初淨值</span>
            <p className="mt-0.5 font-medium text-white/78">
              {privateValue(valuesHidden, money(firstPoint.totalAssetValueTwd))}
            </p>
          </div>
          <div className="max-sm:hidden">
            <span className="text-white/38">區間高低</span>
            <p className="mt-0.5 font-medium text-white/78">
              {privateValue(
                valuesHidden,
                `${compactTwd(minimum)}－${compactTwd(maximum)}`,
              )}
            </p>
          </div>
        </div>
      )}
      <div className="net-worth-chart relative mt-2 min-h-36 flex-1 max-sm:min-h-32">
        {trend.length < 2 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/12 text-sm text-white/38">
            再建立一份快照，就能看見資產走勢
          </div>
        ) : (
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
        )}
      </div>
    </article>
  );
}

const rangeOptions = [
  { value: "6m", label: "近 6 個月", description: "掌握近期變化" },
  { value: "1y", label: "近 1 年", description: "觀察年度趨勢" },
  { value: "all", label: "全部期間", description: "檢視完整紀錄" },
] as const;

function RangeCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected =
    rangeOptions.find((option) => option.value === value) ?? rangeOptions[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="range-combobox" ref={root}>
      <button
        type="button"
        aria-label={`資產淨值圖表期間，目前為${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>圖表期間</span>
        <strong>{selected.label}</strong>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          className="range-combobox-menu"
          role="listbox"
          aria-label="圖表期間"
        >
          {rangeOptions.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {option.value === value && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
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
  valuesHidden,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  positive?: boolean;
  ratio: number;
  accounts?: AccountView[];
  valuesHidden: boolean;
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
      <p className="mt-6 text-[11px] font-semibold tracking-[.1em] text-[#7a877f]">
        {label}
      </p>
      <p className="mt-2 text-[1.65rem] font-semibold tracking-[-.045em]">
        {privateValue(valuesHidden, value)}
      </p>
      <p
        className={`mt-3 text-xs ${positive === true ? "positive" : positive === false ? "negative" : "text-[#78857d]"}`}
      >
        {privateValue(valuesHidden, detail)}
      </p>
      {accounts ? (
        <div className="overview-accounts mt-5 flex -space-x-2">
          {accounts.slice(0, 5).map((account) => (
            <div
              key={account.accountId}
              className="overview-account"
              tabIndex={0}
              aria-label={`${account.name}，現金餘額 ${money(accountCashTwd(account).toString())}`}
            >
              <span className="overview-account-circle">
                {account.name.slice(0, 1)}
              </span>
              <span className="overview-account-tooltip" role="tooltip">
                <strong>{account.name}</strong>
                <span>{money(accountCashTwd(account).toString())}</span>
              </span>
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

function ChangeBreakdownCard({
  breakdown,
  valuesHidden,
}: {
  breakdown: NonNullable<DashboardData["latest"]>["changeBreakdown"];
  valuesHidden: boolean;
}) {
  const items = [
    ["外部投入", breakdown.capitalContributionTwd],
    ["外部提領", `-${breakdown.capitalWithdrawalTwd}`],
    ["股息／利息", breakdown.incomeTwd],
    ["費用與稅額", `-${breakdown.feeTaxTwd}`],
    ["負債減少", breakdown.liabilityReductionTwd ?? "0"],
    ["市場與匯率等", breakdown.marketAndFxTwd ?? "0"],
  ] as const;
  return (
    <details className="dashboard-disclosure content-section">
      <summary className="dashboard-disclosure-summary">
        <div>
          <p className="eyebrow">CHANGE BREAKDOWN</p>
          <h2 className="mt-1 text-lg font-semibold">本期淨值變動歸因</h2>
          <p className="mt-1 text-xs text-[#748178]">
            淨值變動{" "}
            {privateValue(valuesHidden, money(breakdown.netWorthChangeTwd))}
          </p>
        </div>
        <span className="dashboard-disclosure-action">
          查看歸因
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </summary>
      <div className="dashboard-disclosure-body">
        <p className="text-xs text-[#748178]">
          以本快照和上一份快照比較；「市場與匯率等」是扣除已記錄資金流後的資產變動。
        </p>
        <div className="mt-4 grid grid-cols-6 gap-2 max-xl:grid-cols-3 max-sm:grid-cols-2">
          {items.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-[#f6f8f5] px-4 py-3">
              <p className="text-[11px] text-[#7b8880]">{label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                {privateValue(valuesHidden, money(value))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function FreshnessBadge({ health }: { health: DashboardData["health"] }) {
  const tones = {
    fresh: "border-[#cfe4d5] bg-[#edf7ef] text-[#34704f]",
    attention: "border-[#eadcaf] bg-[#fff8df] text-[#80641e]",
    warning: "border-[#ecc8c2] bg-[#fff0ed] text-[#9b463e]",
  } as const;
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${tones[health.freshnessTone]}`}
      title={
        health.lastUpdatedAt
          ? `最後更新：${dateFormatter.format(new Date(health.lastUpdatedAt))}`
          : health.freshnessLabel
      }
    >
      {health.freshnessTone === "warning" ? (
        <AlertTriangle size={14} />
      ) : (
        <Clock3 size={14} />
      )}
      {health.freshnessLabel}
    </div>
  );
}

function HealthFindingRow({
  item,
  valuesHidden,
}: {
  item: HealthFinding;
  valuesHidden: boolean;
}) {
  const tones = {
    info: "bg-[#edf4ef] text-[#42705a]",
    warning: "bg-[#fff5d9] text-[#86651a]",
    critical: "bg-[#fff0ed] text-[#9b463e]",
  } as const;
  return (
    <li className="flex gap-3 rounded-2xl border border-[#e7ebe7] bg-[#fafbf9] p-3.5">
      <span
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl ${tones[item.severity]}`}
      >
        {item.category === "completeness" ? (
          <ShieldCheck size={15} />
        ) : (
          <BellRing size={15} />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#2b3d33]">{item.title}</p>
        <p className="mt-1 text-xs leading-5 text-[#758178]">
          {valuesHidden ? "詳細資料已隱藏" : item.detail}
        </p>
      </div>
    </li>
  );
}

function HealthCenter({
  health,
  valuesHidden,
  onUpdate,
}: {
  health: DashboardData["health"];
  valuesHidden: boolean;
  onUpdate?: () => void;
}) {
  const completeness = health.findings.filter(
    (item) => item.category === "completeness",
  );
  const actions = health.findings.filter((item) => item.category === "action");
  return (
    <details className="dashboard-disclosure content-section">
      <summary className="dashboard-disclosure-summary">
        <div>
          <p className="eyebrow">HEALTH CHECK</p>
          <h2 className="mt-1 text-lg font-semibold">資料健檢與行動提醒</h2>
          <p className="mt-1 text-xs text-[#748178]">
            {health.findings.length === 0
              ? "目前沒有待處理事項"
              : `${health.findings.length} 項需要留意`}
          </p>
        </div>
        <span className="dashboard-disclosure-action">
          查看健檢
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </summary>
      <div className="dashboard-disclosure-body">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[#748178]">
            依最新快照、行情、匯率、貸款與期貨資料即時計算。
          </p>
          {onUpdate && (
            <button className="secondary" onClick={onUpdate}>
              <RefreshCw size={14} />
              更新財務資料
            </button>
          )}
        </div>
        {health.findings.length === 0 ? (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#edf7ef] px-4 py-4 text-sm text-[#34704f]">
            <CheckCircle2 size={18} />
            目前沒有發現資料缺漏或待處理事項。
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[#56665d]">
                  資料完整性
                </p>
                <span className="text-[11px] text-[#8a958e]">
                  {completeness.length} 項
                </span>
              </div>
              {completeness.length ? (
                <ul className="space-y-2">
                  {completeness.map((item) => (
                    <HealthFindingRow
                      key={item.id}
                      item={item}
                      valuesHidden={valuesHidden}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl bg-[#f5f8f5] p-4 text-xs text-[#718078]">
                  明細加總、行情與匯率資料均通過檢查。
                </p>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[#56665d]">行動提醒</p>
                <span className="text-[11px] text-[#8a958e]">
                  {actions.length} 項
                </span>
              </div>
              {actions.length ? (
                <ul className="space-y-2">
                  {actions.map((item) => (
                    <HealthFindingRow
                      key={item.id}
                      item={item}
                      valuesHidden={valuesHidden}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl bg-[#f5f8f5] p-4 text-xs text-[#718078]">
                  目前沒有即將到期或需要更新的項目。
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function PerformancePanel({
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

function UpdateWarningDialog({
  days,
  lastUpdatedAt,
  onClose,
  onUpdate,
}: {
  days: number;
  lastUpdatedAt: string | null;
  onClose: () => void;
  onUpdate: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-[#10241a]/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-warning-title"
        className="w-full max-w-md rounded-[26px] border border-[#efd0ca] bg-white p-6 shadow-[0_28px_90px_rgba(12,35,24,.3)]"
      >
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0ed] text-[#a44b42]">
          <AlertTriangle size={21} />
        </span>
        <h2 id="update-warning-title" className="mt-4 text-xl font-semibold">
          財務資料已超過 180 天未更新
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#68776e]">
          最近一次更新是
          {lastUpdatedAt
            ? ` ${dateFormatter.format(new Date(lastUpdatedAt))}`
            : "未知時間"}
          ，距今 {days} 天。舊行情與帳戶餘額可能影響目前的財務判讀。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="secondary" onClick={onClose}>
            稍後處理
          </button>
          <button className="primary" onClick={onUpdate}>
            <Plus size={14} />
            建立新快照
          </button>
        </div>
      </section>
    </div>
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
      <div className="section-heading-meta">
        <p>{description}</p>
        {action}
      </div>
    </div>
  );
}

const loanTypeLabels: Record<LoanView["loanType"], string> = {
  mortgage: "房貸",
  personal: "信貸",
  auto: "車貸",
  student: "學貸",
  credit: "信用卡循環",
  other: "其他貸款",
};

function AccountCard({
  account,
  onOpen,
}: {
  account: AccountView;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="account-card account-card-button"
      onClick={onOpen}
      aria-label={`檢視 ${account.name} 的完整帳戶資訊`}
    >
      <div className="flex items-center justify-between">
        <div className="overview-icon">
          {account.accountType === "bank" ? (
            <Landmark size={18} />
          ) : (
            <Building2 size={18} />
          )}
        </div>
        <span className="account-type">
          {account.accountType === "bank"
            ? "銀行"
            : account.accountType === "brokerage"
              ? "券商"
              : "現金"}
        </span>
      </div>
      <div className="mt-5">
        <h3 className="font-semibold">{account.name}</h3>
        <p className="mt-1 text-xs text-[#879189]">
          {account.institution || "未設定機構"}
        </p>
      </div>
      <div className="account-balances">
        {account.cashBalances.length ? (
          account.cashBalances.map((balance) => (
            <div key={balance.currency}>
              <span>{balance.currency}</span>
              <strong>{number.format(Number(balance.amount))}</strong>
            </div>
          ))
        ) : (
          <p>沒有現金餘額</p>
        )}
      </div>
      {(account.loans?.length ?? 0) > 0 && (
        <div className="mt-4 border-t border-[#e4e9e5] pt-3">
          <p className="text-[10px] font-semibold tracking-[.08em] text-[#956d5d]">
            貸款與負債
          </p>
          {account.loans?.map((loan) => (
            <div
              className="mt-2 flex items-center justify-between gap-3 text-xs"
              key={loan.loanId}
            >
              <span className="text-[#69766e]">{loan.name}</span>
              <strong className="text-[#7d503d]">
                {loan.currency}{" "}
                {number.format(Number(loan.outstandingPrincipal))}
              </strong>
            </div>
          ))}
        </div>
      )}
      <span className="card-detail-link">
        查看帳戶明細
        <ChevronRight size={14} aria-hidden="true" />
      </span>
    </button>
  );
}

function DetailDisclosure({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <details className="detail-disclosure">
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="detail-disclosure-body">{children}</div>
    </details>
  );
}

function AccountDetailDialog({
  account,
  range,
  valuesHidden,
  onOpenSecurity,
  onClose,
}: {
  account: AccountView;
  range: string;
  valuesHidden: boolean;
  onOpenSecurity: (item: PositionView) => void;
  onClose: () => void;
}) {
  const [trend, setTrend] = useState<AccountTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState("");
  useEffect(() => {
    let cancelled = false;
    request<AccountTrendPoint[]>(
      `/api/trends/accounts/${account.accountId}?range=${range}`,
    )
      .then((result) => {
        if (!cancelled) {
          setTrend(result);
          setTrendError("");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setTrendError(
            cause instanceof Error ? cause.message : "無法讀取帳戶走勢",
          );
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account.accountId, range]);

  const type =
    account.accountType === "bank"
      ? "銀行"
      : account.accountType === "brokerage"
        ? "券商"
        : "現金";
  const cashValue = accountCashTwd(account);
  const securityValue = account.positions.reduce(
    (total, item) => total + Number(item.marketValueTwd),
    0,
  );
  const liabilityValue = (account.loans ?? []).reduce(
    (total, loan) => total + Number(loan.valueTwd),
    0,
  );
  const totalAssetValue = cashValue + securityValue;
  const netValue = totalAssetValue - liabilityValue;
  return (
    <ViewAllDialog
      eyebrow="ACCOUNT DETAILS"
      title={account.name}
      count={`${type}帳戶・目前最新快照`}
      onClose={onClose}
    >
      <div className="space-y-7">
        <section>
          <h3 className="detail-section-title">帳戶概況</h3>
          <dl className="account-detail-grid">
            <div>
              <dt>帳戶資產</dt>
              <dd>
                {privateValue(valuesHidden, money(String(totalAssetValue)))}
              </dd>
            </div>
            <div>
              <dt>現金／證券</dt>
              <dd>
                {privateValue(
                  valuesHidden,
                  `${money(String(cashValue))}／${money(String(securityValue))}`,
                )}
              </dd>
            </div>
            <div>
              <dt>關聯負債</dt>
              <dd>
                {privateValue(valuesHidden, money(String(liabilityValue)))}
              </dd>
            </div>
            <div>
              <dt>帳戶淨值</dt>
              <dd>{privateValue(valuesHidden, money(String(netValue)))}</dd>
            </div>
          </dl>
        </section>
        <DetailDisclosure
          title="帳戶歷史走勢"
          summary="查看各快照的資產與淨值變化"
        >
          <p className="mb-3 text-xs text-[#7c8981]">
            顯示各快照的帳戶資產與扣除關聯負債後淨值。
          </p>
          <TrendChart
            data={trend}
            lines={[
              {
                key: "totalAssetValueTwd",
                label: "帳戶資產",
                color: "#87a98d",
              },
              { key: "netValueTwd", label: "帳戶淨值", color: "#245f46" },
            ]}
            loading={trendLoading}
            error={trendError}
            valuesHidden={valuesHidden}
          />
        </DetailDisclosure>
        <DetailDisclosure
          title="帳戶基本資料"
          summary={`${type}・${account.defaultCurrency}`}
        >
          <dl className="account-detail-grid">
            <div>
              <dt>機構</dt>
              <dd>{account.institution || "未設定"}</dd>
            </div>
            <div>
              <dt>帳戶類型</dt>
              <dd>{type}</dd>
            </div>
            <div>
              <dt>帳戶識別碼</dt>
              <dd>{account.accountReference || "未設定"}</dd>
            </div>
            <div>
              <dt>預設幣別</dt>
              <dd>{account.defaultCurrency}</dd>
            </div>
          </dl>
        </DetailDisclosure>
        <DetailDisclosure
          title="現金餘額"
          summary={`${account.cashBalances.length} 種幣別`}
        >
          {account.cashBalances.length ? (
            <div className="account-detail-list">
              {account.cashBalances.map((balance) => (
                <div key={balance.currency}>
                  <div>
                    <strong>{balance.currency}</strong>
                    {balance.fxRate && balance.currency !== "TWD" && (
                      <p>
                        匯率 1 {balance.currency} ={" "}
                        {number.format(Number(balance.fxRate.rate))} TWD・
                        {balance.fxRate.status === "fresh"
                          ? "最新"
                          : balance.fxRate.status === "stale"
                            ? "沿用"
                            : "手動"}
                      </p>
                    )}
                  </div>
                  <strong>{number.format(Number(balance.amount))}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#7c8981]">沒有現金餘額</p>
          )}
        </DetailDisclosure>
        <DetailDisclosure
          title="投資持倉"
          summary={`${account.positions.length} 筆持倉`}
        >
          {account.positions.length ? (
            <div className="holdings-panel view-all-holdings">
              {account.positions.map((item, index) => (
                <HoldingRow
                  key={item.positionId}
                  item={item}
                  divided={index > 0}
                  onOpen={() => onOpenSecurity(item)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#7c8981]">目前沒有投資持倉</p>
          )}
        </DetailDisclosure>
        <DetailDisclosure
          title="關聯貸款與負債"
          summary={`${account.loans?.length ?? 0} 筆`}
        >
          {account.loans?.length ? (
            <div className="accounts-grid view-all-grid">
              {account.loans.map((loan) => (
                <LoanCard key={loan.loanId} loan={loan} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#7c8981]">目前沒有關聯貸款或負債</p>
          )}
        </DetailDisclosure>
      </div>
    </ViewAllDialog>
  );
}

function SecurityDetailDialog({
  security,
  positions,
  sales,
  range,
  valuesHidden,
  returnAccountName,
  onBack,
  onClose,
}: {
  security: PositionView;
  positions: PositionView[];
  sales: SaleView[];
  range: string;
  valuesHidden: boolean;
  returnAccountName?: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  const [trend, setTrend] = useState<SecurityTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [trendError, setTrendError] = useState("");
  useEffect(() => {
    let cancelled = false;
    request<SecurityTrendPoint[]>(
      `/api/trends/securities/${security.securityId}?range=${range}`,
    )
      .then((result) => {
        if (!cancelled) {
          setTrend(result);
          setTrendError("");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setTrendError(
            cause instanceof Error ? cause.message : "無法讀取標的走勢",
          );
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, security.securityId]);

  const quantity = positions.reduce(
    (total, item) => total + Number(item.quantity),
    0,
  );
  const costValue = positions.reduce(
    (total, item) => total + Number(item.costValueTwd),
    0,
  );
  const marketValue = positions.reduce(
    (total, item) => total + Number(item.marketValueTwd),
    0,
  );
  const unrealizedPnl = positions.reduce(
    (total, item) => total + Number(item.unrealizedPnlTwd),
    0,
  );

  return (
    <ViewAllDialog
      eyebrow="SECURITY DETAILS"
      title={`${security.symbol}・${security.name}`}
      count={`${positions.length} 個帳戶持有・${security.market}`}
      onClose={onClose}
    >
      <div className="space-y-7">
        {onBack && returnAccountName && (
          <button className="secondary" type="button" onClick={onBack}>
            <ArrowLeft size={14} />
            返回 {returnAccountName}
          </button>
        )}
        <section>
          <h3 className="detail-section-title">標的概況</h3>
          <dl className="account-detail-grid">
            <div>
              <dt>持有總數量</dt>
              <dd>{privateValue(valuesHidden, number.format(quantity))}</dd>
            </div>
            <div>
              <dt>總成本</dt>
              <dd>{privateValue(valuesHidden, money(String(costValue)))}</dd>
            </div>
            <div>
              <dt>目前市值</dt>
              <dd>{privateValue(valuesHidden, money(String(marketValue)))}</dd>
            </div>
            <div>
              <dt>未實現損益</dt>
              <dd
                className={
                  unrealizedPnl >= 0 ? "text-[#2f7552]" : "text-[#a8443d]"
                }
              >
                {privateValue(valuesHidden, money(String(unrealizedPnl)))}
              </dd>
            </div>
          </dl>
        </section>
        <DetailDisclosure title="持有市值與成本走勢" summary="查看歷史快照變化">
          <p className="mb-3 text-xs text-[#7c8981]">
            買進、賣出與行情都會改變數值；此圖不代表排除資金進出的投資績效。
          </p>
          <TrendChart
            data={trend}
            lines={[
              { key: "marketValueTwd", label: "持有市值", color: "#245f46" },
              { key: "costValueTwd", label: "持有成本", color: "#c28a5b" },
            ]}
            loading={trendLoading}
            error={trendError}
            valuesHidden={valuesHidden}
          />
        </DetailDisclosure>
        <DetailDisclosure
          title="目前持有帳戶"
          summary={`${positions.length} 個帳戶`}
        >
          <div className="holdings-panel view-all-holdings">
            {positions.map((item, index) => (
              <HoldingRow
                key={item.positionId}
                item={item}
                divided={index > 0}
              />
            ))}
          </div>
        </DetailDisclosure>
        {sales.length > 0 && (
          <DetailDisclosure
            title="歷史全部賣出"
            summary={`${sales.length} 筆紀錄`}
          >
            <div className="account-detail-list">
              {sales.map((sale) => (
                <div key={sale.id}>
                  <div>
                    <strong>{sale.accountName}</strong>
                    <p>{new Date(sale.soldAt).toLocaleDateString("zh-TW")}</p>
                  </div>
                  <strong>
                    {privateValue(
                      valuesHidden,
                      sale.realizedPnlTwd === null
                        ? "損益未記錄"
                        : `已實現 ${money(sale.realizedPnlTwd)}`,
                    )}
                  </strong>
                </div>
              ))}
            </div>
          </DetailDisclosure>
        )}
        {security.securityType === "future" && (
          <p className="notice">
            期貨數量為各帳戶合計；不同契約月份或多空方向請以各帳戶持倉列為準。
          </p>
        )}
      </div>
    </ViewAllDialog>
  );
}

function TrendChart<T extends { capturedAt: string }>({
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
}: {
  data: T[];
  lines: Array<{ key: keyof T & string; label: string; color: string }>;
  loading: boolean;
  error: string;
  valuesHidden: boolean;
  insufficientMessage?: string;
  allowSinglePoint?: boolean;
  xTickFormatter?: (value: string) => string;
  xLabelFormatter?: (value: string) => string;
}) {
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

function LoanCard({ loan }: { loan: LoanView }) {
  const original = Number(loan.originalPrincipal ?? 0);
  const outstanding = Number(loan.outstandingPrincipal);
  const paidRatio =
    original > 0
      ? Math.min(Math.max(((original - outstanding) / original) * 100, 0), 100)
      : null;

  return (
    <article className="account-card">
      <div className="flex items-center justify-between gap-3">
        <div className="overview-icon">
          <Landmark size={18} />
        </div>
        <span className={`status ${outstanding === 0 ? "fresh" : "manual"}`}>
          {outstanding === 0 ? "已結清" : loanTypeLabels[loan.loanType]}
        </span>
      </div>
      <div className="mt-5">
        <h3 className="font-semibold">{loan.name}</h3>
        <p className="mt-1 text-xs text-[#879189]">
          {loan.institution || "未設定貸款機構"}
        </p>
      </div>
      <div className="mt-5">
        <p className="text-[10px] font-semibold tracking-[.08em] text-[#869088]">
          目前未償本金
        </p>
        <strong className="mt-1 block text-xl">
          {loan.currency} {number.format(outstanding)}
        </strong>
        <p className="mt-3 text-xs text-[#78857d]">
          {loan.annualInterestRate
            ? `年利率 ${number.format(Number(loan.annualInterestRate))}%`
            : "利率未設定"}
          {loan.monthlyPayment
            ? `・月付 ${loan.currency} ${number.format(Number(loan.monthlyPayment))}`
            : ""}
        </p>
        {loan.paymentDayOfMonth && (
          <p className="mt-1 text-xs text-[#78857d]">
            每月 {loan.paymentDayOfMonth} 日還款
          </p>
        )}
        {loan.nextPaymentDate && (
          <p className="mt-1 text-xs text-[#78857d]">
            下次繳款{" "}
            {new Date(loan.nextPaymentDate).toLocaleDateString("zh-TW")}
          </p>
        )}
        {paidRatio !== null && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#eee8e4]">
            <div
              className="h-full rounded-full bg-[#8b6756]"
              style={{ width: `${paidRatio}%` }}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function SortButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      className="secondary"
      onClick={onClick}
      disabled={disabled}
    >
      <ArrowUpDown size={14} />
      排序
    </button>
  );
}

function LoanPanel({
  loans,
  onViewAll,
  sortAction,
}: {
  loans: LoanView[];
  onViewAll: () => void;
  sortAction: React.ReactNode;
}) {
  return (
    <section className="content-section">
      <SectionHeading
        eyebrow="LIABILITIES"
        title="貸款與負債"
        description={`${loans.length} 筆貸款・依最新快照`}
        action={
          <div className="section-actions">
            {sortAction}
            {loans.length > 6 && (
              <button className="secondary" onClick={onViewAll}>
                <Eye size={14} />
                檢視全部
              </button>
            )}
          </div>
        }
      />
      {loans.length === 0 ? (
        <div className="rounded-[22px] border border-dashed border-[#d8ddd8] bg-white/55 py-10 text-center text-sm text-[#7c8981]">
          目前沒有貸款資料
        </div>
      ) : (
        <div className="accounts-grid">
          {loans.slice(0, 6).map((loan) => (
            <LoanCard key={loan.loanId} loan={loan} />
          ))}
        </div>
      )}
    </section>
  );
}

function CreditCardPanel({
  accounts,
  valuesHidden,
  onManage,
  sortAction,
}: {
  accounts: CreditCardAccountView[];
  valuesHidden: boolean;
  onManage: () => void;
  sortAction: React.ReactNode;
}) {
  const [trend, setTrend] = useState<CreditCardTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(accounts.length > 0);
  const [trendError, setTrendError] = useState("");
  const trendKey = accounts
    .map(
      (account) =>
        `${account.creditCardAccountId}:${account.dueDate}:${account.statementAmount}:${account.paymentAmount}`,
    )
    .join("|");
  useEffect(() => {
    if (accounts.length === 0) return;
    let cancelled = false;
    request<CreditCardTrendPoint[]>("/api/trends/credit-cards?range=all")
      .then((result) => {
        if (!cancelled) {
          setTrend(result);
          setTrendError("");
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled)
          setTrendError(
            cause instanceof Error ? cause.message : "無法讀取每月卡費走勢",
          );
      })
      .finally(() => {
        if (!cancelled) setTrendLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accounts.length, trendKey]);
  const activeAccounts = accounts.filter(
    (account) => account.status === "active",
  );
  const totalStatement = activeAccounts.reduce(
    (sum, account) => sum + Number(account.statementAmountTwd),
    0,
  );
  const totalLimit = activeAccounts.reduce(
    (sum, account) =>
      sum +
      Number(account.sharedCreditLimit) *
        (account.currency === "TWD" ? 1 : Number(account.fxRate?.rate ?? 0)),
    0,
  );
  const totalUsage =
    totalLimit > 0 ? (totalStatement / totalLimit) * 100 : null;
  return (
    <section id="credit-cards" className="content-section scroll-mt-24">
      <SectionHeading
        eyebrow="CREDIT CARDS"
        title="信用卡帳單"
        description={`${accounts.length} 個共用額度群組${totalUsage === null ? "" : `・總應繳使用比例 ${totalUsage.toFixed(1)}%`}`}
        action={
          <div className="section-actions">
            {sortAction}
            <button className="primary" onClick={onManage}>
              <CreditCard size={14} />
              {accounts.length === 0 ? "新增信用卡" : "管理信用卡帳戶"}
            </button>
          </div>
        }
      />
      {accounts.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-[#d8ddd8] bg-white/55 py-10 text-center text-sm text-[#7c8981]">
          尚未建立信用卡帳戶；信用卡不需要連結銀行存款帳戶。
        </div>
      ) : (
        <>
          <details className="inline-disclosure mt-4">
            <summary className="inline-disclosure-summary">
              <div>
                <p className="eyebrow">MONTHLY PAYMENTS</p>
                <h2>每月卡費走勢</h2>
                <p className="mt-1 text-xs text-[#7c8981]">
                  依繳款到期月份統計；同月份每個信用卡帳戶只採用最後一次更新，並統一換算為新臺幣。
                </p>
              </div>
              <span className="dashboard-disclosure-action">
                展開走勢
                <ChevronDown size={16} aria-hidden="true" />
              </span>
            </summary>
            <div className="inline-disclosure-body">
              <TrendChart
                data={trend}
                lines={[
                  {
                    key: "totalDueTwd",
                    label: "總應繳金額",
                    color: "#245f46",
                  },
                  {
                    key: "paymentAmountTwd",
                    label: "實際繳款金額",
                    color: "#c28a5b",
                  },
                ]}
                loading={trendLoading}
                error={trendError}
                valuesHidden={valuesHidden}
                insufficientMessage="至少需要兩個月份的信用卡紀錄才能顯示走勢"
                allowSinglePoint
                xTickFormatter={(value) => `${Number(value.slice(5, 7))} 月`}
                xLabelFormatter={(value) =>
                  `${value.slice(0, 4)} 年 ${Number(value.slice(5, 7))} 月應繳`
                }
              />
            </div>
          </details>
          <div className="accounts-grid">
            {accounts.map((account) => {
              const displayPayment = creditCardDisplayPayment(
                account.dueDate,
                account.paymentDayOfMonth,
                account.paymentStatus,
              );
              const paymentLabel = displayPayment.label;

              return (
                <article
                  className="account-card credit-card-card"
                  key={account.creditCardAccountId}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="overview-icon shrink-0">
                        <CreditCard size={17} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {account.name}
                        </h3>
                        <p className="mt-0.5 truncate text-[11px] text-[#879189]">
                          {account.issuer}・
                          {
                            account.cards.filter(
                              (card) => card.status === "active",
                            ).length
                          }{" "}
                          張使用中
                          {account.cards.some(
                            (card) => card.status !== "active",
                          )
                            ? `・${account.cards.filter((card) => card.status !== "active").length} 張停用／剪卡`
                            : ""}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-[#40564a]">
                          {creditCardPaymentMonthLabel(displayPayment.dueDate)}
                          應繳
                        </p>
                      </div>
                    </div>
                    <span
                      className={`status ${!account.cards.some((card) => card.status === "active") ? "stale" : paymentLabel === "已繳" ? "fresh" : account.paymentStatus === "overdue" ? "manual" : "stale"}`}
                    >
                      {account.cards.length > 0 &&
                      !account.cards.some((card) => card.status === "active")
                        ? "無使用中卡片"
                        : paymentLabel}
                    </span>
                  </div>
                  <div className="account-balances">
                    <div>
                      <span>共用額度</span>
                      <strong>
                        {privateValue(
                          valuesHidden,
                          `${account.currency} ${number.format(Number(account.sharedCreditLimit))}`,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>總應繳金額</span>
                      <strong>
                        {privateValue(
                          valuesHidden,
                          `${account.currency} ${number.format(Number(account.statementAmount))}`,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>帳單使用比例</span>
                      <strong>{percent(account.utilizationPct)}</strong>
                    </div>
                    <div>
                      <span>剩餘分期本金</span>
                      <strong>
                        {privateValue(
                          valuesHidden,
                          `${account.currency} ${number.format(Number(account.remainingInstallmentPrincipal))}`,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>目前計入負債</span>
                      <strong className="negative">
                        {privateValue(
                          valuesHidden,
                          money(account.liabilityValueTwd),
                        )}
                      </strong>
                    </div>
                    {Number(account.creditAssetValueTwd) > 0 && (
                      <div>
                        <span>溢繳資產</span>
                        <strong className="positive">
                          {privateValue(
                            valuesHidden,
                            money(account.creditAssetValueTwd),
                          )}
                        </strong>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-[#7c8981]">
                    帳單月份{" "}
                    {displayPayment.awaitingUpdate
                      ? "待更新"
                      : creditCardPaymentMonthLabel(account.statementPeriod)}
                    ・繳款期限 {displayPayment.dueDate || "尚未設定"}
                    {!displayPayment.awaitingUpdate &&
                    account.paymentStatus === "overdue"
                      ? "・已逾期"
                      : !displayPayment.awaitingUpdate && account.paymentDate
                        ? `・${account.paidOnTime ? "準時繳款" : "逾期繳款"}`
                        : ""}
                  </p>
                  {account.cards.length > 0 && (
                    <p
                      className="mt-1 truncate text-[11px] leading-5 text-[#7c8981]"
                      title={account.cards
                        .map(
                          (card) =>
                            `${card.name}${card.lastFour ? ` •••• ${card.lastFour}` : ""}${card.status === "closed" ? "（已剪卡）" : card.status === "inactive" ? "（停用）" : ""}`,
                        )
                        .join("、")}
                    >
                      {account.cards.map((card, index) => (
                        <span
                          className={
                            card.status === "closed"
                              ? "line-through opacity-55"
                              : card.status === "inactive"
                                ? "opacity-65"
                                : ""
                          }
                          key={card.cardId ?? `${card.name}-${index}`}
                        >
                          {index > 0 ? "、" : ""}
                          {card.name}
                          {card.lastFour ? ` •••• ${card.lastFour}` : ""}
                          {card.status === "closed"
                            ? "（已剪卡）"
                            : card.status === "inactive"
                              ? "（停用）"
                              : ""}
                        </span>
                      ))}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

const emptyCreditCardAccount = (): CreditCardAccountInput => {
  const current = new Date();
  const day = current.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  return {
    name: "新信用卡帳戶",
    issuer: "",
    currency: "TWD",
    sharedCreditLimit: "0",
    statementDayOfMonth: null,
    paymentDayOfMonth: null,
    status: "active",
    note: null,
    cards: [],
    statementPeriod: day.slice(0, 7),
    statementDate: day,
    dueDate: day,
    statementAmount: "",
    paymentAmount: "",
    paymentDate: null,
    remainingInstallmentPrincipal: "",
    overpaymentBalance: "",
  };
};

function creditCardInput(
  account: CreditCardAccountView,
): CreditCardAccountInput {
  return {
    creditCardAccountId: account.creditCardAccountId,
    name: account.name,
    issuer: account.issuer,
    currency: account.currency,
    sharedCreditLimit: account.sharedCreditLimit,
    statementDayOfMonth: account.statementDayOfMonth,
    paymentDayOfMonth: account.paymentDayOfMonth,
    status: normalizeCreditCardAccountStatus(account.status, account.cards),
    note: account.note,
    cards: account.cards.map((card) => ({ ...card })),
    statementPeriod: account.statementPeriod,
    statementDate: account.statementDate,
    dueDate: account.dueDate,
    statementAmount: account.statementAmount,
    paymentAmount: account.paymentAmount,
    paymentDate: account.paymentDate,
    remainingInstallmentPrincipal:
      Number(account.remainingInstallmentPrincipal) === 0
        ? ""
        : account.remainingInstallmentPrincipal,
    overpaymentBalance:
      Number(account.overpaymentBalance) === 0
        ? ""
        : account.overpaymentBalance,
    fxRate: account.fxRate,
  };
}

function CreditCardEditor({
  latest,
  onClose,
  onSaved,
}: {
  latest: NonNullable<DashboardData["latest"]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accounts, setAccounts] = useState<CreditCardAccountInput[]>(() =>
    latest.creditCardAccounts.length > 0
      ? latest.creditCardAccounts.map(creditCardInput)
      : [emptyCreditCardAccount()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateAccount = (
    index: number,
    patch: Partial<CreditCardAccountInput>,
  ) =>
    setAccounts((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (
        accounts.some(
          (account) =>
            !account.creditCardAccountId && !account.paymentDayOfMonth,
        )
      ) {
        throw new Error("新增信用卡額度群組時，請設定每月繳款期限");
      }
      const capturedAt = new Date(
        Math.max(Date.now(), Date.parse(latest.capturedAt) + 1),
      ).toISOString();
      const normalizedAccounts = accounts.map((account) => ({
        ...account,
        status: normalizeCreditCardAccountStatus(account.status, account.cards),
        ...(creditCardCycleDates(
          account.paymentDate || capturedAt,
          account.statementDayOfMonth,
          account.paymentDayOfMonth,
        ) ?? {}),
        remainingInstallmentPrincipal:
          account.remainingInstallmentPrincipal || "0",
        overpaymentBalance: account.overpaymentBalance || "0",
      }));
      await request("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: "更新信用卡帳戶設定",
          baseSnapshotId: latest.id,
          capturedAt,
          accounts: latest.accounts,
          loans: latest.loans,
          creditCardAccounts: normalizedAccounts,
          cashFlows: [],
        }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "信用卡資料儲存失敗");
      setBusy(false);
    }
  };

  return (
    <div
      className="view-all-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-card-editor-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="view-all-dialog">
        <header className="view-all-header">
          <div>
            <p className="eyebrow">CREDIT CARDS</p>
            <h2 id="credit-card-editor-title">管理信用卡帳戶</h2>
            <p>編輯共用額度與實體卡片；每月繳款狀況請在「新增快照」中更新。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X size={17} />
          </button>
        </header>
        <div className="view-all-body space-y-4">
          {error && <p className="notice error">{error}</p>}
          {accounts.map((account, accountIndex) => {
            const statement = Number(account.statementAmount || 0);
            const payment = Number(account.paymentAmount || 0);
            const installment = Number(
              account.remainingInstallmentPrincipal || 0,
            );
            const overpayment = Number(account.overpaymentBalance || 0);
            const outstanding = Math.max(statement - payment, 0);
            const net = outstanding + installment - overpayment;
            const utilization = Number(account.sharedCreditLimit)
              ? (statement / Number(account.sharedCreditLimit)) * 100
              : null;
            return (
              <details
                open
                className="overflow-hidden rounded-[22px] border border-[#dce4dd] bg-white"
                key={account.creditCardAccountId ?? accountIndex}
              >
                <summary className="cursor-pointer list-none border-b border-[#e7ece8] bg-[#f8faf7] px-5 py-4 marker:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{account.name}</p>
                      <p className="mt-1 text-[11px] text-[#7a877f]">
                        {account.issuer || "尚未設定發卡銀行"}・共用額度群組
                      </p>
                    </div>
                    <span className="account-type">檢查／編輯</span>
                  </div>
                </summary>
                <div className="space-y-5 p-5">
                  <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                    <label>
                      帳戶名稱
                      <input
                        className="field"
                        value={account.name}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            name: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      發卡銀行
                      <input
                        className="field"
                        value={account.issuer}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            issuer: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      帳單幣別
                      <input
                        className="field"
                        maxLength={3}
                        value={account.currency}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            currency: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      共用信用額度
                      <input
                        className="field"
                        inputMode="decimal"
                        value={account.sharedCreditLimit}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            sharedCreditLimit: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      每月結帳日
                      <input
                        className="field"
                        type="number"
                        min={1}
                        max={31}
                        value={account.statementDayOfMonth ?? ""}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            statementDayOfMonth: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                    <label>
                      每月繳款期限（日）
                      <input
                        className="field"
                        type="number"
                        min={1}
                        max={31}
                        value={account.paymentDayOfMonth ?? ""}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            paymentDayOfMonth: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                    <label>
                      額度群組狀態
                      <select
                        className="field"
                        value={account.status}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            status: event.target
                              .value as CreditCardAccountInput["status"],
                          })
                        }
                      >
                        <option value="active">使用中</option>
                        <option value="inactive">停用</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    帳戶備註
                    <textarea
                      className="field min-h-20"
                      value={account.note ?? ""}
                      onChange={(event) =>
                        updateAccount(accountIndex, {
                          note: event.target.value || null,
                        })
                      }
                    />
                  </label>

                  <div className="border-t border-[#e5ebe6] pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">實體卡片</h3>
                        <p className="mt-1 text-[11px] text-[#7c8981]">
                          同群組的卡片共用上方額度；只保存名稱與末四碼。
                        </p>
                      </div>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() =>
                          updateAccount(accountIndex, {
                            cards: [
                              ...account.cards,
                              {
                                name: "新卡片",
                                lastFour: null,
                                network: null,
                                holderType: "primary",
                                status: "active",
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={14} /> 新增卡片
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {account.cards.map((card, cardIndex) => (
                        <div
                          className="grid grid-cols-[1.4fr_.7fr_.8fr_.8fr_.8fr_auto] gap-2 rounded-xl border border-[#e4e9e5] p-3 max-lg:grid-cols-2 max-sm:grid-cols-1"
                          key={card.cardId ?? cardIndex}
                        >
                          <label>
                            卡片名稱
                            <input
                              className="field"
                              value={card.name}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            末四碼
                            <input
                              className="field"
                              inputMode="numeric"
                              maxLength={4}
                              value={card.lastFour ?? ""}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          lastFour:
                                            event.target.value.replace(
                                              /\D/g,
                                              "",
                                            ) || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            卡別
                            <select
                              className="field"
                              value={card.network ?? ""}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          network:
                                            (event.target.value as NonNullable<
                                              typeof item.network
                                            >) || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            >
                              <option value="">未設定</option>
                              <option value="visa">Visa</option>
                              <option value="mastercard">Mastercard</option>
                              <option value="jcb">JCB</option>
                              <option value="amex">American Express</option>
                              <option value="unionpay">銀聯</option>
                              <option value="other">其他</option>
                            </select>
                          </label>
                          <label>
                            持卡人
                            <select
                              className="field"
                              value={card.holderType ?? ""}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          holderType:
                                            (event.target.value as NonNullable<
                                              typeof item.holderType
                                            >) || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            >
                              <option value="">未設定</option>
                              <option value="primary">主卡</option>
                              <option value="additional">附卡</option>
                            </select>
                          </label>
                          <label>
                            狀態
                            <select
                              className="field"
                              value={card.status}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          status: event.target
                                            .value as typeof item.status,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            >
                              <option value="active">使用中</option>
                              <option value="inactive">停用</option>
                              <option value="closed">已剪卡</option>
                            </select>
                          </label>
                          {!card.cardId && (
                            <button
                              className="icon-button self-end"
                              type="button"
                              aria-label="移除尚未保存的卡片"
                              onClick={() =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.filter(
                                    (_, index) => index !== cardIndex,
                                  ),
                                })
                              }
                            >
                              <X size={15} />
                            </button>
                          )}
                          <label className="col-span-full">
                            卡片備註
                            <input
                              className="field"
                              value={card.note ?? ""}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          note: event.target.value || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!account.creditCardAccountId ? (
                    <div className="border-t border-[#e5ebe6] pt-5">
                      <h3 className="text-sm font-semibold">每月繳款狀況</h3>
                      <p className="mt-1 text-[11px] text-[#7c8981]">
                        每月請在繳款期限前更新一次。剩餘分期本金與銀行顯示的溢繳餘額沒有資料時可留白。
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                        <label>
                          繳款日期
                          <input
                            className="field"
                            type="date"
                            value={inputDate(account.paymentDate)}
                            onChange={(event) =>
                              updateAccount(accountIndex, {
                                paymentDate: event.target.value || null,
                              })
                            }
                          />
                        </label>
                        {[
                          ["總應繳金額", "statementAmount"],
                          ["實際繳款金額", "paymentAmount"],
                          [
                            "剩餘分期本金（選填）",
                            "remainingInstallmentPrincipal",
                          ],
                          ["銀行顯示的溢繳餘額（選填）", "overpaymentBalance"],
                        ].map(([label, key]) => (
                          <label key={key}>
                            {label}
                            <input
                              className="field"
                              inputMode="decimal"
                              value={String(
                                account[key as keyof CreditCardAccountInput] ??
                                  "",
                              )}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  [key]: event.target.value,
                                })
                              }
                            />
                          </label>
                        ))}
                        <div className="rounded-xl bg-[#f4f7f4] px-3 py-2 text-xs">
                          <span className="block text-[#7c8981]">
                            本次繳款期限
                          </span>
                          <strong className="mt-2 block">
                            {account.paymentDayOfMonth
                              ? (creditCardCycleDates(
                                  account.paymentDate || account.dueDate,
                                  account.statementDayOfMonth,
                                  account.paymentDayOfMonth,
                                )?.dueDate ?? "請先設定每月繳款期限")
                              : "請先設定每月繳款期限"}
                          </strong>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-[#f4f7f4] p-4 text-xs max-lg:grid-cols-2 max-sm:grid-cols-1">
                        <div>
                          <p className="text-[#7c8981]">帳單使用比例</p>
                          <strong className="mt-1 block">
                            {utilization === null
                              ? "無法計算"
                              : `${utilization.toFixed(1)}%`}
                          </strong>
                        </div>
                        <div>
                          <p className="text-[#7c8981]">帳單尚欠</p>
                          <strong className="mt-1 block">
                            {account.currency} {number.format(outstanding)}
                          </strong>
                        </div>
                        <div>
                          <p className="text-[#7c8981]">計入負債</p>
                          <strong className="negative mt-1 block">
                            {account.currency} {number.format(Math.max(net, 0))}
                          </strong>
                        </div>
                        <div>
                          <p className="text-[#7c8981]">溢繳資產</p>
                          <strong className="positive mt-1 block">
                            {account.currency}{" "}
                            {number.format(Math.max(-net, 0))}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="notice">
                      每月總應繳、實際繳款、分期本金與溢繳餘額，統一在「新增快照」中更新。
                    </div>
                  )}

                  {!account.creditCardAccountId && accounts.length > 1 && (
                    <button
                      className="danger"
                      type="button"
                      onClick={() =>
                        setAccounts((items) =>
                          items.filter((_, index) => index !== accountIndex),
                        )
                      }
                    >
                      移除尚未保存的額度群組
                    </button>
                  )}
                </div>
              </details>
            );
          })}
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setAccounts((items) => [...items, emptyCreditCardAccount()])
            }
          >
            <Plus size={14} /> 新增共用額度群組
          </button>
        </div>
        <footer className="quote-failure-footer">
          <p>保存後會建立新快照；既有銀行餘額不會因此變動。</p>
          <div>
            <button className="secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy} onClick={save}>
              {busy ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : null}
              {busy ? "保存中…" : "保存信用卡帳戶設定"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function HoldingRow({
  item,
  divided,
  canSell = false,
  onOpen,
  onSell,
}: {
  item: PositionView;
  divided: boolean;
  canSell?: boolean;
  onOpen?: () => void;
  onSell?: () => void;
}) {
  return (
    <div
      className={`holding-row ${divided ? "border-t border-[#e8ece8]" : ""} ${onOpen ? "cursor-pointer transition-colors hover:bg-[#f7faf7]" : ""}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          onOpen &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onOpen();
        }
      }}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `檢視 ${item.symbol} 的標的資訊` : undefined}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="security-mark">{item.symbol.slice(0, 4)}</div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{item.name}</p>
          <p className="mt-1 truncate text-xs text-[#7e8a82]">
            {item.symbol}・
            {item.securityType === "fund"
              ? "基金"
              : item.securityType === "etf"
                ? "ETF"
                : item.securityType === "future"
                  ? `${item.positionSide === "short" ? "空單" : "多單"}期貨`
                  : "股票"}
            ・{item.accountName}
          </p>
        </div>
      </div>
      <HoldingValue
        label="持有數量"
        value={`${number.format(Number(item.quantity))}${item.securityType === "future" ? " 口" : ""}`}
      />
      <HoldingValue
        label={
          item.securityType === "future" ? "均價 / 現價" : "平均成本 / 現價"
        }
        value={`${item.quoteCurrency} ${number.format(Number(item.averageCost))} / ${number.format(Number(item.marketPrice))}`}
      />
      <HoldingValue
        label="未實現損益 / 比例"
        value={`${money(item.unrealizedPnlTwd)} / ${percent(positionUnrealizedReturnPct(item))}`}
        tone={Number(item.unrealizedPnlTwd) >= 0 ? "positive" : "negative"}
      />
      <HoldingValue
        label={item.securityType === "future" ? "參考名目價值" : "市值"}
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
        {canSell && onSell && (
          <button
            className="rounded-full border border-[#ead9d6] px-3 py-1.5 text-[11px] font-semibold text-[#9b5149]"
            onClick={(event) => {
              event.stopPropagation();
              onSell();
            }}
          >
            全部賣出
          </button>
        )}
        {onOpen && (
          <ChevronRight
            className="holding-detail-arrow"
            size={16}
            aria-hidden="true"
          />
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

function HistoryPanel({
  data,
  valuesHidden,
  onViewAll,
}: {
  data: DashboardData;
  valuesHidden: boolean;
  onViewAll: () => void;
}) {
  return (
    <article className="history-panel">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">SNAPSHOTS</p>
          <h2>歷史快照</h2>
        </div>
        {data.history.length > 5 && (
          <button className="secondary" onClick={onViewAll}>
            <Eye size={14} />
            檢視全部
          </button>
        )}
      </div>
      <HistoryList
        items={data.history.slice(0, 5)}
        valuesHidden={valuesHidden}
      />
    </article>
  );
}

function HistoryList({
  items,
  valuesHidden,
}: {
  items: SnapshotSummary[];
  valuesHidden: boolean;
}) {
  return (
    <div className="mt-4">
      {items.map((item, index) => (
        <div key={item.id} className="timeline-row">
          <div className="flex flex-col items-center">
            <span
              className={`h-2.5 w-2.5 rounded-full ${index === 0 ? "bg-[#4d825f] ring-4 ring-[#e2eee4]" : "bg-[#c5cec7]"}`}
            />
            {index < items.length - 1 && (
              <span className="mt-1 h-full w-px bg-[#e3e9e4]" />
            )}
          </div>
          <div className="flex flex-1 items-start justify-between gap-4 pb-3">
            <div>
              <p className="text-sm font-medium">
                {index === 0
                  ? "最新快照"
                  : dateFormatter.format(new Date(item.capturedAt))}
              </p>
              <p className="mt-1 text-xs text-[#829087]">
                {privateValue(
                  valuesHidden,
                  `資產 ${money(item.totalAssetValueTwd)}・負債 ${money(item.totalLiabilitiesTwd)}`,
                )}
              </p>
              <p
                className="mt-1 line-clamp-1 text-[11px] leading-4 text-[#65736a]"
                title={item.rawInput || "手動建立資產快照"}
              >
                {item.rawInput || "手動建立資產快照"}
              </p>
            </div>
            <strong className="text-sm font-semibold">
              {privateValue(valuesHidden, money(item.netWorthTwd))}
            </strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function SoldPanel({
  data,
  onOpen,
  onViewAll,
}: {
  data: DashboardData;
  onOpen: (sale: SaleView) => void;
  onViewAll: () => void;
}) {
  return (
    <article id="sold" className="history-panel">
      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">CLOSED</p>
          <h2>已售出</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#f2f5f1] px-2.5 py-1 text-xs text-[#77847c]">
            {data.sold.length}
          </span>
          {data.sold.length > 5 && (
            <button className="secondary" onClick={onViewAll}>
              <Eye size={14} />
              檢視全部
            </button>
          )}
        </div>
      </div>
      {data.sold.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center">
          <div>
            <CheckCircle2 className="mx-auto text-[#8dab96]" />
            <p className="mt-3 text-sm font-medium">尚無全部賣出紀錄</p>
            <p className="mt-1 text-xs text-[#849087]">
              結束的持倉會保留在這裡
            </p>
          </div>
        </div>
      ) : (
        <SoldList items={data.sold.slice(0, 5)} onOpen={onOpen} />
      )}
    </article>
  );
}

function SoldList({
  items,
  onOpen,
}: {
  items: SaleView[];
  onOpen: (sale: SaleView) => void;
}) {
  return (
    <div className="mt-4 space-y-2.5">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpen(item)}
          className="flex w-full items-center justify-between rounded-2xl border border-[#e5ebe6] bg-[#fafcf9] p-3 text-left"
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
            {item.realizedPnlTwd !== null && (
              <p
                className={`mt-1 text-[10px] font-semibold ${Number(item.realizedPnlTwd) >= 0 ? "text-[#2f7552]" : "text-[#a8443d]"}`}
              >
                已實現 {money(item.realizedPnlTwd)}
              </p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
