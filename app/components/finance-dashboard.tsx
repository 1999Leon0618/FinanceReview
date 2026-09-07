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
  CreditCardAccountInput,
  DashboardData,
  LoanInput,
  ParserPatch,
  PositionView,
  SaleView,
  SnapshotCashFlowInput,
  SnapshotProposal,
} from "@/lib/types";
import { sameAccountIdentity, sameLoanIdentity } from "@/lib/account-identity";
import {
  creditCardCycleDates,
  inputDate,
  normalizeCreditCardAccountStatus,
} from "@/lib/credit-card";
import { snapshotCreateSchema } from "@/lib/validation";

const twd = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });
const percentage = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
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
const canEditManualPrice = (position: AccountStateInput["positions"][number]) =>
  position.quoteStatus === "manual" &&
  !position.quoteNote?.includes("尚未更新行情");

const hasCompleteQuoteCode = (
  position: AccountStateInput["positions"][number],
) => {
  const code = (position.providerSymbol || position.symbol).trim();
  if (!code) return false;
  if (position.market === "TWSE" || position.market === "TPEX")
    return /^\d{4,6}[A-Z]?$/.test(code.toUpperCase());
  if (position.market === "FUTURES")
    return /^[A-Z0-9]+\d{6}$/.test(code.toUpperCase());
  if (position.market === "FUND") return code.length >= 4;
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(code.toUpperCase());
};

function latestSnapshotSuggestions(latest: DashboardData["latest"]): string[] {
  if (!latest) return ["新增一個臺幣帳戶餘額", "新增一筆股票持倉"];

  const balances = latest.accounts.flatMap((account) =>
    account.cashBalances.map(
      (balance) =>
        `${account.name}${balance.currency === "TWD" ? "" : ` ${balance.currency}`} ${number.format(Number(balance.amount))}`,
    ),
  );
  const positions = latest.accounts.flatMap((account) =>
    account.positions.map(
      (position) =>
        `${account.name} ${position.symbol} 有 ${number.format(Number(position.quantity))}${position.securityType === "future" ? "口" : "股"}，平均成本 ${number.format(Number(position.averageCost))}`,
    ),
  );
  const loans = latest.loans.map((loan) => {
    const details = [
      `${loan.name}剩餘 ${loan.currency} ${number.format(Number(loan.outstandingPrincipal))}`,
    ];
    if (loan.annualInterestRate)
      details.push(`利率 ${number.format(Number(loan.annualInterestRate))}%`);
    if (loan.monthlyPayment)
      details.push(
        `每月繳 ${loan.currency} ${number.format(Number(loan.monthlyPayment))}`,
      );
    return details.join("，");
  });

  const prioritized = [
    balances[0],
    positions[0],
    loans[0],
    ...balances.slice(1),
    ...positions.slice(1),
    ...loans.slice(1),
  ].filter((item): item is string => Boolean(item));
  return [
    ...new Set([...prioritized, "新增一個臺幣帳戶餘額", "新增一筆股票持倉"]),
  ].slice(0, 2);
}

function recentInputSuggestions(recentInputs: string[]): string[] {
  const suggestions = [
    ...new Set(recentInputs.map((item) => item.trim())),
  ].filter((item) => item && !item.startsWith("一鍵更新標的現值"));
  const fallbacks = ["更新一個帳戶的目前餘額", "更新一筆持倉的數量與平均成本"];
  return [...suggestions, ...fallbacks]
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 2);
}

const suggestionLabel = (value: string) =>
  value.length > 46 ? `${value.slice(0, 46)}…` : value;

const emptyAccount = (): AccountStateInput => ({
  name: "新帳戶",
  accountType: "brokerage",
  defaultCurrency: "TWD",
  cashBalances: [{ currency: "TWD", amount: "0" }],
  positions: [],
});
const emptyPosition = (
  securityType: "stock" | "etf" | "fund" | "future" = "stock",
): AccountStateInput["positions"][number] => ({
  market:
    securityType === "fund"
      ? "FUND"
      : securityType === "future"
        ? "FUTURES"
        : "TWSE",
  symbol: "",
  name: "",
  securityType,
  quoteCurrency: "TWD",
  quantity: "1",
  averageCost: "0",
  marketPrice: "1",
  quoteAsOf: new Date().toISOString(),
  quoteSource: "MANUAL",
  quoteStatus: "manual",
  ...(securityType === "fund"
    ? { quoteNote: "尚未更新行情（請填基金淨值）" }
    : securityType === "future"
      ? {
          positionSide: "long" as const,
          contractMultiplier: "50",
          contractExpiry: "",
          quoteNote: "尚未更新行情",
        }
      : { quoteNote: "尚未更新行情" }),
});
const emptyLoan = (account?: AccountStateInput): LoanInput => ({
  accountId: account?.accountId ?? null,
  accountName: account?.name ?? null,
  name: "新貸款",
  institution: account?.institution ?? null,
  loanType: "other",
  currency: "TWD",
  originalPrincipal: null,
  outstandingPrincipal: "0",
  annualInterestRate: null,
  rateType: null,
  monthlyPayment: null,
  paymentDayOfMonth: null,
  nextPaymentDate: null,
  startDate: null,
  endDate: null,
  note: null,
});
const cashFlowLabels: Record<SnapshotCashFlowInput["flowType"], string> = {
  capital_contribution: "外部投入",
  capital_withdrawal: "外部提領",
  income: "股息／利息收入",
  fee_tax: "手續費／稅費",
  other_inflow: "其他流入",
  other_outflow: "其他流出",
};
const emptyCashFlow = (): SnapshotCashFlowInput => ({
  flowType: "capital_contribution",
  amountTwd: "",
  note: null,
});

const cloneAccounts = (
  source: NonNullable<DashboardData["latest"]>["accounts"],
): AccountStateInput[] =>
  source.map((account) => ({
    ...account,
    cashBalances: account.cashBalances
      .map((item) => ({ ...item }))
      .sort((a, b) =>
        a.currency === "TWD"
          ? -1
          : b.currency === "TWD"
            ? 1
            : a.currency.localeCompare(b.currency),
      ),
    positions: account.positions.map((item) => ({ ...item })),
  }));

const cloneLoans = (
  source: NonNullable<DashboardData["latest"]>["loans"],
): LoanInput[] => source.map((loan) => ({ ...loan }));

const cloneCreditCardAccounts = (
  source: NonNullable<DashboardData["latest"]>["creditCardAccounts"],
): CreditCardAccountInput[] =>
  source.map((account) => ({
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
  }));

function mergeSnapshotAccounts(
  preserved: AccountStateInput[],
  changed: AccountStateInput[],
) {
  const merged = [...preserved];
  for (const account of changed) {
    const index = merged.findIndex((item) =>
      sameAccountIdentity(item, account),
    );
    if (index >= 0) merged[index] = account;
    else merged.push(account);
  }
  return merged;
}

function mergeSnapshotLoans(preserved: LoanInput[], changed: LoanInput[]) {
  const merged = [...preserved];
  for (const loan of changed) {
    const index = merged.findIndex((item) => sameLoanIdentity(item, loan));
    if (index >= 0) merged[index] = loan;
    else merged.push(loan);
  }
  return merged;
}

function loanBelongsToAccount(
  loan: LoanInput,
  account: AccountStateInput,
): boolean {
  return Boolean(
    (loan.accountId && account.accountId === loan.accountId) ||
    (loan.accountName && loan.accountName === account.name),
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body =
    response.status === 204
      ? null
      : ((await response.json()) as { error?: string } | T);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : "操作失敗";
    throw new Error(message);
  }
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
      role="dialog"
      aria-modal="true"
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
  recentInputs = [],
  onClose,
  onSaved,
}: {
  latest: DashboardData["latest"];
  recentInputs?: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const rawInputRef = useRef<HTMLTextAreaElement>(null);
  const [rawInput, setRawInput] = useState("");
  const [processedInput, setProcessedInput] = useState("");
  const [accounts, setAccounts] = useState<AccountStateInput[]>([]);
  const [preservedAccounts, setPreservedAccounts] = useState<
    AccountStateInput[]
  >([]);
  const [loans, setLoans] = useState<LoanInput[]>([]);
  const [preservedLoans, setPreservedLoans] = useState<LoanInput[]>([]);
  const [cashFlows, setCashFlows] = useState<SnapshotCashFlowInput[]>([]);
  const [creditCardAccounts, setCreditCardAccounts] = useState<
    CreditCardAccountInput[]
  >(() => cloneCreditCardAccounts(latest?.creditCardAccounts ?? []));
  const [hasPrepared, setHasPrepared] = useState(false);
  const [sales, setSales] = useState<ParserPatch["sales"]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [resolvingPosition, setResolvingPosition] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const quoteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const personalizedSuggestions = useMemo(
    () => latestSnapshotSuggestions(latest),
    [latest],
  );
  const recentSuggestions = useMemo(
    () => recentInputSuggestions(recentInputs),
    [recentInputs],
  );
  const needsManualPrice = accounts.some((account) =>
    account.positions.some(canEditManualPrice),
  );
  const mergedAccounts = useMemo(
    () => mergeSnapshotAccounts(preservedAccounts, accounts),
    [preservedAccounts, accounts],
  );
  const mergedLoans = useMemo(
    () => mergeSnapshotLoans(preservedLoans, loans),
    [preservedLoans, loans],
  );
  const normalizedCreditCardAccounts = useMemo(
    () =>
      creditCardAccounts.map((account) => ({
        ...account,
        status: normalizeCreditCardAccountStatus(account.status, account.cards),
        ...(creditCardCycleDates(
          account.paymentDate || account.dueDate,
          account.statementDayOfMonth,
          account.paymentDayOfMonth,
        ) ?? {}),
        remainingInstallmentPrincipal:
          account.remainingInstallmentPrincipal || "0",
        overpaymentBalance: account.overpaymentBalance || "0",
      })),
    [creditCardAccounts],
  );
  const validationWarnings = useMemo(() => {
    if (!hasPrepared) return [];
    const result = snapshotCreateSchema.safeParse({
      rawInput: processedInput || rawInput,
      baseSnapshotId: latest?.id ?? null,
      accounts: mergedAccounts,
      loans: mergedLoans,
      creditCardAccounts: normalizedCreditCardAccounts,
      cashFlows,
    });
    if (result.success) return [];
    return [...new Set(result.error.issues.map((issue) => issue.message))];
  }, [
    hasPrepared,
    processedInput,
    rawInput,
    latest?.id,
    mergedAccounts,
    mergedLoans,
    normalizedCreditCardAccounts,
    cashFlows,
  ]);
  const fxRates = useMemo(() => {
    const rates = new Map<
      string,
      NonNullable<AccountStateInput["positions"][number]["fxRate"]> | undefined
    >();
    const add = (
      currency: string,
      fxRate?: AccountStateInput["positions"][number]["fxRate"],
    ) => {
      if (currency !== "TWD" && (!rates.has(currency) || fxRate))
        rates.set(currency, fxRate);
    };
    for (const account of accounts) {
      for (const balance of account.cashBalances)
        add(balance.currency, balance.fxRate);
      for (const position of account.positions)
        add(position.quoteCurrency, position.fxRate);
    }
    for (const loan of loans) add(loan.currency, loan.fxRate);
    return [...rates.entries()];
  }, [accounts, loans]);

  useEffect(() => {
    rawInputRef.current?.focus();
  }, []);

  useEffect(
    () => () => {
      Object.values(quoteTimersRef.current).forEach(clearTimeout);
    },
    [],
  );

  const updateAccount = (index: number, patch: Partial<AccountStateInput>) =>
    setAccounts((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const updateLoan = (index: number, patch: Partial<LoanInput>) =>
    setLoans((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const changeAccountType = (
    index: number,
    accountType: AccountStateInput["accountType"],
  ) => {
    const account = accounts[index];
    if (accountType === "cash" && account.positions.length > 0) {
      setError("現金帳戶只能記錄現金餘額；請先移除投資品項，再變更帳戶類型。");
      return;
    }
    setError("");
    updateAccount(index, { accountType });
  };
  const applyFxRate = (currency: string, rate: string) => {
    const fxRate = manualFx(currency, rate);
    setAccounts((items) =>
      items.map((account) => ({
        ...account,
        cashBalances: account.cashBalances.map((balance) =>
          balance.currency === currency ? { ...balance, fxRate } : balance,
        ),
        positions: account.positions.map((position) =>
          position.quoteCurrency === currency
            ? { ...position, fxRate }
            : position,
        ),
      })),
    );
    setLoans((items) =>
      items.map((loan) =>
        loan.currency === currency ? { ...loan, fxRate } : loan,
      ),
    );
  };
  const resolveOnlineData = (
    nextAccounts: AccountStateInput[],
    nextLoans: LoanInput[],
  ) =>
    request<{
      accounts: AccountStateInput[];
      loans: LoanInput[];
      warnings: string[];
    }>("/api/quotes/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accounts: nextAccounts, loans: nextLoans }),
    });
  const resolvePositionQuote = async (
    accountIndex: number,
    positionIndex: number,
    account: AccountStateInput,
    position: AccountStateInput["positions"][number],
  ) => {
    const requestKey = `${accountIndex}-${positionIndex}`;
    const requestedCode = (position.providerSymbol || position.symbol)
      .trim()
      .toUpperCase();
    if (!hasCompleteQuoteCode(position)) return;

    setResolvingPosition(requestKey);
    const quotePosition = {
      ...position,
      symbol: position.symbol.trim().toUpperCase() || requestedCode,
      providerSymbol: position.providerSymbol?.trim() || undefined,
      name: position.name.trim() || requestedCode,
      quantity: position.quantity || "1",
      averageCost: position.averageCost || "0",
      marketPrice: position.marketPrice || "1",
    };
    try {
      const result = await resolveOnlineData(
        [
          {
            ...account,
            name: account.name.trim() || "新帳戶",
            defaultCurrency:
              account.defaultCurrency.trim().toUpperCase() || "TWD",
            cashBalances: [],
            positions: [quotePosition],
          },
        ],
        [],
      );
      const resolved = result.accounts[0]?.positions[0];
      if (!resolved) return;
      setAccounts((items) =>
        items.map((currentAccount, currentAccountIndex) =>
          currentAccountIndex !== accountIndex
            ? currentAccount
            : {
                ...currentAccount,
                positions: currentAccount.positions.map(
                  (currentPosition, currentPositionIndex) => {
                    const currentCode = (
                      currentPosition.providerSymbol || currentPosition.symbol
                    )
                      .trim()
                      .toUpperCase();
                    return currentPositionIndex === positionIndex &&
                      currentCode === requestedCode
                      ? {
                          ...resolved,
                          name: currentPosition.name.trim()
                            ? currentPosition.name
                            : resolved.name,
                        }
                      : currentPosition;
                  },
                ),
              },
        ),
      );
      setWarnings((items) => [...new Set([...items, ...result.warnings])]);
    } catch (cause) {
      const reason =
        cause instanceof Error ? cause.message : "網路行情取得失敗";
      setAccounts((items) =>
        items.map((currentAccount, currentAccountIndex) =>
          currentAccountIndex !== accountIndex
            ? currentAccount
            : {
                ...currentAccount,
                positions: currentAccount.positions.map(
                  (currentPosition, currentPositionIndex) =>
                    currentPositionIndex === positionIndex
                      ? {
                          ...currentPosition,
                          quoteStatus: "manual" as const,
                          quoteSource: "MANUAL" as const,
                          quoteNote: `行情自動取得失敗：${reason}`,
                        }
                      : currentPosition,
                ),
              },
        ),
      );
    } finally {
      setResolvingPosition((current) =>
        current === requestKey ? null : current,
      );
    }
  };
  const schedulePositionQuote = (
    accountIndex: number,
    positionIndex: number,
    account: AccountStateInput,
    position: AccountStateInput["positions"][number],
  ) => {
    const requestKey = `${accountIndex}-${positionIndex}`;
    clearTimeout(quoteTimersRef.current[requestKey]);
    if (!hasCompleteQuoteCode(position)) return;
    quoteTimersRef.current[requestKey] = setTimeout(() => {
      delete quoteTimersRef.current[requestKey];
      void resolvePositionQuote(accountIndex, positionIndex, account, position);
    }, 900);
  };
  const parse = async () => {
    setBusy("parse");
    setError("");
    setUnsupported(null);
    try {
      const proposal = await request<SnapshotProposal>(
        "/api/snapshot-proposals",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawInput }),
        },
      );
      if (proposal.unsupportedReason) {
        setUnsupported(proposal.unsupportedReason);
        setWarnings(proposal.warnings);
        setSales(proposal.sales);
        return;
      }
      if (
        proposal.accounts.length === 0 &&
        proposal.loans.length === 0 &&
        proposal.sales.length === 0
      ) {
        throw new Error("沒有辨識到可更新的帳戶、持倉、貸款或賣出資料");
      }
      let preparedAccounts = proposal.accounts;
      let preparedLoans = proposal.loans;
      let preparedWarnings = proposal.warnings;
      try {
        const resolved = await resolveOnlineData(
          proposal.accounts,
          proposal.loans,
        );
        preparedAccounts = resolved.accounts;
        preparedLoans = resolved.loans;
        preparedWarnings = [...proposal.warnings, ...resolved.warnings];
      } catch (cause) {
        const reason =
          cause instanceof Error ? cause.message : "行情服務暫時無法使用";
        preparedAccounts = proposal.accounts.map((account) => ({
          ...account,
          positions: account.positions.map((position) => ({
            ...position,
            quoteStatus: "manual" as const,
            quoteSource: "MANUAL" as const,
            quoteNote: `行情自動取得失敗：${reason}`,
          })),
        }));
        preparedWarnings = [...proposal.warnings, reason];
      }
      setAccounts(preparedAccounts);
      setPreservedAccounts(proposal.preservedAccounts);
      setLoans(preparedLoans);
      setPreservedLoans(proposal.preservedLoans);
      setHasPrepared(true);
      setSales(proposal.sales);
      setWarnings(preparedWarnings);
      setUnsupported(proposal.unsupportedReason);
      setProcessedInput(rawInput);
      setRawInput("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `${cause.message}；原輸入已保留，可修改後重試或改用手動新增。`
          : "解析失敗",
      );
    } finally {
      setBusy("");
    }
  };
  const startManual = () => {
    setAccounts([]);
    setPreservedAccounts(latest ? cloneAccounts(latest.accounts) : []);
    setLoans([]);
    setPreservedLoans(latest ? cloneLoans(latest.loans) : []);
    setSales([]);
    setWarnings([]);
    setUnsupported(null);
    setError("");
    setHasPrepared(true);
  };
  const quotes = async () => {
    if (validationWarnings.length > 0) {
      setError("資料檢核未通過，已取消取得行情；請先修正下方警告。");
      return;
    }
    setBusy("quotes");
    setError("");
    try {
      const result = await resolveOnlineData(accounts, loans);
      setAccounts(result.accounts);
      setLoans(result.loans);
      setWarnings(result.warnings);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "行情更新失敗";
      setAccounts((items) =>
        items.map((account) => ({
          ...account,
          positions: account.positions.map((position) => ({
            ...position,
            quoteStatus: "manual" as const,
            quoteSource: "MANUAL" as const,
            quoteNote: `行情自動取得失敗：${reason}`,
          })),
        })),
      );
      setError(`${reason}；現在可以手動輸入市價。`);
    } finally {
      setBusy("");
    }
  };
  const save = async () => {
    if (validationWarnings.length > 0) {
      setError("資料檢核未通過，已取消保存；請先修正下方警告。");
      return;
    }
    setBusy("save");
    setError("");
    try {
      await request("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: processedInput || rawInput,
          baseSnapshotId: latest?.id ?? null,
          capturedAt: new Date(
            Math.max(
              Date.now(),
              latest ? Date.parse(latest.capturedAt) + 1 : 0,
            ),
          ).toISOString(),
          accounts: mergedAccounts,
          loans: mergedLoans,
          creditCardAccounts: normalizedCreditCardAccounts,
          cashFlows,
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
          salePrice: sale.salePrice ?? position.marketPrice,
          currency: position.quoteCurrency,
          settlementAccountId: position.accountId,
          fee: "0",
          tax: "0",
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
                新增資產與負債紀錄
              </h2>
              <span className="rounded-full bg-[#e8f1e9] px-2 py-1 text-[10px] font-bold tracking-wide text-[#2b674c]">
                規則式處理
              </span>
            </div>
            <p className="mt-1 text-xs text-[#718078]">
              每次輸入一筆資料，再確認合併結果
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
        <section
          className={`${hasPrepared ? "hidden" : "overflow-hidden"} rounded-[24px] bg-[#10291f] text-white shadow-[0_18px_50px_rgba(16,41,31,.15)]`}
        >
          <div className="grid grid-cols-[300px_minmax(0,1fr)] max-lg:grid-cols-1">
            <div className="flex flex-col justify-between border-r border-white/10 p-6 max-lg:border-b max-lg:border-r-0">
              <div>
                <div className="flex items-center gap-2 text-[#d7f47f]">
                  <Sparkles size={18} />
                  <span className="text-xs font-bold tracking-[.12em]">
                    規則式資料整理
                  </span>
                </div>
                <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-[-.03em]">
                  一次記一筆即可
                </h3>
                <p className="mt-3 text-sm leading-6 text-white/58">
                  輸入這次要更新的一筆帳戶、持倉或貸款；整理後只顯示本次相關資料。
                </p>
              </div>
              <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/[.07] px-3 py-2.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-[#c8f16b]" />
                使用內建規則整理，不連線至 AI 服務
              </div>
            </div>
            <div className="bg-[#f8faf7] p-6 text-[#17251d]">
              <label
                htmlFor="snapshot-raw-input"
                className="text-xs font-bold uppercase tracking-[.12em] text-[#637168]"
              >
                這次要更新的資料
              </label>
              <textarea
                ref={rawInputRef}
                id="snapshot-raw-input"
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing
                  )
                    return;

                  event.preventDefault();
                  if (!rawInput.trim() || busy) return;
                  void parse();
                }}
                rows={5}
                placeholder="例如：永豐銀行日幣 60,000"
                className="mt-3 w-full resize-y rounded-2xl border border-[#d5ded7] bg-white px-4 py-3.5 text-[15px] leading-7 outline-none transition focus:border-[#4d8067] focus:ring-4 focus:ring-[#397456]/10"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {[...personalizedSuggestions, ...recentSuggestions].map(
                  (example, index) => (
                    <button
                      key={`${index}-${example}`}
                      type="button"
                      title={example}
                      onClick={() => setRawInput(example)}
                      className="max-w-full rounded-full border border-[#d8e0da] bg-white px-3 py-1.5 text-left text-[11px] text-[#536159] hover:border-[#85a18f]"
                    >
                      {suggestionLabel(example)}
                    </button>
                  ),
                )}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  disabled={!rawInput.trim() || !!busy}
                  onClick={parse}
                  className="primary min-w-48"
                >
                  {busy === "parse" ? (
                    <LoaderCircle className="animate-spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {busy === "parse" ? "正在整理資產資料…" : "整理成確認表"}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={startManual}
                  className="secondary"
                >
                  手動新增資料
                </button>
                <p className="text-[11px] leading-5 text-[#78857d]">
                  整理成功會清空輸入；只有按下最下方「保存快照」才會寫入資料庫
                </p>
              </div>
            </div>
          </div>
        </section>
        {unsupported && (
          <p className="notice error">無法自動整理：{unsupported}</p>
        )}
        {error && <p className="notice error">{error}</p>}
        {warnings.length > 0 && (
          <div className="notice">
            {warnings.map((item, index) => (
              <p key={`${item}-${index}`}>• {item}</p>
            ))}
          </div>
        )}
        {validationWarnings.length > 0 && (
          <div className="notice error" role="alert">
            <p className="font-semibold">資料不合理，已停止行情查詢與保存：</p>
            {validationWarnings.map((item, index) => (
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
        {hasPrepared ? (
          <>
            <section className="overflow-hidden rounded-[24px] border border-[#d8e2da] bg-white shadow-[0_12px_40px_rgba(31,60,45,.07)]">
              <div className="px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div>
                    <div className="flex items-center gap-2 text-[#397259]">
                      <CheckCircle2 size={16} />
                      <p className="text-[10px] font-bold uppercase tracking-[.16em]">
                        第 2 步・確認資料
                      </p>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-.02em] text-[#193126]">
                      確認本次異動
                    </h3>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-[#718078]">
                      下方只列出這次要寫入的資料；其他既有帳戶與持倉不會被刪除。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRawInput(processedInput);
                        setHasPrepared(false);
                      }}
                      className="inline-flex items-center rounded-xl border border-[#d8e2da] bg-white px-4 py-2.5 text-xs font-semibold text-[#456353] transition hover:bg-[#f6f9f6]"
                    >
                      修改原始輸入
                    </button>
                    <button
                      disabled={
                        !!busy ||
                        accounts.every(
                          (account) => account.positions.length === 0,
                        )
                      }
                      onClick={quotes}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#d8e2da] bg-white px-4 py-2.5 text-xs font-semibold text-[#456353] transition hover:bg-[#f6f9f6] disabled:opacity-40"
                    >
                      <RefreshCw
                        className={busy === "quotes" ? "animate-spin" : ""}
                        size={14}
                      />
                      {busy === "quotes" ? "取得行情中…" : "重新取得行情"}
                    </button>
                  </div>
                </div>
                {processedInput && (
                  <div className="mt-5 rounded-xl border border-[#e3e9e4] bg-[#f7f9f7] px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#829087]">
                      原始輸入
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#526158]">
                      {processedInput}
                    </p>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    ["帳戶", accounts.length],
                    [
                      "現金",
                      accounts.reduce(
                        (total, account) => total + account.cashBalances.length,
                        0,
                      ),
                    ],
                    [
                      "投資",
                      accounts.reduce(
                        (total, account) => total + account.positions.length,
                        0,
                      ),
                    ],
                    ["貸款", loans.length],
                    ["信用卡", creditCardAccounts.length],
                  ].map(([label, count]) => (
                    <span
                      className="rounded-full bg-[#edf3ee] px-3 py-1.5 text-[11px] font-semibold text-[#476251]"
                      key={label}
                    >
                      {label} {count}
                    </span>
                  ))}
                </div>
              </div>
            </section>
            {creditCardAccounts.length > 0 && (
              <section className="overflow-hidden rounded-[24px] border border-[#d8e2da] bg-white shadow-[0_12px_40px_rgba(31,60,45,.07)]">
                <div className="border-b border-[#e7ece8] bg-[#f8faf7] px-6 py-5">
                  <div className="flex items-center gap-2 text-[#397259]">
                    <WalletCards size={16} />
                    <p className="text-[10px] font-bold uppercase tracking-[.16em]">
                      CREDIT CARD PAYMENTS
                    </p>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-[#193126]">
                    更新本月信用卡繳款狀況
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[#718078]">
                    與資產及負債一起保存為同一份快照；每張卡請填繳款日期、總應繳金額與實際繳款金額。
                  </p>
                </div>
                <div className="space-y-3 p-5">
                  {creditCardAccounts.map((account, accountIndex) => {
                    const cycle = creditCardCycleDates(
                      account.paymentDate || account.dueDate,
                      account.statementDayOfMonth,
                      account.paymentDayOfMonth,
                    );
                    const updateCreditCard = (
                      patch: Partial<CreditCardAccountInput>,
                    ) =>
                      setCreditCardAccounts((items) =>
                        items.map((item, index) =>
                          index === accountIndex ? { ...item, ...patch } : item,
                        ),
                      );
                    return (
                      <details
                        open
                        key={account.creditCardAccountId ?? accountIndex}
                        className="overflow-hidden rounded-[18px] border border-[#dfe7e1]"
                      >
                        <summary className="cursor-pointer list-none bg-[#f8faf7] px-4 py-3 marker:hidden">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                {account.name}
                              </p>
                              <p className="mt-1 text-[11px] text-[#7a877f]">
                                {account.issuer}
                              </p>
                            </div>
                            <span className="rounded-full bg-[#edf3ee] px-3 py-1.5 text-[11px] font-semibold text-[#476251]">
                              {cycle
                                ? `繳款期限 ${cycle.dueDate}`
                                : "尚未設定繳款期限"}
                            </span>
                          </div>
                        </summary>
                        <div className="grid grid-cols-3 gap-3 p-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
                          <label>
                            繳款日期
                            <input
                              className="field"
                              type="date"
                              value={inputDate(account.paymentDate)}
                              onChange={(event) =>
                                updateCreditCard({
                                  paymentDate: event.target.value || null,
                                })
                              }
                            />
                          </label>
                          <label>
                            總應繳金額
                            <input
                              className="field"
                              inputMode="decimal"
                              value={account.statementAmount}
                              onChange={(event) =>
                                updateCreditCard({
                                  statementAmount: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            實際繳款金額
                            <input
                              className="field"
                              inputMode="decimal"
                              value={account.paymentAmount}
                              onChange={(event) =>
                                updateCreditCard({
                                  paymentAmount: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            剩餘分期本金（選填）
                            <input
                              className="field"
                              inputMode="decimal"
                              value={account.remainingInstallmentPrincipal}
                              onChange={(event) =>
                                updateCreditCard({
                                  remainingInstallmentPrincipal:
                                    event.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            銀行顯示的溢繳餘額（選填）
                            <input
                              className="field"
                              inputMode="decimal"
                              value={account.overpaymentBalance}
                              onChange={(event) =>
                                updateCreditCard({
                                  overpaymentBalance: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            )}
            {fxRates.length > 0 && (
              <section className="rounded-[22px] border border-[#dce4dd] bg-[#f8faf7] p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold">換算匯率</h4>
                    <p className="mt-1 text-[11px] text-[#748178]">
                      每個幣別只套用一個匯率，並同步用於現金、持股與負債。
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 max-md:grid-cols-1">
                  {fxRates.map(([currency, fxRate]) => (
                    <label key={currency}>
                      {currency}/TWD
                      <input
                        className="field"
                        inputMode="decimal"
                        placeholder="自動取得中"
                        value={fxRate?.rate ?? ""}
                        onChange={(event) =>
                          applyFxRate(currency, event.target.value)
                        }
                      />
                      <span className="mt-1 block text-[10px] text-[#839087]">
                        {fxRate
                          ? `${fxRate.source}・${fxRate.rateAsOf.slice(0, 10)}`
                          : "網路查詢失敗時可手動輸入"}
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            )}
            <div className="space-y-4">
              {accounts.map((account, accountIndex) => (
                <details
                  open={!account.accountId}
                  key={account.accountId ?? accountIndex}
                  className="overflow-hidden rounded-[22px] border border-[#dce4dd] bg-white shadow-[0_8px_28px_rgba(31,60,45,.05)]"
                >
                  <summary className="cursor-pointer list-none border-b border-[#e7ece8] bg-[#f8faf7] px-5 py-4 marker:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3">
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
                            {account.accountType === "bank"
                              ? "銀行"
                              : account.accountType === "brokerage"
                                ? "券商"
                                : "現金"}
                            ・預設幣別 {account.defaultCurrency}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-[#d6e1d8] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#50705e]">
                        檢查／編輯
                      </span>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-xl border border-[#dfe7e1] bg-white">
                      <div className="grid grid-cols-[96px_minmax(0,1fr)_190px_76px] gap-3 bg-[#eef3ef] px-4 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#718078] max-md:hidden">
                        <span>類別</span>
                        <span>項目</span>
                        <span>數值</span>
                        <span className="text-right">狀態</span>
                      </div>
                      {account.cashBalances.map((balance, index) => (
                        <div
                          className="grid grid-cols-[96px_minmax(0,1fr)_190px_76px] items-center gap-3 border-t border-[#edf1ed] px-4 py-3 text-xs first:border-t-0 max-md:grid-cols-[72px_minmax(0,1fr)]"
                          key={`${balance.currency}-${index}`}
                        >
                          <span className="w-fit rounded-full bg-[#e8f1ea] px-2.5 py-1 font-semibold text-[#376147]">
                            現金
                          </span>
                          <span className="font-semibold text-[#2e4036]">
                            {balance.currency} 現金餘額
                          </span>
                          <span className="font-semibold tabular-nums text-[#1f382c] max-md:col-start-2">
                            {balance.currency}{" "}
                            {number.format(Number(balance.amount || 0))}
                          </span>
                          <span className="text-right text-[10px] font-semibold text-[#568069] max-md:col-start-2 max-md:text-left">
                            待寫入
                          </span>
                        </div>
                      ))}
                      {account.positions.map((position, index) => (
                        <div
                          className="grid grid-cols-[96px_minmax(0,1fr)_190px_76px] items-center gap-3 border-t border-[#edf1ed] px-4 py-3 text-xs max-md:grid-cols-[72px_minmax(0,1fr)]"
                          key={`${position.symbol}-${index}`}
                        >
                          <span className="w-fit rounded-full bg-[#edf0e8] px-2.5 py-1 font-semibold text-[#59633f]">
                            {position.securityType === "stock"
                              ? "股票"
                              : position.securityType === "etf"
                                ? "ETF"
                                : position.securityType === "fund"
                                  ? "基金"
                                  : "期貨"}
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate text-[#2e4036]">
                              {position.name || position.symbol || "未命名標的"}
                            </strong>
                            <span className="mt-0.5 block truncate text-[10px] font-normal text-[#849087]">
                              {position.symbol || "尚未設定代號"}
                            </span>
                          </span>
                          <span className="max-md:col-start-2">
                            <strong className="block tabular-nums text-[#1f382c]">
                              {number.format(Number(position.quantity || 0))}
                              {position.securityType === "future"
                                ? " 口"
                                : " 單位"}
                            </strong>
                            <span className="mt-0.5 block text-[10px] font-normal text-[#849087]">
                              現價 {position.quoteCurrency}{" "}
                              {number.format(Number(position.marketPrice || 0))}
                            </span>
                          </span>
                          <span className="text-right text-[10px] font-semibold text-[#568069] max-md:col-start-2 max-md:text-left">
                            待寫入
                          </span>
                        </div>
                      ))}
                      {loans
                        .filter((loan) => loanBelongsToAccount(loan, account))
                        .map((loan, index) => (
                          <div
                            className="grid grid-cols-[96px_minmax(0,1fr)_190px_76px] items-center gap-3 border-t border-[#edf1ed] px-4 py-3 text-xs max-md:grid-cols-[72px_minmax(0,1fr)]"
                            key={loan.loanId ?? `${loan.name}-${index}`}
                          >
                            <span className="w-fit rounded-full bg-[#f3e9e4] px-2.5 py-1 font-semibold text-[#805b4a]">
                              貸款
                            </span>
                            <span className="font-semibold text-[#49382f]">
                              {loan.name || "未命名貸款"}
                            </span>
                            <span className="font-semibold tabular-nums text-[#5c4135] max-md:col-start-2">
                              {loan.currency}{" "}
                              {number.format(
                                Number(loan.outstandingPrincipal || 0),
                              )}
                            </span>
                            <span className="text-right text-[10px] font-semibold text-[#8b6b5c] max-md:col-start-2 max-md:text-left">
                              待寫入
                            </span>
                          </div>
                        ))}
                      {account.cashBalances.length === 0 &&
                        account.positions.length === 0 &&
                        !loans.some((loan) =>
                          loanBelongsToAccount(loan, account),
                        ) && (
                          <p className="px-4 py-5 text-center text-xs text-[#8b978f]">
                            這個帳戶目前沒有要寫入的明細
                          </p>
                        )}
                    </div>
                  </summary>
                  <div className="p-5">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f6f9f6] px-4 py-3">
                      <p className="text-xs text-[#718078]">
                        完整編輯帳戶基本資料、現金、投資與關聯貸款。
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {accounts.length > 1 && (
                          <button
                            type="button"
                            className="link danger-text"
                            onClick={() =>
                              setAccounts((items) =>
                                items.filter(
                                  (_, index) => index !== accountIndex,
                                ),
                              )
                            }
                          >
                            移除帳戶
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
                      <label>
                        帳戶名稱
                        <input
                          className="field"
                          value={account.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setLoans((items) =>
                              items.map((loan) =>
                                loanBelongsToAccount(loan, account)
                                  ? { ...loan, accountName: name }
                                  : loan,
                              ),
                            );
                            updateAccount(accountIndex, { name });
                          }}
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
                        帳戶識別碼
                        <input
                          className="field"
                          placeholder="自訂代號或末四碼"
                          value={account.accountReference ?? ""}
                          onChange={(e) =>
                            updateAccount(accountIndex, {
                              accountReference: e.target.value || null,
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
                            changeAccountType(
                              accountIndex,
                              e.target
                                .value as AccountStateInput["accountType"],
                            )
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
                        className="mt-3 grid grid-cols-[120px_1fr_42px] items-end gap-2 rounded-xl border border-[#e5ebe6] bg-[#fafcf9] p-3 max-md:grid-cols-2"
                      >
                        <label>
                          幣別
                          <input
                            className="field"
                            value={balance.currency}
                            onChange={(e) =>
                              updateAccount(accountIndex, {
                                cashBalances: account.cashBalances.map(
                                  (item, i) =>
                                    i === index
                                      ? {
                                          ...item,
                                          currency:
                                            e.target.value.toUpperCase(),
                                          fxRate: undefined,
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
                                cashBalances: account.cashBalances.map(
                                  (item, i) =>
                                    i === index
                                      ? { ...item, amount: e.target.value }
                                      : item,
                                ),
                              })
                            }
                          />
                        </label>
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
                    {account.accountType !== "cash" ? (
                      <>
                        <div className="mt-6 flex items-center gap-2">
                          <TrendingUp size={15} className="text-[#3c7659]" />
                          <h4 className="text-xs font-bold uppercase tracking-[.12em] text-[#536158]">
                            股票、ETF、基金與期貨
                          </h4>
                        </div>
                        <div className="mt-2 space-y-2">
                          {account.positions.map((position, index) => (
                            <div
                              key={
                                position.positionId ??
                                position.securityId ??
                                index
                              }
                              className="grid grid-cols-[95px_95px_110px_minmax(130px,1fr)_110px_110px_110px_42px] items-end gap-2 rounded-xl border border-[#e5ebe6] bg-[#fafcf9] p-3 max-xl:grid-cols-2"
                            >
                              <label>
                                類型
                                <select
                                  className="field"
                                  value={position.securityType}
                                  onChange={(e) => {
                                    const securityType = e.target
                                      .value as PositionView["securityType"];
                                    updateAccount(accountIndex, {
                                      positions: account.positions.map(
                                        (item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                securityType,
                                                market:
                                                  securityType === "fund"
                                                    ? "FUND"
                                                    : securityType === "future"
                                                      ? "FUTURES"
                                                      : item.market ===
                                                            "FUND" ||
                                                          item.market ===
                                                            "FUTURES"
                                                        ? "TWSE"
                                                        : item.market,
                                                quoteSource: "MANUAL",
                                                quoteStatus: "manual",
                                                quoteNote:
                                                  securityType === "fund"
                                                    ? "尚未更新行情（將依基金級別代碼查詢）"
                                                    : securityType === "future"
                                                      ? "尚未更新行情"
                                                      : "尚未更新行情",
                                                ...(securityType === "future"
                                                  ? {
                                                      positionSide:
                                                        item.positionSide ??
                                                        ("long" as const),
                                                      contractMultiplier: "50",
                                                      contractExpiry:
                                                        item.contractExpiry ??
                                                        "",
                                                    }
                                                  : {}),
                                              }
                                            : item,
                                      ),
                                    });
                                  }}
                                >
                                  <option value="stock">股票</option>
                                  <option value="etf">ETF</option>
                                  <option value="fund">基金</option>
                                  <option value="future">期貨</option>
                                </select>
                              </label>
                              <label>
                                市場
                                <select
                                  className="field"
                                  value={position.market}
                                  onChange={(e) =>
                                    updateAccount(accountIndex, {
                                      positions: account.positions.map(
                                        (item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                market: e.target
                                                  .value as PositionView["market"],
                                                securityType:
                                                  e.target.value === "FUND"
                                                    ? "fund"
                                                    : e.target.value ===
                                                        "FUTURES"
                                                      ? "future"
                                                      : item.securityType ===
                                                            "fund" ||
                                                          item.securityType ===
                                                            "future"
                                                        ? "stock"
                                                        : item.securityType,
                                                quoteCurrency:
                                                  e.target.value === "US"
                                                    ? "USD"
                                                    : "TWD",
                                                fxRate: undefined,
                                                quoteSource: "MANUAL",
                                                quoteStatus: "manual",
                                                quoteNote:
                                                  e.target.value === "FUND"
                                                    ? "尚未更新行情（將依基金級別代碼查詢）"
                                                    : e.target.value ===
                                                        "FUTURES"
                                                      ? "尚未更新行情"
                                                      : "尚未更新行情",
                                                ...(e.target.value === "FUTURES"
                                                  ? {
                                                      positionSide:
                                                        item.positionSide ??
                                                        ("long" as const),
                                                      contractMultiplier: "50",
                                                      contractExpiry:
                                                        item.contractExpiry ??
                                                        "",
                                                    }
                                                  : {}),
                                              }
                                            : item,
                                      ),
                                    })
                                  }
                                >
                                  <option value="TWSE">上市</option>
                                  <option value="TPEX">上櫃</option>
                                  <option value="US">美股</option>
                                  <option value="FUND">基金</option>
                                  <option value="FUTURES">期貨</option>
                                </select>
                              </label>
                              {[
                                ["代碼", "symbol"],
                                ["名稱", "name"],
                                [
                                  position.securityType === "future"
                                    ? "口數"
                                    : "數量",
                                  "quantity",
                                ],
                                [
                                  position.securityType === "future"
                                    ? "均價"
                                    : "平均成本",
                                  "averageCost",
                                ],
                              ].map(([placeholder, key]) => (
                                <label key={key}>
                                  {placeholder}
                                  <input
                                    aria-label={placeholder}
                                    placeholder={placeholder}
                                    className="field"
                                    value={String(
                                      position[key as keyof typeof position] ??
                                        "",
                                    )}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      const nextPosition: AccountStateInput["positions"][number] =
                                        {
                                          ...position,
                                          [key]: value,
                                          ...(key === "symbol"
                                            ? {
                                                providerSymbol:
                                                  position.securityType ===
                                                  "fund"
                                                    ? position.providerSymbol
                                                    : undefined,
                                                quoteSource: "MANUAL" as const,
                                                quoteStatus: "manual" as const,
                                                quoteNote: "尚未更新行情",
                                              }
                                            : {}),
                                          ...(key === "averageCost" &&
                                          position.quoteStatus === "manual" &&
                                          position.quoteNote?.includes(
                                            "尚未更新行情",
                                          )
                                            ? {
                                                marketPrice: value || "1",
                                                quoteAsOf:
                                                  new Date().toISOString(),
                                              }
                                            : {}),
                                        };
                                      updateAccount(accountIndex, {
                                        positions: account.positions.map(
                                          (item, i) =>
                                            i === index ? nextPosition : item,
                                        ),
                                      });
                                      if (key === "symbol")
                                        schedulePositionQuote(
                                          accountIndex,
                                          index,
                                          account,
                                          nextPosition,
                                        );
                                    }}
                                  />
                                </label>
                              ))}
                              <label>
                                {canEditManualPrice(position)
                                  ? "手動市價（網路查詢失敗）"
                                  : position.securityType === "fund"
                                    ? "網路淨值"
                                    : "網路市價"}
                                <input
                                  aria-label={
                                    canEditManualPrice(position)
                                      ? "手動市價"
                                      : "網路市價"
                                  }
                                  className="field"
                                  inputMode="decimal"
                                  readOnly={!canEditManualPrice(position)}
                                  value={position.marketPrice}
                                  onChange={(event) => {
                                    if (!canEditManualPrice(position)) return;
                                    updateAccount(accountIndex, {
                                      positions: account.positions.map(
                                        (item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                marketPrice: event.target.value,
                                                quoteStatus: "manual" as const,
                                                quoteSource: "MANUAL" as const,
                                                quoteNote:
                                                  "行情取得失敗，已手動輸入市價",
                                                quoteAsOf:
                                                  new Date().toISOString(),
                                              }
                                            : item,
                                      ),
                                    });
                                  }}
                                />
                              </label>
                              {position.securityType === "future" && (
                                <div className="col-span-full grid grid-cols-3 gap-2 max-md:grid-cols-1">
                                  <label>
                                    方向
                                    <select
                                      className="field"
                                      value={position.positionSide ?? "long"}
                                      onChange={(event) =>
                                        updateAccount(accountIndex, {
                                          positions: account.positions.map(
                                            (item, i) =>
                                              i === index
                                                ? {
                                                    ...item,
                                                    positionSide: event.target
                                                      .value as
                                                      "long" | "short",
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                    >
                                      <option value="long">多單</option>
                                      <option value="short">空單</option>
                                    </select>
                                  </label>
                                  <label>
                                    到期月份
                                    <input
                                      className="field"
                                      placeholder="YYYYMM"
                                      value={position.contractExpiry ?? ""}
                                      onChange={(event) =>
                                        updateAccount(accountIndex, {
                                          positions: account.positions.map(
                                            (item, i) =>
                                              i === index
                                                ? {
                                                    ...item,
                                                    contractExpiry:
                                                      event.target.value,
                                                    symbol: `${item.symbol.match(/^([A-Z]+)\d{6}$/)?.[1] ?? (item.name.includes("微型") ? "TMF" : "MTX")}${event.target.value}`,
                                                    providerSymbol: `${item.symbol.match(/^([A-Z]+)\d{6}$/)?.[1] ?? (item.name.includes("微型") ? "TMF" : "MTX")}${event.target.value}`,
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    每點價值
                                    <input
                                      className="field"
                                      value={
                                        position.contractMultiplier ?? "50"
                                      }
                                      inputMode="decimal"
                                      onChange={(event) =>
                                        updateAccount(accountIndex, {
                                          positions: account.positions.map(
                                            (item, i) =>
                                              i === index
                                                ? {
                                                    ...item,
                                                    contractMultiplier:
                                                      event.target.value,
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                              )}
                              <button
                                className="col-span-full justify-self-end"
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
                                {resolvingPosition ===
                                `${accountIndex}-${index}`
                                  ? "正在自動取得網路行情…"
                                  : `行情：${position.quoteStatus}・${position.quoteAsOf.slice(0, 10)}${position.quoteNote ? `・${position.quoteNote}` : ""}`}
                              </p>
                              {position.securityType === "fund" && (
                                <label className="col-span-full max-w-sm">
                                  基金級別代碼
                                  <input
                                    className="field"
                                    placeholder="例如 T3601Y"
                                    value={position.providerSymbol ?? ""}
                                    onChange={(e) => {
                                      const nextPosition = {
                                        ...position,
                                        providerSymbol: e.target.value.trim(),
                                        quoteSource: "MANUAL" as const,
                                        quoteStatus: "manual" as const,
                                        quoteNote:
                                          "尚未更新行情（將依基金級別代碼查詢）",
                                      };
                                      updateAccount(accountIndex, {
                                        positions: account.positions.map(
                                          (item, i) =>
                                            i === index ? nextPosition : item,
                                        ),
                                      });
                                      schedulePositionQuote(
                                        accountIndex,
                                        index,
                                        account,
                                        nextPosition,
                                      );
                                    }}
                                  />
                                  <span className="mt-1 text-[10px] leading-4 text-[#8a958e]">
                                    建議填寫投信投顧公會的精確級別代碼，避免同一基金的不同級別互相誤配；境外基金也可填
                                    Yahoo Finance 代碼。
                                  </span>
                                </label>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-4">
                          <button
                            className="link"
                            onClick={() =>
                              updateAccount(accountIndex, {
                                positions: [
                                  ...account.positions,
                                  emptyPosition("stock"),
                                ],
                              })
                            }
                          >
                            ＋ 新增股票 / ETF
                          </button>
                          <button
                            className="link"
                            onClick={() =>
                              updateAccount(accountIndex, {
                                positions: [
                                  ...account.positions,
                                  emptyPosition("fund"),
                                ],
                              })
                            }
                          >
                            ＋ 新增基金
                          </button>
                          <button
                            className="link"
                            onClick={() =>
                              updateAccount(accountIndex, {
                                positions: [
                                  ...account.positions,
                                  emptyPosition("future"),
                                ],
                              })
                            }
                          >
                            ＋ 新增期貨
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-6 rounded-xl border border-[#e2e8e3] bg-[#f6f8f5] px-4 py-3 text-xs leading-6 text-[#6d7a72]">
                        現金帳戶只記錄現金餘額，不顯示股票、ETF、基金或期貨欄位。銀行與券商帳戶可同時記錄現金與投資品項。
                      </div>
                    )}
                    <div className="mt-7 flex items-center justify-between gap-3 border-t border-[#e5ebe6] pt-6">
                      <div className="flex items-center gap-2">
                        <Landmark size={15} className="text-[#8b5c47]" />
                        <h4 className="text-xs font-bold uppercase tracking-[.12em] text-[#6d5145]">
                          貸款與負債
                        </h4>
                      </div>
                      <span className="rounded-full bg-[#f4ebe6] px-2.5 py-1 text-[10px] font-semibold text-[#805b4a]">
                        {
                          loans.filter((loan) =>
                            loanBelongsToAccount(loan, account),
                          ).length
                        }{" "}
                        筆
                      </span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {loans.map((loan, loanIndex) =>
                        loanBelongsToAccount(loan, account) ? (
                          <details
                            open
                            className="overflow-hidden rounded-xl border border-[#eadfd9] bg-[#fdfaf8]"
                            key={loan.loanId ?? loanIndex}
                          >
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
                              <div>
                                <p className="text-sm font-semibold text-[#46352d]">
                                  {loan.name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-[#8b776d]">
                                  {loan.currency}{" "}
                                  {number.format(
                                    Number(loan.outstandingPrincipal || 0),
                                  )}
                                  ・
                                  {loan.annualInterestRate
                                    ? `年利率 ${loan.annualInterestRate}%`
                                    : "利率未設定"}
                                </p>
                              </div>
                              <span className="text-[11px] font-semibold text-[#805b4a]">
                                展開／收合
                              </span>
                            </summary>
                            <div className="grid grid-cols-4 gap-3 border-t border-[#eee3dd] bg-white p-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
                              <label>
                                貸款名稱
                                <input
                                  className="field"
                                  value={loan.name}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      name: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                類型
                                <select
                                  className="field"
                                  value={loan.loanType}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      loanType: event.target
                                        .value as LoanInput["loanType"],
                                    })
                                  }
                                >
                                  <option value="mortgage">房貸</option>
                                  <option value="personal">信貸</option>
                                  <option value="auto">車貸</option>
                                  <option value="student">學貸</option>
                                  <option value="credit">信用卡循環</option>
                                  <option value="other">其他</option>
                                </select>
                              </label>
                              <label>
                                幣別
                                <input
                                  className="field"
                                  value={loan.currency}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      currency:
                                        event.target.value.toUpperCase(),
                                      fxRate: undefined,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                目前未償本金
                                <input
                                  className="field"
                                  inputMode="decimal"
                                  value={loan.outstandingPrincipal}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      outstandingPrincipal: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                原始貸款金額
                                <input
                                  className="field"
                                  inputMode="decimal"
                                  value={loan.originalPrincipal ?? ""}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      originalPrincipal:
                                        event.target.value || null,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                年利率（%）
                                <input
                                  className="field"
                                  inputMode="decimal"
                                  value={loan.annualInterestRate ?? ""}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      annualInterestRate:
                                        event.target.value || null,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                每月還款金額
                                <input
                                  className="field"
                                  inputMode="decimal"
                                  value={loan.monthlyPayment ?? ""}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      monthlyPayment:
                                        event.target.value || null,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                每月還款日
                                <input
                                  className="field"
                                  type="number"
                                  min={1}
                                  max={31}
                                  value={loan.paymentDayOfMonth ?? ""}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      paymentDayOfMonth: event.target.value
                                        ? Number(event.target.value)
                                        : null,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                利率類型
                                <select
                                  className="field"
                                  value={loan.rateType ?? ""}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      rateType:
                                        (event.target.value as
                                          "fixed" | "floating") || null,
                                    })
                                  }
                                >
                                  <option value="">未設定</option>
                                  <option value="fixed">固定利率</option>
                                  <option value="floating">浮動利率</option>
                                </select>
                              </label>
                              {[
                                ["下次繳款日", "nextPaymentDate"],
                                ["貸款開始日", "startDate"],
                                ["預計結束日", "endDate"],
                              ].map(([label, key]) => (
                                <label key={key}>
                                  {label}
                                  <input
                                    className="field"
                                    type="date"
                                    value={String(
                                      loan[key as keyof LoanInput] ?? "",
                                    ).slice(0, 10)}
                                    onChange={(event) =>
                                      updateLoan(loanIndex, {
                                        [key]: event.target.value || null,
                                      })
                                    }
                                  />
                                </label>
                              ))}
                              <label className="col-span-3 max-lg:col-span-2 max-sm:col-span-1">
                                備註
                                <input
                                  className="field"
                                  value={loan.note ?? ""}
                                  onChange={(event) =>
                                    updateLoan(loanIndex, {
                                      note: event.target.value || null,
                                    })
                                  }
                                />
                              </label>
                              <button
                                className="col-span-full justify-self-end link danger-text"
                                type="button"
                                onClick={() =>
                                  setLoans((items) =>
                                    items.filter(
                                      (_, index) => index !== loanIndex,
                                    ),
                                  )
                                }
                              >
                                移除貸款
                              </button>
                            </div>
                          </details>
                        ) : null,
                      )}
                    </div>
                    <button
                      className="link mt-3"
                      type="button"
                      onClick={() =>
                        setLoans((items) => [...items, emptyLoan(account)])
                      }
                    >
                      ＋ 新增貸款
                    </button>
                  </div>
                </details>
              ))}
            </div>
            <button
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#b9c8bd] bg-white/60 px-4 py-4 text-sm font-semibold text-[#35684f]"
              onClick={() => setAccounts((items) => [...items, emptyAccount()])}
            >
              <Plus size={14} />
              新增帳戶
            </button>
            <div
              className={`${loans.some((loan) => !mergedAccounts.some((account) => loanBelongsToAccount(loan, account))) ? "flex" : "hidden"} flex-wrap items-end justify-between gap-3 pt-3`}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#9a6c58]">
                  尚未關聯帳戶的貸款
                </p>
                <p className="mt-1 text-xs text-[#718078]">
                  僅以目前未償本金計入負債；月付金不會重複扣除。
                </p>
              </div>
              <span className="rounded-full bg-[#f2e9e4] px-3 py-1.5 text-xs font-semibold text-[#7d503d]">
                {
                  loans.filter(
                    (loan) =>
                      !mergedAccounts.some((account) =>
                        loanBelongsToAccount(loan, account),
                      ),
                  ).length
                }{" "}
                筆
              </span>
            </div>
            <div
              className={`${loans.some((loan) => !mergedAccounts.some((account) => loanBelongsToAccount(loan, account))) ? "space-y-3" : "hidden"}`}
            >
              {loans.map((loan, loanIndex) =>
                mergedAccounts.some((account) =>
                  loanBelongsToAccount(loan, account),
                ) ? null : (
                  <details
                    open={loans.length === 1}
                    key={loan.loanId ?? loanIndex}
                    className="overflow-hidden rounded-[20px] border border-[#eadfd9] bg-white shadow-[0_8px_28px_rgba(72,45,31,.05)]"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-[#fbf7f5] px-5 py-4 marker:hidden">
                      <div>
                        <p className="font-semibold text-[#392d27]">
                          {loan.name}
                        </p>
                        <p className="mt-1 text-[11px] text-[#8a756b]">
                          {loan.accountName ||
                            loan.institution ||
                            "尚未關聯帳戶"}
                          ・{loan.currency}{" "}
                          {number.format(
                            Number(loan.outstandingPrincipal || 0),
                          )}
                        </p>
                      </div>
                      <span className="rounded-full border border-[#e4d4cc] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#805b4a]">
                        展開編輯
                      </span>
                    </summary>
                    <div className="border-t border-[#eee3dd] p-5">
                      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                        <label>
                          所屬帳戶
                          <select
                            className="field"
                            value={loan.accountId ?? loan.accountName ?? ""}
                            onChange={(event) => {
                              const account = mergedAccounts.find(
                                (item) =>
                                  (item.accountId ?? item.name) ===
                                  event.target.value,
                              );
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        accountId: account?.accountId ?? null,
                                        accountName: account?.name ?? null,
                                        institution:
                                          account?.institution ??
                                          item.institution,
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            <option value="">未關聯帳戶</option>
                            {mergedAccounts.map((account) => (
                              <option
                                key={account.accountId ?? account.name}
                                value={account.accountId ?? account.name}
                              >
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          貸款名稱
                          <input
                            className="field"
                            value={loan.name}
                            onChange={(event) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? { ...item, name: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          貸款機構
                          <input
                            className="field"
                            value={loan.institution ?? ""}
                            onChange={(event) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        institution: event.target.value || null,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          貸款類型
                          <select
                            className="field"
                            value={loan.loanType}
                            onChange={(event) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        loanType: event.target
                                          .value as LoanInput["loanType"],
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="mortgage">房貸</option>
                            <option value="personal">信貸</option>
                            <option value="auto">車貸</option>
                            <option value="student">學貸</option>
                            <option value="credit">信用卡循環</option>
                            <option value="other">其他</option>
                          </select>
                        </label>
                        <label>
                          幣別
                          <input
                            className="field"
                            value={loan.currency}
                            onChange={(event) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        currency:
                                          event.target.value.toUpperCase(),
                                        fxRate: undefined,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        {[
                          ["原始貸款金額", "originalPrincipal"],
                          ["目前未償本金", "outstandingPrincipal"],
                          ["年利率（%）", "annualInterestRate"],
                          ["每月還款金額", "monthlyPayment"],
                        ].map(([label, key]) => (
                          <label key={key}>
                            {label}
                            <input
                              aria-label={label}
                              className="field"
                              inputMode="decimal"
                              value={String(loan[key as keyof LoanInput] ?? "")}
                              onChange={(event) =>
                                setLoans((items) =>
                                  items.map((item, index) =>
                                    index === loanIndex
                                      ? {
                                          ...item,
                                          [key]:
                                            key === "outstandingPrincipal"
                                              ? event.target.value
                                              : event.target.value || null,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        ))}
                        <label>
                          每月還款日
                          <input
                            aria-label="每月還款日"
                            className="field"
                            type="number"
                            min={1}
                            max={31}
                            placeholder="例如 21"
                            value={loan.paymentDayOfMonth ?? ""}
                            onChange={(event) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        paymentDayOfMonth: event.target.value
                                          ? Number(event.target.value)
                                          : null,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <label>
                          利率類型
                          <select
                            className="field"
                            value={loan.rateType ?? ""}
                            onChange={(event) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        rateType:
                                          (event.target.value as
                                            "fixed" | "floating") || null,
                                      }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="">未設定</option>
                            <option value="fixed">固定利率</option>
                            <option value="floating">浮動利率</option>
                          </select>
                        </label>
                        {[
                          ["下次繳款日", "nextPaymentDate"],
                          ["貸款開始日", "startDate"],
                          ["預計結束日", "endDate"],
                        ].map(([label, key]) => (
                          <label key={key}>
                            {label}
                            <input
                              aria-label={label}
                              type="date"
                              className="field"
                              value={String(
                                loan[key as keyof LoanInput] ?? "",
                              ).slice(0, 10)}
                              onChange={(event) =>
                                setLoans((items) =>
                                  items.map((item, index) =>
                                    index === loanIndex
                                      ? {
                                          ...item,
                                          [key]: event.target.value || null,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </label>
                        ))}
                        <label className="col-span-3 max-lg:col-span-2 max-sm:col-span-1">
                          備註
                          <input
                            className="field"
                            value={loan.note ?? ""}
                            onChange={(event) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        note: event.target.value || null,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                        <button
                          className="col-span-full justify-self-end link danger-text"
                          type="button"
                          onClick={() =>
                            setLoans((items) =>
                              items.filter((_, index) => index !== loanIndex),
                            )
                          }
                        >
                          移除貸款
                        </button>
                      </div>
                    </div>
                  </details>
                ),
              )}
            </div>
            <button
              className="hidden"
              onClick={() => setLoans((items) => [...items, emptyLoan()])}
            >
              <Plus size={14} />
              新增貸款
            </button>
          </>
        ) : (
          <section className="rounded-[22px] border border-dashed border-[#cdd8cf] bg-white/55 px-6 py-10 text-center">
            <WalletCards className="mx-auto text-[#8b9990]" size={24} />
            <h3 className="mt-3 font-semibold">尚未建立確認表</h3>
            <p className="mt-2 text-xs leading-6 text-[#748178]">
              輸入本次更新內容並按「整理成確認表」，或選擇手動新增資料。
            </p>
          </section>
        )}
        {hasPrepared && (
          <section className="rounded-[22px] border border-[#dce4dd] bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">本期資金流與調整</h3>
                <p className="mt-1 text-[11px] leading-5 text-[#748178]">
                  選填；金額統一換算為
                  TWD，用來區分投入、提領與市場／匯率變動，不會再次改動帳戶餘額。
                </p>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setCashFlows((items) => [...items, emptyCashFlow()])
                }
              >
                <Plus size={14} />
                新增資金流
              </button>
            </div>
            {cashFlows.length > 0 && (
              <div className="mt-4 space-y-3">
                {cashFlows.map((flow, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(150px,.8fr)_minmax(130px,.6fr)_minmax(180px,1fr)_auto] items-end gap-3 rounded-xl bg-[#f7f9f6] p-3 max-md:grid-cols-1"
                  >
                    <label>
                      類型
                      <select
                        className="field"
                        value={flow.flowType}
                        onChange={(event) =>
                          setCashFlows((items) =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    flowType: event.target
                                      .value as SnapshotCashFlowInput["flowType"],
                                  }
                                : item,
                            ),
                          )
                        }
                      >
                        {Object.entries(cashFlowLabels).map(
                          ([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      TWD 金額
                      <input
                        className="field"
                        inputMode="decimal"
                        placeholder="0"
                        value={flow.amountTwd}
                        onChange={(event) =>
                          setCashFlows((items) =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, amountTwd: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      備註（選填）
                      <input
                        className="field"
                        value={flow.note ?? ""}
                        onChange={(event) =>
                          setCashFlows((items) =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, note: event.target.value || null }
                                : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary danger-text"
                      onClick={() =>
                        setCashFlows((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
        <div className="sticky bottom-0 z-10 -mx-7 -mb-7 flex flex-wrap justify-end gap-3 border-t border-[#dce4dd] bg-white/95 px-7 py-5 shadow-[0_-12px_30px_rgba(22,45,32,.06)] backdrop-blur-xl max-sm:-mx-4 max-sm:-mb-4 max-sm:px-4">
          {needsManualPrice && (
            <p className="mr-auto self-center text-xs text-[#8a6a32]">
              可以直接保存；尚未更新行情的持倉會暫時使用均價估值。
            </p>
          )}
          <button className="secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="primary min-w-40"
            disabled={
              !hasPrepared ||
              (accounts.length === 0 &&
                loans.length === 0 &&
                creditCardAccounts.length === 0) ||
              !!busy ||
              !!unsupported ||
              validationWarnings.length > 0 ||
              sales.length > 0
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
                保存這筆紀錄
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
  accounts,
  onClose,
  onSaved,
}: {
  position: PositionView;
  accounts: AccountStateInput[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [soldAt, setSoldAt] = useState(today());
  const [salePrice, setSalePrice] = useState(position.marketPrice);
  const [settlementAccountId, setSettlementAccountId] = useState(
    position.accountId,
  );
  const [fee, setFee] = useState("0");
  const [tax, setTax] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const quantity = Number(position.quantity);
  const price = Number(salePrice || 0);
  const feeAmount = Number(fee || 0);
  const taxAmount = Number(tax || 0);
  const averageCost = Number(position.averageCost);
  const contractMultiplier = Number(position.contractMultiplier ?? 0);
  const costBasis =
    position.securityType === "future"
      ? averageCost * quantity * contractMultiplier
      : averageCost * quantity;
  const gross =
    position.securityType === "future"
      ? (price - averageCost) *
        (position.positionSide === "short" ? -1 : 1) *
        quantity *
        contractMultiplier
      : quantity * price;
  const net = gross - feeAmount - taxAmount;
  const realized = position.securityType === "future" ? net : net - costBasis;
  const realizedReturnPct = costBasis > 0 ? (realized / costBasis) * 100 : null;
  const performanceTone = realized >= 0 ? "text-[#2f7552]" : "text-[#a8443d]";
  const submit = async () => {
    if (!salePrice || price <= 0) {
      setError("請輸入大於 0 的成交單價");
      return;
    }
    if (!settlementAccountId) {
      setError("請選擇入帳帳戶");
      return;
    }
    setBusy(true);
    try {
      await request(`/api/positions/${position.positionId}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          soldAt: toUtc(soldAt),
          salePrice: salePrice || null,
          currency: position.quoteCurrency,
          settlementAccountId,
          fee: fee || "0",
          tax: tax || "0",
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
              {number.format(Number(position.quantity))}
              {position.securityType === "future" ? "口" : "股"}
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
            {position.securityType === "future" ? "結算單價" : "成交單價"}
            <input
              className="field"
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </label>
          <label>
            入帳帳戶
            <select
              className="field"
              value={settlementAccountId}
              onChange={(event) => setSettlementAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option
                  key={account.accountId ?? account.name}
                  value={account.accountId}
                >
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <label>
              手續費
              <input
                className="field"
                inputMode="decimal"
                value={fee}
                onChange={(event) => setFee(event.target.value)}
              />
            </label>
            <label>
              交易稅
              <input
                className="field"
                inputMode="decimal"
                value={tax}
                onChange={(event) => setTax(event.target.value)}
              />
            </label>
          </div>
          <label>
            備註（選填）
            <textarea
              className="field"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <div
            className="notice grid grid-cols-2 gap-x-5 gap-y-2 text-xs"
            aria-label="成本與預估績效"
          >
            <strong className="col-span-2 text-sm">成本與預估績效</strong>
            <span>平均成本</span>
            <strong className="text-right">
              {position.quoteCurrency} {number.format(averageCost)}
            </strong>
            <span>
              {position.securityType === "future" ? "名目成本" : "持有成本"}
            </span>
            <strong className="text-right">
              {position.quoteCurrency} {number.format(costBasis)}
            </strong>
            <span>
              {position.securityType === "future" ? "結算損益" : "成交總額"}
            </span>
            <strong className="text-right">
              {position.quoteCurrency} {number.format(gross)}
            </strong>
            <span>淨入帳</span>
            <strong className="text-right">
              {position.quoteCurrency} {number.format(net)}
            </strong>
            <span>預估已實現損益</span>
            <strong className={`text-right ${performanceTone}`}>
              {position.quoteCurrency} {number.format(realized)}
            </strong>
            <span>預估報酬率</span>
            <strong className={`text-right ${performanceTone}`}>
              {realizedReturnPct === null
                ? "—"
                : `${realizedReturnPct > 0 ? "+" : ""}${percentage.format(realizedReturnPct)}%`}
            </strong>
          </div>
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
  const hasClosingPoint = trend.some(
    (point) => point.capturedAt >= sale.soldAt && Number(point.quantity) === 0,
  );
  const chartTrend = [
    ...trend,
    ...(hasClosingPoint
      ? []
      : [
          {
            capturedAt: sale.soldAt,
            quantity: "0",
            marketValueTwd: "0",
            costValueTwd: "0",
          },
        ]),
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
          {sale.netProceeds !== null
            ? `・淨入帳 ${sale.currency} ${number.format(Number(sale.netProceeds))}`
            : ""}
          {sale.realizedPnlTwd !== null
            ? `・已實現損益 ${money(sale.realizedPnlTwd)}`
            : ""}
          {sale.settlementAccountName
            ? `・入帳至 ${sale.settlementAccountName}`
            : ""}
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
              <p className="text-xs text-white/45">個人資產紀錄</p>
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
                輸入目前帳戶餘額與持倉，經內建規則整理、確認行情後保存。之後每份快照都會形成歷史走勢。
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
              recentInputs={data?.history.map((item) => item.rawInput) ?? []}
              onClose={() => setEditor(false)}
              onSaved={saved}
            />
          )}{" "}
          {sale && (
            <SaleDialog
              position={sale}
              accounts={data?.latest?.accounts ?? []}
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
