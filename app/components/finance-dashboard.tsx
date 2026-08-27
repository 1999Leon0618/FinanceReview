"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Archive,
  Banknote,
  Bot,
  Building2,
  CheckCircle2,
  Download,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import type {
  AccountStateInput,
  DashboardData,
  ParserPatch,
  PositionView,
  SaleView,
  SnapshotProposal,
} from "@/lib/types";

const twd = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });
const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
});
const date = {
  format: (value: unknown) =>
    dateFormatter.format(
      value instanceof Date ? value : new Date(String(value)),
    ),
};
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
const toUtc = (value: string) =>
  new Date(`${value}T00:00:00+08:00`).toISOString();
const money = (value?: string | null) => `NT$${twd.format(Number(value ?? 0))}`;
const manualFx = (baseCurrency: string, rate: string) => ({
  baseCurrency: baseCurrency.toUpperCase(),
  quoteCurrency: "TWD" as const,
  rate,
  rateAsOf: new Date().toISOString(),
  source: "MANUAL" as const,
  status: "manual" as const,
  overriddenByUser: true,
});
const emptyAccount = (): AccountStateInput => ({
  name: "新帳戶",
  accountType: "brokerage",
  defaultCurrency: "TWD",
  cashBalances: [{ currency: "TWD", amount: "0" }],
  positions: [],
});

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error ?? "操作失敗");
  return body as T;
}

function Modal({
  children,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#07140f]/70 p-4 backdrop-blur-md"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className={`max-h-[94vh] w-full overflow-y-auto rounded-[28px] bg-[#f5f7f4] shadow-[0_28px_90px_rgba(4,20,13,.35)] ${wide ? "max-w-6xl" : "max-w-lg"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function SnapshotEditor({
  latest,
  onClose,
  onSaved,
}: {
  latest: DashboardData["latest"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rawInput, setRawInput] = useState("");
  const [accounts, setAccounts] = useState<AccountStateInput[]>(
    () =>
      latest?.accounts.map((account) => ({
        ...account,
        cashBalances: account.cashBalances.map((item) => ({ ...item })),
        positions: account.positions.map((item) => ({ ...item })),
      })) ?? [emptyAccount()],
  );
  const [sales, setSales] = useState<ParserPatch["sales"]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [modelStatus, setModelStatus] = useState<{
    available: boolean;
    modelLoaded: boolean;
    modelInstalled: boolean;
  } | null>(null);
  const needsManualPrice = accounts.some((account) =>
    account.positions.some((position) =>
      Boolean(position.quoteNote?.includes("行情")),
    ),
  );

  useEffect(() => {
    let cancelled = false;
    request<{
      available: boolean;
      modelLoaded: boolean;
      modelInstalled: boolean;
    }>("/api/model-status")
      .then((status) => {
        if (!cancelled) setModelStatus(status);
      })
      .catch(() => {
        if (!cancelled)
          setModelStatus({
            available: false,
            modelLoaded: false,
            modelInstalled: false,
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateAccount = (index: number, patch: Partial<AccountStateInput>) =>
    setAccounts((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const parse = async () => {
    setBusy("parse");
    setError("");
    try {
      const proposal = await request<SnapshotProposal>(
        "/api/snapshot-proposals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawInput }),
        },
      );
      setAccounts(
        proposal.accounts.length ? proposal.accounts : [emptyAccount()],
      );
      setSales(proposal.sales);
      setWarnings(proposal.warnings);
      setUnsupported(proposal.unsupportedReason);
      setModelStatus((status) =>
        status ? { ...status, modelLoaded: true } : status,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message}；你仍可直接編輯下方確認表。`
          : "解析失敗",
      );
    } finally {
      setBusy("");
    }
  };
  const quotes = async () => {
    setBusy("quotes");
    setError("");
    try {
      const result = await request<{
        accounts: AccountStateInput[];
        warnings: string[];
      }>("/api/quotes/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts }),
      });
      setAccounts(result.accounts);
      setWarnings(result.warnings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "行情更新失敗");
    } finally {
      setBusy("");
    }
  };
  const save = async () => {
    setBusy("save");
    setError("");
    try {
      await request("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput,
          baseSnapshotId: latest?.id ?? null,
          accounts,
        }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗");
      setBusy("");
    }
  };
  const confirmSale = async (sale: ParserPatch["sales"][number]) => {
    const position = latest?.accounts
      .find((account) => account.name === sale.accountName)
      ?.positions.find(
        (item) => item.market === sale.market && item.symbol === sale.symbol,
      );
    if (!position) {
      setError(`最新快照找不到 ${sale.accountName} 的 ${sale.symbol}`);
      return;
    }
    setBusy("sale");
    try {
      await request(`/api/positions/${position.positionId}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soldAt: sale.soldAt,
          salePrice: sale.salePrice ?? null,
          currency: position.quoteCurrency,
          note: sale.note ?? null,
        }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "賣出失敗");
      setBusy("");
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#dce3dd] bg-white/95 px-8 py-5 backdrop-blur-xl max-sm:px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#153f2f] text-[#d8f77f] shadow-sm">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold tracking-[-.02em]">
                建立資產快照
              </h2>
              <span className="rounded-full bg-[#e8f1e9] px-2 py-1 text-[10px] font-bold tracking-wide text-[#2b674c]">
                本機處理
              </span>
            </div>
            <p className="mt-1 text-xs text-[#718078]">
              先描述目前狀態，再確認解析結果
            </p>
          </div>
        </div>
        <button
          className="grid h-10 w-10 place-items-center rounded-full border border-[#dce3dd] bg-white text-[#657269]"
          aria-label="關閉"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="space-y-6 p-7 max-sm:p-4">
        <section className="overflow-hidden rounded-[24px] bg-[#10291f] text-white shadow-[0_18px_50px_rgba(16,41,31,.15)]">
          <div className="grid grid-cols-[300px_minmax(0,1fr)] max-lg:grid-cols-1">
            <div className="flex flex-col justify-between border-r border-white/10 p-6 max-lg:border-b max-lg:border-r-0">
              <div>
                <div className="flex items-center gap-2 text-[#d7f47f]">
                  <Bot size={18} />
                  <span className="text-xs font-bold tracking-[.12em]">
                    自然語言整理
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-[-.03em]">
                  說明你現在擁有什麼
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/58">
                  銀行餘額、股票持倉可以分開輸入，也可以一次混合描述。
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/[.07] px-3 py-2.5 text-xs">
                <span
                  className={`h-2 w-2 rounded-full ${modelStatus?.modelLoaded ? "bg-[#c8f16b]" : modelStatus?.available ? "bg-[#f1c66b]" : "bg-[#e77b70]"}`}
                />
                {!modelStatus
                  ? "正在檢查本機模型…"
                  : modelStatus.modelLoaded
                    ? "gemma4:26b 已載入"
                    : modelStatus.available
                      ? "模型待命中，首次解析需要較久"
                      : "模型不可用，可改用右側手動表單"}
              </div>
            </div>
            <div className="bg-[#f8faf7] p-6 text-[#17251d]">
              <label className="text-xs font-bold uppercase tracking-[.12em] text-[#637168]">
                目前資產狀態
              </label>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                rows={5}
                placeholder="例如：永豐銀行餘額 30,652 元；富邦證券有 0050 共 3,000 股，平均成本 126.4 元。"
                className="mt-3 w-full resize-y rounded-2xl border border-[#d5ded7] bg-white px-4 py-3.5 text-[15px] leading-7 outline-none transition focus:border-[#4d8067] focus:ring-4 focus:ring-[#397456]/10"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "永豐銀行餘額為 30,652 元",
                  "富邦證券 0050 有 3,000 股，平均成本 126.4",
                  "國泰證券 AAPL 有 18 股，平均成本 178.5 美元",
                ].map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setRawInput(example)}
                    className="rounded-full border border-[#d8e0da] bg-white px-3 py-1.5 text-[11px] text-[#536159] hover:border-[#85a18f]"
                  >
                    {example}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  disabled={
                    !rawInput.trim() ||
                    !!busy ||
                    modelStatus?.available === false
                  }
                  onClick={parse}
                  className="primary min-w-48"
                >
                  {busy === "parse" ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {busy === "parse"
                    ? modelStatus?.modelLoaded
                      ? "正在理解資產資料…"
                      : "正在載入模型並解析…"
                    : "整理成確認表"}
                </button>
                <p className="text-[11px] leading-5 text-[#78857d]">
                  只有按下最下方「保存快照」才會寫入資料庫
                </p>
              </div>
            </div>
          </div>
        </section>
        {unsupported && (
          <p className="notice error">不支援交易推算：{unsupported}</p>
        )}
        {error && <p className="notice error">{error}</p>}
        {warnings.length > 0 && (
          <div className="notice">
            {warnings.map((item, index) => (
              <p key={`${item}-${index}`}>• {item}</p>
            ))}
          </div>
        )}
        {sales.length > 0 && (
          <section className="rounded-2xl border border-[#e0cda1] bg-[#fff9e9] p-5">
            <h3 className="font-semibold">待確認的全部賣出</h3>
            {sales.map((sale) => (
              <div
                key={`${sale.accountName}-${sale.symbol}`}
                className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 text-sm"
              >
                <span>
                  {sale.accountName}・{sale.symbol}・
                  {new Date(sale.soldAt).toLocaleDateString("zh-TW")}
                  {sale.salePrice ? `・成交 ${sale.salePrice}` : ""}
                </span>
                <button
                  disabled={!!busy}
                  className="danger"
                  onClick={() => confirmSale(sale)}
                >
                  確認全部賣出
                </button>
              </div>
            ))}
          </section>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#3a7658]">
              確認資料
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-[-.02em]">
              帳戶、餘額與持倉
            </h3>
            <p className="mt-1 text-xs text-[#718078]">
              所有欄位都可以修改；行情與匯率不會採用模型猜測值。
            </p>
          </div>
          <button disabled={!!busy} onClick={quotes} className="secondary">
            <RefreshCw
              className={busy === "quotes" ? "animate-spin" : ""}
              size={14}
            />
            {busy === "quotes" ? "取得行情中…" : "更新行情與匯率"}
          </button>
        </div>
        <div className="space-y-4">
          {accounts.map((account, accountIndex) => (
            <section
              key={account.accountId ?? accountIndex}
              className="overflow-hidden rounded-[22px] border border-[#dce4dd] bg-white shadow-[0_8px_28px_rgba(31,60,45,.05)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7ece8] bg-[#f8faf7] px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e5f0e7] text-[#2c6a4d]">
                    {account.accountType === "bank" ? (
                      <Banknote size={18} />
                    ) : (
                      <TrendingUp size={18} />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold">
                      {account.name || `帳戶 ${accountIndex + 1}`}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#7a877f]">
                      {account.cashBalances.length} 筆餘額・
                      {account.positions.length} 筆持倉
                    </p>
                  </div>
                </div>
                {accounts.length > 1 && (
                  <button
                    type="button"
                    className="link danger-text"
                    onClick={() =>
                      setAccounts((items) =>
                        items.filter((_, index) => index !== accountIndex),
                      )
                    }
                  >
                    移除帳戶
                  </button>
                )}
              </div>
              <div className="p-5">
                <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2">
                  <label>
                    帳戶名稱
                    <input
                      className="field"
                      value={account.name}
                      onChange={(e) =>
                        updateAccount(accountIndex, { name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    機構
                    <input
                      className="field"
                      value={account.institution ?? ""}
                      onChange={(e) =>
                        updateAccount(accountIndex, {
                          institution: e.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label>
                    類型
                    <select
                      className="field"
                      value={account.accountType}
                      onChange={(e) =>
                        updateAccount(accountIndex, {
                          accountType: e.target
                            .value as AccountStateInput["accountType"],
                        })
                      }
                    >
                      <option value="bank">銀行</option>
                      <option value="brokerage">券商</option>
                      <option value="cash">現金</option>
                    </select>
                  </label>
                  <label>
                    預設幣別
                    <input
                      className="field"
                      value={account.defaultCurrency}
                      onChange={(e) =>
                        updateAccount(accountIndex, {
                          defaultCurrency: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="mt-6 flex items-center gap-2">
                  <Banknote size={15} className="text-[#3c7659]" />
                  <h4 className="text-xs font-bold uppercase tracking-[.12em] text-[#536158]">
                    現金餘額
                  </h4>
                </div>
                {account.cashBalances.map((balance, index) => (
                  <div
                    key={index}
                    className="mt-3 grid grid-cols-[120px_1fr_1fr_42px] items-end gap-2 rounded-xl border border-[#e5ebe6] bg-[#fafcf9] p-3 max-md:grid-cols-2"
                  >
                    <label>
                      幣別
                      <input
                        className="field"
                        value={balance.currency}
                        onChange={(e) =>
                          updateAccount(accountIndex, {
                            cashBalances: account.cashBalances.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    currency: e.target.value.toUpperCase(),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      餘額
                      <input
                        className="field"
                        inputMode="decimal"
                        value={balance.amount}
                        onChange={(e) =>
                          updateAccount(accountIndex, {
                            cashBalances: account.cashBalances.map((item, i) =>
                              i === index
                                ? { ...item, amount: e.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    {balance.currency !== "TWD" ? (
                      <label>
                        換算匯率
                        <input
                          aria-label={`${balance.currency} 對 TWD 匯率`}
                          placeholder={`${balance.currency}/TWD`}
                          className="field"
                          inputMode="decimal"
                          value={balance.fxRate?.rate ?? ""}
                          onChange={(e) =>
                            updateAccount(accountIndex, {
                              cashBalances: account.cashBalances.map(
                                (item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        fxRate: manualFx(
                                          item.currency,
                                          e.target.value,
                                        ),
                                      }
                                    : item,
                              ),
                            })
                          }
                        />
                      </label>
                    ) : (
                      <div className="rounded-lg bg-[#edf3ee] px-3 py-2.5 text-xs text-[#66736b]">
                        基準幣別，不需匯率
                      </div>
                    )}
                    <button
                      aria-label="移除現金"
                      onClick={() =>
                        updateAccount(accountIndex, {
                          cashBalances: account.cashBalances.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))}
                <button
                  className="link mt-2"
                  onClick={() =>
                    updateAccount(accountIndex, {
                      cashBalances: [
                        ...account.cashBalances,
                        { currency: account.defaultCurrency, amount: "0" },
                      ],
                    })
                  }
                >
                  ＋ 新增幣別
                </button>
                <div className="mt-6 flex items-center gap-2">
                  <TrendingUp size={15} className="text-[#3c7659]" />
                  <h4 className="text-xs font-bold uppercase tracking-[.12em] text-[#536158]">
                    股票與 ETF
                  </h4>
                </div>
                <div className="mt-2 space-y-2">
                  {account.positions.map((position, index) => (
                    <div
                      key={position.positionId ?? `${position.symbol}-${index}`}
                      className="grid grid-cols-[95px_110px_minmax(130px,1fr)_110px_110px_110px_42px] items-end gap-2 rounded-xl border border-[#e5ebe6] bg-[#fafcf9] p-3 max-xl:grid-cols-2"
                    >
                      <label>
                        市場
                        <select
                          className="field"
                          value={position.market}
                          onChange={(e) =>
                            updateAccount(accountIndex, {
                              positions: account.positions.map((item, i) =>
                                i === index
                                  ? {
                                      ...item,
                                      market: e.target
                                        .value as PositionView["market"],
                                      quoteCurrency:
                                        e.target.value === "US" ? "USD" : "TWD",
                                    }
                                  : item,
                              ),
                            })
                          }
                        >
                          <option>TWSE</option>
                          <option>TPEX</option>
                          <option>US</option>
                        </select>
                      </label>
                      {[
                        ["代碼", "symbol"],
                        ["名稱", "name"],
                        ["數量", "quantity"],
                        ["平均成本", "averageCost"],
                        ["市價", "marketPrice"],
                      ].map(([placeholder, key]) => (
                        <label key={key}>
                          {placeholder}
                          <input
                            aria-label={placeholder}
                            placeholder={placeholder}
                            className="field"
                            value={String(
                              position[key as keyof typeof position] ?? "",
                            )}
                            onChange={(e) =>
                              updateAccount(accountIndex, {
                                positions: account.positions.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        [key]: e.target.value,
                                        ...(key === "marketPrice"
                                          ? {
                                              quoteNote: null,
                                              quoteStatus: "manual" as const,
                                              quoteSource: "MANUAL" as const,
                                              quoteAsOf:
                                                new Date().toISOString(),
                                            }
                                          : {}),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <button
                        aria-label="移除持倉"
                        onClick={() =>
                          updateAccount(accountIndex, {
                            positions: account.positions.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                      >
                        <X size={17} />
                      </button>
                      <p className="col-span-full text-[11px] text-[#7b887f]">
                        行情：{position.quoteStatus}・
                        {position.quoteAsOf.slice(0, 10)}
                        {position.quoteNote ? `・${position.quoteNote}` : ""}
                      </p>
                      {position.quoteCurrency !== "TWD" && (
                        <label className="col-span-full max-w-xs">
                          {position.quoteCurrency}/TWD 匯率
                          <input
                            className="field"
                            inputMode="decimal"
                            value={position.fxRate?.rate ?? ""}
                            onChange={(e) =>
                              updateAccount(accountIndex, {
                                positions: account.positions.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        fxRate: manualFx(
                                          item.quoteCurrency,
                                          e.target.value,
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="link mt-2"
                  onClick={() =>
                    updateAccount(accountIndex, {
                      positions: [
                        ...account.positions,
                        {
                          market: "TWSE",
                          symbol: "",
                          name: "",
                          securityType: "stock",
                          quoteCurrency: "TWD",
                          quantity: "1",
                          averageCost: "0",
                          marketPrice: "1",
                          quoteAsOf: new Date().toISOString(),
                          quoteSource: "MANUAL",
                          quoteStatus: "manual",
                        },
                      ],
                    })
                  }
                >
                  ＋ 新增持倉
                </button>
              </div>
            </section>
          ))}
        </div>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#b9c8bd] bg-white/60 px-4 py-4 text-sm font-semibold text-[#35684f]"
          onClick={() => setAccounts((items) => [...items, emptyAccount()])}
        >
          <Plus size={14} />
          新增帳戶
        </button>
        <div className="sticky bottom-0 z-10 -mx-7 -mb-7 flex flex-wrap justify-end gap-3 border-t border-[#dce4dd] bg-white/95 px-7 py-5 shadow-[0_-12px_30px_rgba(22,45,32,.06)] backdrop-blur-xl max-sm:-mx-4 max-sm:-mb-4 max-sm:px-4">
          {needsManualPrice && (
            <p className="mr-auto self-center text-xs text-[#9a5148]">
              請先更新行情，或手動確認每筆待補市價。
            </p>
          )}
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary min-w-40"
            disabled={
              !!busy || !!unsupported || sales.length > 0 || needsManualPrice
            }
            onClick={save}
          >
            {busy === "save" ? (
              <>
                <LoaderCircle className="animate-spin" size={15} />
                儲存中…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                保存這份快照
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SaleDialog({
  position,
  onClose,
  onSaved,
}: {
  position: PositionView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [soldAt, setSoldAt] = useState(today());
  const [salePrice, setSalePrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await request(`/api/positions/${position.positionId}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soldAt: toUtc(soldAt),
          salePrice: salePrice || null,
          currency: position.quoteCurrency,
          note: note || null,
        }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "賣出失敗");
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose}>
      <div className="p-7">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-semibold">確認全部賣出</h2>
            <p className="mt-1 text-sm text-[#68776e]">
              {position.accountName}・{position.symbol}・全部{" "}
              {number.format(Number(position.quantity))} 股
            </p>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-6 space-y-4">
          <label>
            賣出日期
            <input
              type="date"
              className="field"
              value={soldAt}
              onChange={(e) => setSoldAt(e.target.value)}
            />
          </label>
          <label>
            成交單價（選填）
            <input
              className="field"
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </label>
          <label>
            備註（選填）
            <textarea
              className="field"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="notice">
            系統會建立一份不含此持倉的新快照。現金不會增加，也不會計算已實現損益。
          </p>
          {error && <p className="notice error">{error}</p>}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button className="danger" disabled={busy} onClick={submit}>
            {busy ? "處理中…" : "確認全部賣出"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SoldHistoryDialog({
  sale,
  trend,
  onClose,
}: {
  sale: SaleView;
  trend: Array<{
    capturedAt: string;
    quantity: string;
    marketValueTwd: string;
    costValueTwd: string;
  }>;
  onClose: () => void;
}) {
  const chartTrend = [
    ...trend,
    {
      capturedAt: sale.soldAt,
      quantity: "0",
      marketValueTwd: "0",
      costValueTwd: "0",
    },
  ].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  return (
    <Modal onClose={onClose}>
      <div className="p-7">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-semibold">{sale.symbol} 持倉歷史</h2>
            <p className="mt-1 text-sm text-[#68776e]">
              {sale.accountName}・已於
              {new Date(sale.soldAt).toLocaleDateString("zh-TW")}全部賣出
            </p>
          </div>
          <button aria-label="關閉" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="mt-6 h-64">
          {trend.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartTrend}>
                <CartesianGrid stroke="#e8ece8" vertical={false} />
                <XAxis
                  dataKey="capturedAt"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                    })
                  }
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(value) => `${Math.round(value / 10000)}萬`}
                  fontSize={11}
                  width={52}
                />
                <Tooltip formatter={(value) => money(String(value))} />
                <Area
                  type="monotone"
                  dataKey="marketValueTwd"
                  stroke="#245f46"
                  fill="#dcecdf"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center text-sm text-[#7b887f]">
              沒有可顯示的歷史快照
            </div>
          )}
        </div>
        <div className="notice mt-5">
          全部數量：{number.format(Number(sale.quantity))}・成交單價：
          {sale.salePrice
            ? `${sale.currency} ${number.format(Number(sale.salePrice))}`
            : "未填"}
          {sale.note ? `・${sale.note}` : ""}
        </div>
      </div>
    </Modal>
  );
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
  return (
    <main className="min-h-screen bg-[#f3f5f2] text-[#16241d]">
      <div className="mx-auto grid min-h-screen max-w-[1540px] grid-cols-[244px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="flex flex-col border-r border-[#dfe5df] bg-[#10291f] px-6 py-7 text-white max-lg:hidden">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#c8f16b] text-lg font-black text-[#10291f]">
              F
            </div>
            <div>
              <p className="font-semibold">FinanceReview</p>
              <p className="text-xs text-white/45">本機資產紀錄</p>
            </div>
          </div>
          <nav className="mt-12 space-y-2 text-sm">
            <a className="nav active" href="#top">
              總覽
            </a>
            <a className="nav" href="#accounts">
              帳戶與持倉
            </a>
            <a className="nav" href="#history">
              歷史快照
            </a>
            <a className="nav" href="#sold">
              已售出
            </a>
          </nav>
          <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-medium text-[#c8f16b]">LOCAL ONLY</p>
            <p className="mt-2 text-xs leading-5 text-white/50">
              SQLite 原始資料未加密，只保存在這台電腦。
            </p>
          </div>
        </aside>
        <section id="top" className="min-w-0 px-8 py-7 max-sm:px-4">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-[#68776e]">
                {new Date().toLocaleDateString("zh-TW", { dateStyle: "full" })}
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-[-.04em]">
                資產總覽
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <a className="secondary" href="/api/backup" download>
                <Download size={15} />
                備份
              </a>
              <button
                className="secondary"
                onClick={() => upload.current?.click()}
              >
                <Upload size={15} />
                還原
              </button>
              <input
                ref={upload}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => importFile(e.target.files?.[0])}
              />
              <button className="primary" onClick={() => setEditor(true)}>
                <Plus size={16} />
                新增快照
              </button>
            </div>
          </header>
          {error && <p className="notice error mt-5">{error}</p>}
          {!data ? (
            <div className="mt-12 text-center text-[#68776e]">載入中…</div>
          ) : !latest ? (
            <div className="mt-12 rounded-3xl border border-dashed border-[#b8c7bc] bg-white px-6 py-20 text-center">
              <WalletCards className="mx-auto text-[#44765c]" size={42} />
              <h2 className="mt-5 text-xl font-semibold">建立第一份資產快照</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#68776e]">
                輸入目前帳戶餘額與持倉，經本機模型解析、確認行情後保存。之後每份快照都會形成歷史走勢。
              </p>
              <button className="primary mt-6" onClick={() => setEditor(true)}>
                <Plus size={16} />
                新增第一份快照
              </button>
            </div>
          ) : (
            <>
              <div className="mt-8 grid grid-cols-3 gap-4 max-md:grid-cols-1">
                <article className="metric primary-card">
                  <p>總資產</p>
                  <strong>{money(latest.totalAssetValueTwd)}</strong>
                  <span>
                    最新快照 {date.format(new Date(latest.capturedAt))}
                  </span>
                </article>
                <article className="metric">
                  <p>證券市值</p>
                  <strong>{money(latest.totalSecuritiesTwd)}</strong>
                  <span
                    className={
                      Number(latest.unrealizedPnlTwd) >= 0
                        ? "positive"
                        : "negative"
                    }
                  >
                    未實現損益 {money(latest.unrealizedPnlTwd)}
                  </span>
                </article>
                <article className="metric">
                  <p>現金餘額</p>
                  <strong>{money(latest.totalCashTwd)}</strong>
                  <span>{latest.accounts.length} 個帳戶</span>
                </article>
              </div>
              <div className="mt-5 grid grid-cols-[minmax(0,1.55fr)_minmax(320px,.8fr)] gap-5 max-xl:grid-cols-1">
                <article className="panel">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">總資產走勢</h2>
                      <p className="sub">依已確認快照彙總</p>
                    </div>
                    <select
                      className="compact"
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                    >
                      <option value="6m">最近 6 個月</option>
                      <option value="1y">最近 1 年</option>
                      <option value="all">全部歷史</option>
                    </select>
                  </div>
                  <div className="mt-6 h-64">
                    {data.trend.length < 2 ? (
                      <div className="grid h-full place-items-center text-sm text-[#7c8981]">
                        至少建立兩份快照後顯示走勢
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.trend}>
                          <defs>
                            <linearGradient
                              id="assetFill"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#2d7354"
                                stopOpacity={0.35}
                              />
                              <stop
                                offset="100%"
                                stopColor="#2d7354"
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#e8ece8" vertical={false} />
                          <XAxis
                            dataKey="capturedAt"
                            tickFormatter={(value) =>
                              new Date(value).toLocaleDateString("zh-TW", {
                                month: "numeric",
                                day: "numeric",
                              })
                            }
                            fontSize={11}
                          />
                          <YAxis
                            tickFormatter={(value) =>
                              `${Math.round(value / 10000)}萬`
                            }
                            fontSize={11}
                            width={52}
                          />
                          <Tooltip
                            formatter={(value) => money(String(value))}
                            labelFormatter={(value) => date.format(value)}
                          />
                          <Area
                            type="monotone"
                            dataKey="totalAssetValueTwd"
                            stroke="#245f46"
                            strokeWidth={2.5}
                            fill="url(#assetFill)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </article>
                <article id="history" className="panel">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold">最近快照</h2>
                    <Archive size={17} className="text-[#77847c]" />
                  </div>
                  <div className="mt-5 space-y-3">
                    {data.history.slice(0, 6).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl bg-[#f5f7f4] px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {date.format(new Date(item.capturedAt))}
                          </p>
                          <p className="mt-1 text-xs text-[#77847c]">
                            {money(item.totalAssetValueTwd)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
              <article id="accounts" className="panel mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">帳戶與持倉</h2>
                    <p className="sub">最新快照・行情截至最近完成交易日</p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setMerged((value) => !value)}
                  >
                    {merged ? <Building2 size={15} /> : <Landmark size={15} />}{" "}
                    {merged ? "依帳戶檢視" : "跨帳戶合併"}
                  </button>
                </div>
                <div className="mt-5 overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>帳戶／資產</th>
                        <th>數量</th>
                        <th>平均成本</th>
                        <th>最新價格</th>
                        <th>狀態</th>
                        <th className="text-right">市值</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {displayPositions.map((item) => (
                        <tr
                          key={
                            merged
                              ? `${item.market}:${item.symbol}`
                              : item.positionId
                          }
                        >
                          <td>
                            <strong>
                              {item.accountName}・{item.symbol}
                            </strong>
                            <small>{item.name}</small>
                          </td>
                          <td>{number.format(Number(item.quantity))}</td>
                          <td>
                            {item.quoteCurrency}{" "}
                            {number.format(Number(item.averageCost))}
                          </td>
                          <td>
                            {item.quoteCurrency}{" "}
                            {number.format(Number(item.marketPrice))}
                          </td>
                          <td>
                            <span className={`status ${item.quoteStatus}`}>
                              {item.quoteStatus === "fresh"
                                ? "最新"
                                : item.quoteStatus === "stale"
                                  ? "沿用"
                                  : "手動"}
                            </span>
                          </td>
                          <td className="text-right font-medium">
                            {money(item.marketValueTwd)}
                          </td>
                          <td>
                            {!merged && (
                              <button
                                className="link danger-text"
                                onClick={() => setSale(item)}
                              >
                                全部賣出
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {latest.accounts.flatMap((account) =>
                        account.cashBalances.map((balance) => (
                          <tr key={`${account.accountId}-${balance.currency}`}>
                            <td>
                              <strong>{account.name}・現金</strong>
                              <small>{balance.currency}</small>
                            </td>
                            <td>{number.format(Number(balance.amount))}</td>
                            <td>—</td>
                            <td>—</td>
                            <td>—</td>
                            <td className="text-right font-medium">
                              {balance.currency}{" "}
                              {number.format(Number(balance.amount))}
                            </td>
                            <td />
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                  {displayPositions.length === 0 &&
                    latest.accounts.every(
                      (account) => account.cashBalances.length === 0,
                    ) && (
                      <p className="py-12 text-center text-sm text-[#78857d]">
                        這份快照沒有資產資料
                      </p>
                    )}
                </div>
              </article>
              <article id="sold" className="panel mt-5">
                <div>
                  <h2 className="font-semibold">已售出持倉</h2>
                  <p className="sub">
                    保留持倉週期與成交資料；不計算已實現損益
                  </p>
                </div>
                {data.sold.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[#7b887f]">
                    尚無全部賣出紀錄
                  </p>
                ) : (
                  <div className="mt-5 overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>帳戶／證券</th>
                          <th>賣出日期</th>
                          <th>全部數量</th>
                          <th>成交單價</th>
                          <th>備註</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {data.sold.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <strong>
                                {item.accountName}・{item.symbol}
                              </strong>
                              <small>{item.securityName}</small>
                            </td>
                            <td>
                              {new Date(item.soldAt).toLocaleDateString(
                                "zh-TW",
                              )}
                            </td>
                            <td>{number.format(Number(item.quantity))}</td>
                            <td>
                              {item.salePrice
                                ? `${item.currency} ${number.format(Number(item.salePrice))}`
                                : "未填"}
                            </td>
                            <td>{item.note ?? "—"}</td>
                            <td>
                              <button
                                className="link"
                                onClick={() => openSoldHistory(item)}
                              >
                                查看走勢
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </>
          )}
          {editor && (
            <SnapshotEditor
              latest={latest ?? null}
              onClose={() => setEditor(false)}
              onSaved={saved}
            />
          )}{" "}
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
      </div>
    </main>
  );
}
