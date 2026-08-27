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
  Building2,
  Download,
  Landmark,
  Plus,
  RefreshCw,
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
      className="fixed inset-0 z-50 grid place-items-center bg-[#0c1f18]/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-[#f8faf7] shadow-2xl ${wide ? "max-w-5xl" : "max-w-lg"}`}
      >
        {children}
      </div>
    </div>
  );
}

function SnapshotEditor({
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
  const needsManualPrice = accounts.some((account) =>
    account.positions.some((position) => Boolean(position.quoteNote?.includes("行情"))),
  );

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
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e0e7e1] bg-[#f8faf7]/95 px-7 py-5 backdrop-blur">
        <div>
          <h2 className="text-xl font-semibold">新增資產快照</h2>
          <p className="mt-1 text-xs text-[#6f7d74]">
            解析結果必須在這裡確認或修改後才會保存
          </p>
        </div>
        <button aria-label="關閉" onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="space-y-6 p-7">
        <section className="rounded-2xl border border-[#dce4dd] bg-white p-5">
          <label className="text-sm font-semibold">自然語言輸入</label>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={4}
            placeholder="例如：富邦證券現金 120000，0050 目前 3000 股，平均成本 126.4"
            className="field mt-3 w-full resize-y"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              disabled={!rawInput.trim() || !!busy}
              onClick={parse}
              className="primary"
            >
              {busy === "parse" ? "本機解析中…" : "用 gemma4:26b 解析"}
            </button>
            <button disabled={!!busy} onClick={quotes} className="secondary">
              <RefreshCw size={14} />
              {busy === "quotes" ? "更新中…" : "更新行情與匯率"}
            </button>
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
        <div className="space-y-4">
          {accounts.map((account, accountIndex) => (
            <section
              key={account.accountId ?? accountIndex}
              className="rounded-2xl border border-[#dce4dd] bg-white p-5"
            >
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
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-[#738078]">
                現金餘額
              </h4>
              {account.cashBalances.map((balance, index) => (
                <div
                  key={index}
                  className="mt-2 grid grid-cols-[120px_1fr_1fr_42px] gap-2 max-md:grid-cols-2"
                >
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
                  {balance.currency !== "TWD" ? (
                    <input
                      aria-label={`${balance.currency} 對 TWD 匯率`}
                      placeholder={`${balance.currency}/TWD 匯率`}
                      className="field"
                      inputMode="decimal"
                      value={balance.fxRate?.rate ?? ""}
                      onChange={(e) =>
                        updateAccount(accountIndex, {
                          cashBalances: account.cashBalances.map((item, i) =>
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
                  ) : (
                    <span />
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
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wider text-[#738078]">
                持倉
              </h4>
              <div className="mt-2 space-y-2">
                {account.positions.map((position, index) => (
                  <div
                    key={position.positionId ?? `${position.symbol}-${index}`}
                    className="grid grid-cols-[95px_110px_minmax(130px,1fr)_110px_110px_110px_42px] gap-2 max-xl:grid-cols-2"
                  >
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
                    {[
                      ["代碼", "symbol"],
                      ["名稱", "name"],
                      ["數量", "quantity"],
                      ["平均成本", "averageCost"],
                      ["市價", "marketPrice"],
                    ].map(([placeholder, key]) => (
                      <input
                        key={key}
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
                                          quoteAsOf: new Date().toISOString(),
                                        }
                                      : {}),
                                  }
                                : item,
                            ),
                          })
                        }
                      />
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
            </section>
          ))}
        </div>
        <button
          className="secondary"
          onClick={() => setAccounts((items) => [...items, emptyAccount()])}
        >
          <Plus size={14} />
          新增帳戶
        </button>
        <div className="flex justify-end gap-3 border-t border-[#dce4dd] pt-5">
          {needsManualPrice && (
            <p className="mr-auto self-center text-xs text-[#9a5148]">
              請先更新行情，或手動確認每筆待補市價。
            </p>
          )}
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary"
            disabled={
              !!busy || !!unsupported || sales.length > 0 || needsManualPrice
            }
            onClick={save}
          >
            {busy === "save" ? "儲存中…" : "確認並保存快照"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SaleDialog({
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

function SoldHistoryDialog({
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
            <h2 className="text-xl font-semibold">
              {sale.symbol} 持倉歷史
            </h2>
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
