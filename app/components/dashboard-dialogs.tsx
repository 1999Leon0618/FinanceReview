"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Banknote,
  Building2,
  CheckCircle2,
  CreditCard,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import type {
  AccountStateInput,
  CreditCardAccountInput,
  DashboardData,
  LoanInput,
  PositionView,
  SaleView,
  SnapshotCashFlowInput,
} from "@/lib/types";
import { sameAccountIdentity, sameLoanIdentity } from "@/lib/account-identity";
import {
  creditCardCycleDates,
  inputDate,
  normalizeCreditCardAccountStatus,
} from "@/lib/credit-card";
import { snapshotCreateSchema } from "@/lib/validation";
import { calculateSnapshotPreview } from "@/lib/snapshot-preview";
import { decimal } from "@/lib/finance";
import { previewBatchInput } from "@/lib/batch-input";
import {
  capturedAfterLatest,
  parseTaipeiDateTimeInput,
  taipeiDateTimeInput,
} from "@/lib/snapshot-datetime";
import { NumericField } from "@/components/numeric-field";
import { PositionCostFields } from "@/components/position-cost-fields";
import { requestJson as request } from "@/lib/client-request";
import {
  futuresContractMultiplier,
  futuresProduct,
  withFuturesCode,
  withKnownFuturesContract,
} from "@/lib/futures-form";
import {
  mergePositionQuoteWarnings,
  replacePositionQuoteWarnings,
  type PositionQuoteWarnings,
} from "@/lib/position-quote-warnings";
import {
  mergeResolvedPositionQuote,
  wasPositionQuoteEdited,
} from "@/lib/position-quote-merge";

const twd = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });
const percentage = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
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
    return (
      /^[A-Z0-9]+\d{6}$/.test(code.toUpperCase()) &&
      /^\d{6}$/.test(position.contractExpiry ?? "") &&
      code.toUpperCase().endsWith(position.contractExpiry ?? " ")
    );
  if (position.market === "FUND") return code.length >= 4;
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(code.toUpperCase());
};

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
  quantity: "",
  averageCost: "",
  marketPrice: "",
  quoteAsOf: new Date().toISOString(),
  quoteSource: "MANUAL",
  quoteStatus: "manual",
  ...(securityType === "fund"
    ? { quoteNote: "尚未更新行情（請填基金淨值）" }
    : securityType === "future"
      ? {
          positionSide: "long" as const,
          contractMultiplier: "",
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

function Modal({
  children,
  onClose,
  wide = false,
  labelledBy,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  labelledBy?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
    );
    (focusable ?? dialog)?.focus();
    return () => previous?.focus();
  }, []);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
      ) ?? [],
    ).filter((item) => item.getClientRects().length > 0);
    if (items.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = items[0];
    const last = items.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onKeyDown={handleKeyDown}
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
  initialAccountName,
  onClose,
  onSaved,
  onManageAccounts,
  onManageCreditCards,
}: {
  latest: DashboardData["latest"];
  initialAccountName?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onManageAccounts: () => void;
  onManageCreditCards: () => void;
}) {
  const [processedInput, setProcessedInput] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(
    () =>
      latest?.accounts
        .filter((account) => account.name === initialAccountName)
        .map((account) => account.accountId) ?? [],
  );
  const [accountSearch, setAccountSearch] = useState("");
  const [accounts, setAccounts] = useState<AccountStateInput[]>([]);
  const [preservedAccounts, setPreservedAccounts] = useState<
    AccountStateInput[]
  >([]);
  const [loans, setLoans] = useState<LoanInput[]>([]);
  const [preservedLoans, setPreservedLoans] = useState<LoanInput[]>([]);
  const [cashFlows, setCashFlows] = useState<SnapshotCashFlowInput[]>([]);
  const [batchRaw, setBatchRaw] = useState("");
  const [costEditorVersion, setCostEditorVersion] = useState(0);
  const [capturedAtInput, setCapturedAtInput] = useState(() =>
    taipeiDateTimeInput(),
  );
  const [customCapturedAt, setCustomCapturedAt] = useState(false);
  const [creditCardAccounts, setCreditCardAccounts] = useState<
    CreditCardAccountInput[]
  >(() => cloneCreditCardAccounts(latest?.creditCardAccounts ?? []));
  const [selectedCreditCardAccountIds, setSelectedCreditCardAccountIds] =
    useState<string[]>([]);
  const [includeCreditCards, setIncludeCreditCards] = useState(false);
  const [hasPrepared, setHasPrepared] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [positionQuoteWarnings, setPositionQuoteWarnings] =
    useState<PositionQuoteWarnings>({});
  const [showValidation, setShowValidation] = useState(false);
  const draftAccountsRef = useRef(new Map<string, AccountStateInput>());
  const draftLoansRef = useRef(new Map<string, LoanInput>());
  const [busy, setBusy] = useState("");
  const [resolvingPosition, setResolvingPosition] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const hasUnsavedInput = Boolean(
    processedInput ||
    hasPrepared ||
    selectedAccountIds.length ||
    selectedCreditCardAccountIds.length ||
    accounts.length ||
    loans.length ||
    cashFlows.length,
  );
  const confirmDiscard = () =>
    !busy &&
    (!hasUnsavedInput ||
      window.confirm("尚未保存這次財務輸入，確定要離開嗎？"));
  const closeEditor = () => {
    if (confirmDiscard()) onClose();
  };
  const manageAccounts = () => {
    if (confirmDiscard()) onManageAccounts();
  };
  const manageCreditCards = () => {
    if (confirmDiscard()) onManageCreditCards();
  };
  const selectableItemCount =
    (latest?.accounts.length ?? 0) +
    (latest?.creditCardAccounts.filter((account) => account.creditCardAccountId)
      .length ?? 0);
  const selectedItemCount =
    selectedAccountIds.length + selectedCreditCardAccountIds.length;
  const allItemsSelected =
    selectableItemCount > 0 && selectedItemCount === selectableItemCount;
  const quoteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );
  const quoteRequestVersionsRef = useRef<Record<string, number>>({});
  const visibleWarnings = useMemo(
    () => mergePositionQuoteWarnings(warnings, positionQuoteWarnings),
    [warnings, positionQuoteWarnings],
  );
  const needsManualPrice = accounts.some((account) =>
    account.positions.some((position) =>
      position.quoteNote?.includes("尚未更新行情"),
    ),
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
      creditCardAccounts
        .filter(
          (account) =>
            account.creditCardAccountId &&
            selectedCreditCardAccountIds.includes(account.creditCardAccountId),
        )
        .map((account) => ({
          ...account,
          status: normalizeCreditCardAccountStatus(
            account.status,
            account.cards,
          ),
          ...(creditCardCycleDates(
            account.paymentDate || account.dueDate,
            account.statementDayOfMonth,
            account.paymentDayOfMonth,
          ) ?? {}),
          remainingInstallmentPrincipal:
            account.remainingInstallmentPrincipal || "0",
          overpaymentBalance: account.overpaymentBalance || "0",
        })),
    [creditCardAccounts, selectedCreditCardAccountIds],
  );
  const validationPayload = useMemo(
    () => ({
      rawInput: processedInput || "手動更新財務快照",
      baseSnapshotId: latest?.id ?? null,
      accounts,
      loans,
      creditCardAccounts: includeCreditCards
        ? normalizedCreditCardAccounts
        : undefined,
      creditCardUpdateMode: includeCreditCards
        ? ("partial" as const)
        : undefined,
      cashFlows,
    }),
    [
      processedInput,
      latest?.id,
      includeCreditCards,
      accounts,
      loans,
      normalizedCreditCardAccounts,
      cashFlows,
    ],
  );
  const validationWarnings = useMemo(() => {
    if (!showValidation) return [];
    const result = snapshotCreateSchema.safeParse(validationPayload);
    return result.success
      ? []
      : result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
  }, [showValidation, validationPayload]);
  const issueLabel = (path: string) => {
    const parts = path.split(".");
    const field = parts.at(-1) ?? "資料";
    const labels: Record<string, string> = {
      amount: "餘額",
      quantity: "數量",
      averageCost: "平均成本",
      marketPrice: "市價",
      outstandingPrincipal: "未償本金",
      statementAmount: "總應繳金額",
      paymentAmount: "實際繳款金額",
      paymentDate: "繳款日期",
      symbol: "代碼",
      name: "名稱",
    };
    if (parts[0] === "accounts") {
      const account = accounts[Number(parts[1])];
      const position =
        parts[2] === "positions" ? account?.positions[Number(parts[3])] : null;
      return `${account?.name || "帳戶"}${position ? `・${position.name || position.symbol || "持倉"}` : ""}・${labels[field] ?? field}`;
    }
    if (parts[0] === "loans")
      return `${loans[Number(parts[1])]?.name || "貸款"}・${labels[field] ?? field}`;
    if (parts[0] === "creditCardAccounts")
      return `${normalizedCreditCardAccounts[Number(parts[1])]?.name || "信用卡"}・${labels[field] ?? field}`;
    return labels[field] ?? field;
  };
  const validateSnapshot = () => {
    const result = snapshotCreateSchema.safeParse(validationPayload);
    const issues = result.success
      ? []
      : result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
    setShowValidation(true);
    if (issues.length > 0) {
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>(
          `[data-field-path="${issues[0].path}"]`,
        );
        let details = first?.closest("details");
        while (details) {
          details.open = true;
          details = details.parentElement?.closest("details") ?? null;
        }
        (
          first ?? document.getElementById("snapshot-validation-errors")
        )?.focus();
      });
    }
    return issues;
  };
  useEffect(() => {
    if (!hasUnsavedInput) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedInput]);
  const previewCards = useMemo(() => {
    const changed = new Map(
      normalizedCreditCardAccounts.map((account) => [
        account.creditCardAccountId,
        account,
      ]),
    );
    return (latest?.creditCardAccounts ?? []).map(
      (account) => changed.get(account.creditCardAccountId) ?? account,
    );
  }, [latest?.creditCardAccounts, normalizedCreditCardAccounts]);
  const preview = useMemo(
    () =>
      hasPrepared
        ? calculateSnapshotPreview(mergedAccounts, mergedLoans, previewCards)
        : null,
    [hasPrepared, mergedAccounts, mergedLoans, previewCards],
  );
  const batchPreview = useMemo(
    () => (batchRaw.trim() ? previewBatchInput(batchRaw, accounts) : null),
    [batchRaw, accounts],
  );
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

  useEffect(
    () => () => {
      Object.values(quoteTimersRef.current).forEach(clearTimeout);
      quoteRequestVersionsRef.current = {};
    },
    [],
  );
  const invalidatePositionQuotes = (accountIndex?: number) => {
    const matchesAccount = (key: string) =>
      accountIndex === undefined || key.startsWith(`${accountIndex}-`);
    for (const key of Object.keys(quoteRequestVersionsRef.current)) {
      if (!matchesAccount(key)) continue;
      quoteRequestVersionsRef.current[key] += 1;
      clearTimeout(quoteTimersRef.current[key]);
      delete quoteTimersRef.current[key];
    }
    setPositionQuoteWarnings((items) =>
      Object.fromEntries(
        Object.entries(items).filter(([key]) => !matchesAccount(key)),
      ),
    );
    setResolvingPosition((current) =>
      current && matchesAccount(current) ? null : current,
    );
  };

  const updateAccount = (index: number, patch: Partial<AccountStateInput>) =>
    setAccounts((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const updateLoan = (index: number, patch: Partial<LoanInput>) =>
    setLoans((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
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
    requestVersion: number,
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
      if (quoteRequestVersionsRef.current[requestKey] !== requestVersion)
        return;
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
                      ? mergeResolvedPositionQuote(
                          currentPosition,
                          position,
                          resolved,
                        )
                      : currentPosition;
                  },
                ),
              },
        ),
      );
      setPositionQuoteWarnings((items) =>
        replacePositionQuoteWarnings(items, requestKey, result.warnings),
      );
    } catch (cause) {
      if (quoteRequestVersionsRef.current[requestKey] !== requestVersion)
        return;
      const reason =
        cause instanceof Error ? cause.message : "網路行情取得失敗";
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
                      currentCode === requestedCode &&
                      !wasPositionQuoteEdited(currentPosition, position)
                      ? {
                          ...currentPosition,
                          quoteStatus: "manual" as const,
                          quoteSource: "MANUAL" as const,
                          quoteNote: `行情自動取得失敗：${reason}`,
                        }
                      : currentPosition;
                  },
                ),
              },
        ),
      );
    } finally {
      if (quoteRequestVersionsRef.current[requestKey] === requestVersion)
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
    const requestVersion =
      (quoteRequestVersionsRef.current[requestKey] ?? 0) + 1;
    quoteRequestVersionsRef.current[requestKey] = requestVersion;
    clearTimeout(quoteTimersRef.current[requestKey]);
    setPositionQuoteWarnings((items) =>
      replacePositionQuoteWarnings(items, requestKey, []),
    );
    setResolvingPosition((current) =>
      current === requestKey ? null : current,
    );
    if (!hasCompleteQuoteCode(position)) return;
    quoteTimersRef.current[requestKey] = setTimeout(() => {
      delete quoteTimersRef.current[requestKey];
      void resolvePositionQuote(
        accountIndex,
        positionIndex,
        account,
        position,
        requestVersion,
      );
    }, 900);
  };
  const setKnownFuturesContract = (
    accountIndex: number,
    positionIndex: number,
    account: AccountStateInput,
    position: AccountStateInput["positions"][number],
    product: "TMF" | "MTX",
    expiry: string,
  ) => {
    const nextPosition = withKnownFuturesContract(position, product, expiry);
    updateAccount(accountIndex, {
      positions: account.positions.map((item, i) =>
        i === positionIndex ? nextPosition : item,
      ),
    });
    schedulePositionQuote(accountIndex, positionIndex, account, nextPosition);
  };
  const toggleSelectedAccount = (accountId: string) =>
    setSelectedAccountIds((items) =>
      items.includes(accountId)
        ? items.filter((item) => item !== accountId)
        : [...items, accountId],
    );
  const startSelectedItems = () => {
    if (!latest || selectedItemCount === 0) return;
    invalidatePositionQuotes();
    for (const account of accounts)
      if (account.accountId)
        draftAccountsRef.current.set(account.accountId, account);
    for (const loan of loans)
      if (loan.loanId) draftLoansRef.current.set(loan.loanId, loan);
    const selected = latest.accounts.filter((account) =>
      selectedAccountIds.includes(account.accountId),
    );
    const preserved = latest.accounts.filter(
      (account) => !selectedAccountIds.includes(account.accountId),
    );
    const selectedLoans = latest.loans.filter((loan) =>
      selected.some((account) => loanBelongsToAccount(loan, account)),
    );
    const otherLoans = latest.loans.filter(
      (loan) =>
        !selected.some((account) => loanBelongsToAccount(loan, account)),
    );
    setAccounts(
      cloneAccounts(selected).map(
        (account) =>
          draftAccountsRef.current.get(account.accountId!) ?? account,
      ),
    );
    setPreservedAccounts(cloneAccounts(preserved));
    setLoans(
      cloneLoans(selectedLoans).map(
        (loan) =>
          (loan.loanId && draftLoansRef.current.get(loan.loanId)) || loan,
      ),
    );
    setPreservedLoans(cloneLoans(otherLoans));
    const selectedCreditCards = latest.creditCardAccounts.filter(
      (account) =>
        account.creditCardAccountId &&
        selectedCreditCardAccountIds.includes(account.creditCardAccountId),
    );
    setProcessedInput(
      "更新項目：" +
        [
          ...selected.map((item) => item.name),
          ...selectedCreditCards.map((item) => item.name),
        ].join("、"),
    );
    setIncludeCreditCards(selectedCreditCards.length > 0);
    setWarnings([]);
    setPositionQuoteWarnings({});
    setError("");
    setHasPrepared(true);
  };
  const selectCreditCardAccount = (accountId: string) => {
    if (selectedCreditCardAccountIds.includes(accountId)) return;
    const currentDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Taipei",
    });
    setCreditCardAccounts((items) =>
      items.map((account) => {
        if (account.creditCardAccountId !== accountId) return account;
        const cycle = creditCardCycleDates(
          currentDate,
          account.statementDayOfMonth,
          account.paymentDayOfMonth,
        );
        if (!cycle || cycle.dueDate.slice(0, 7) <= account.dueDate.slice(0, 7))
          return account;
        return {
          ...account,
          ...cycle,
          statementAmount: "",
          paymentAmount: "",
          paymentDate: null,
          remainingInstallmentPrincipal: "",
          overpaymentBalance: "",
        };
      }),
    );
    setSelectedCreditCardAccountIds((items) =>
      items.includes(accountId) ? items : [...items, accountId],
    );
  };
  const toggleCreditCardAccount = (accountId: string) => {
    if (selectedCreditCardAccountIds.includes(accountId)) {
      setSelectedCreditCardAccountIds((items) =>
        items.filter((item) => item !== accountId),
      );
      return;
    }
    selectCreditCardAccount(accountId);
  };
  const quotes = async () => {
    if (validateSnapshot().length > 0) return;
    setBusy("quotes");
    setError("");
    setPositionQuoteWarnings({});
    try {
      const result = await resolveOnlineData(accounts, loans);
      setAccounts((current) =>
        result.accounts.map((account, accountIndex) => ({
          ...account,
          positions: account.positions.map((position, positionIndex) => {
            const existing = current[accountIndex]?.positions[positionIndex];
            return existing?.quoteNote === "使用人工價格" ? existing : position;
          }),
        })),
      );
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
    if (validateSnapshot().length > 0) return;
    const selectedCapturedAt = customCapturedAt
      ? parseTaipeiDateTimeInput(capturedAtInput)
      : null;
    if (
      customCapturedAt &&
      (!selectedCapturedAt ||
        !capturedAfterLatest(selectedCapturedAt, latest?.capturedAt) ||
        Date.parse(selectedCapturedAt) > Date.now() + 60_000 ||
        includeCreditCards)
    ) {
      setError(
        includeCreditCards
          ? "信用卡更新會依當期帳單推算日期，請取消自訂資料時間或分開建立一般帳戶快照。"
          : "資料時間必須有效、不能晚於現在，且必須晚於目前最新快照。",
      );
      return;
    }
    setBusy("save");
    setError("");
    try {
      await request("/api/snapshots?response=minimal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: processedInput || "手動更新財務快照",
          baseSnapshotId: latest?.id ?? null,
          capturedAt:
            selectedCapturedAt ??
            new Date(
              Math.max(
                Date.now(),
                latest ? Date.parse(latest.capturedAt) + 1 : 0,
              ),
            ).toISOString(),
          accounts: mergedAccounts,
          loans: mergedLoans,
          creditCardAccounts: includeCreditCards
            ? normalizedCreditCardAccounts
            : undefined,
          creditCardUpdateMode: includeCreditCards ? "partial" : undefined,
          cashFlows,
        }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗");
      setBusy("");
    }
  };
  return (
    <Modal onClose={closeEditor} wide labelledBy="snapshot-editor-title">
      <div className="snapshot-editor-header">
        <div className="snapshot-editor-title">
          <div className="snapshot-editor-mark">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="eyebrow">NEW SNAPSHOT</p>
            <h2 id="snapshot-editor-title">建立財務快照</h2>
            <p>記下這次變動，確認後再寫入帳本</p>
          </div>
        </div>
        <ol className="snapshot-steps" aria-label="建立快照進度">
          {[
            [1, "選擇項目"],
            [2, "確認明細"],
            [3, "儲存快照"],
          ].map(([step, label]) => (
            <li
              key={step}
              aria-current={
                Number(step) === (hasPrepared ? 2 : 1) ? "step" : undefined
              }
              className={
                Number(step) < (hasPrepared ? 2 : 1)
                  ? "complete"
                  : Number(step) === (hasPrepared ? 2 : 1)
                    ? "active"
                    : ""
              }
            >
              <span>{Number(step) < (hasPrepared ? 2 : 1) ? "✓" : step}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>
        <button
          className="snapshot-editor-close"
          aria-label="關閉"
          onClick={closeEditor}
        >
          <X size={18} />
        </button>
      </div>
      <div className="space-y-6 p-7 max-sm:p-4">
        <section className={hasPrepared ? "hidden" : "snapshot-entry-layout"}>
          <div className="snapshot-composer">
            <div className="snapshot-composer-heading">
              <span>第 1 步</span>
              <div>
                <h3>選擇要更新的項目</h3>
                <p>
                  一般帳戶與信用卡可一起更新；未選取的資料會沿用上一份快照。
                </p>
              </div>
            </div>
            {selectableItemCount > 0 ? (
              <>
                <div className="snapshot-selection-toolbar">
                  <p>
                    已選取 <strong>{selectedItemCount}</strong>／
                    {selectableItemCount} 個項目
                  </p>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      if (allItemsSelected) {
                        setSelectedAccountIds([]);
                        setSelectedCreditCardAccountIds([]);
                        return;
                      }
                      setSelectedAccountIds(
                        latest?.accounts.map((account) => account.accountId) ??
                          [],
                      );
                      for (const account of latest?.creditCardAccounts ?? []) {
                        if (account.creditCardAccountId)
                          selectCreditCardAccount(account.creditCardAccountId);
                      }
                    }}
                  >
                    {allItemsSelected ? "取消全選" : "全部選取"}
                  </button>
                </div>
                <label className="mb-3 block text-xs font-semibold text-[#53645a]">
                  搜尋帳戶或機構
                  <input
                    className="field mt-1"
                    type="search"
                    value={accountSearch}
                    onChange={(event) => setAccountSearch(event.target.value)}
                  />
                </label>
                <div className="snapshot-account-options">
                  {(latest?.accounts.length ?? 0) > 0 && (
                    <p className="col-span-full px-1 pt-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#829087]">
                      一般帳戶
                    </p>
                  )}
                  {latest?.accounts
                    .filter((account) =>
                      `${account.name} ${account.institution ?? ""}`
                        .toLocaleLowerCase("zh-TW")
                        .includes(
                          accountSearch.trim().toLocaleLowerCase("zh-TW"),
                        ),
                    )
                    .map((account) => {
                      const selected = selectedAccountIds.includes(
                        account.accountId,
                      );
                      const linkedLoans = latest.loans.filter((loan) =>
                        loanBelongsToAccount(loan, account),
                      ).length;
                      return (
                        <button
                          key={account.accountId}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          className={`snapshot-account-option ${selected ? "selected" : ""}`}
                          onClick={() =>
                            toggleSelectedAccount(account.accountId)
                          }
                        >
                          <span className="snapshot-account-option-icon">
                            {account.accountType === "bank" ? (
                              <Landmark size={17} />
                            ) : (
                              <Building2 size={17} />
                            )}
                          </span>
                          <span className="snapshot-account-option-copy">
                            <strong>{account.name}</strong>
                            <small>
                              {account.institution || "未設定機構"}・
                              {account.cashBalances.length} 種幣別・
                              {account.positions.length} 筆持倉
                              {linkedLoans > 0 ? `・${linkedLoans} 筆貸款` : ""}
                            </small>
                          </span>
                          <span className="snapshot-account-option-check">
                            {selected ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  {(latest?.creditCardAccounts.length ?? 0) > 0 && (
                    <p className="col-span-full px-1 pt-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#829087]">
                      信用卡額度群組
                    </p>
                  )}
                  {latest?.creditCardAccounts.map((account) => {
                    const accountId = account.creditCardAccountId;
                    const selected = Boolean(
                      accountId &&
                      selectedCreditCardAccountIds.includes(accountId),
                    );
                    const activeCards = account.cards.filter(
                      (card) => card.status === "active",
                    ).length;
                    return (
                      <button
                        key={accountId ?? `${account.issuer}:${account.name}`}
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        disabled={!accountId}
                        className={`snapshot-account-option ${selected ? "selected" : ""}`}
                        onClick={() =>
                          accountId && toggleCreditCardAccount(accountId)
                        }
                      >
                        <span className="snapshot-account-option-icon">
                          <CreditCard size={17} />
                        </span>
                        <span className="snapshot-account-option-copy">
                          <strong>{account.name}</strong>
                          <small>
                            {account.issuer}・信用卡・{activeCards} 張使用中
                          </small>
                        </span>
                        <span className="snapshot-account-option-check">
                          {selected ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="snapshot-no-accounts">
                <WalletCards size={23} />
                <h4>目前還沒有帳戶</h4>
                <p>先建立第一個帳戶，再填入現金、持倉或貸款資料。</p>
              </div>
            )}
          </div>
          <aside className="snapshot-entry-aside">
            <div className="snapshot-preparation-status">
              <span>
                <CheckCircle2 size={17} />
              </span>
              <div>
                <h3>
                  {selectedItemCount > 0
                    ? `已選取 ${selectedItemCount} 個項目`
                    : "尚未選取項目"}
                </h3>
                <p>
                  一般帳戶 {selectedAccountIds.length}・信用卡{" "}
                  {selectedCreditCardAccountIds.length}
                </p>
              </div>
            </div>
            <div className="snapshot-entry-guide">
              <p className="eyebrow">HOW IT WORKS</p>
              <ol>
                <li>
                  <span>1</span>
                  <p>
                    <strong>選擇更新範圍</strong>
                    <small>勾選一般帳戶或信用卡額度群組</small>
                  </p>
                </li>
                <li>
                  <span>2</span>
                  <p>
                    <strong>確認整理結果</strong>
                    <small>需要時可直接修改欄位</small>
                  </p>
                </li>
                <li>
                  <span>3</span>
                  <p>
                    <strong>儲存新快照</strong>
                    <small>其他既有資料會自動保留</small>
                  </p>
                </li>
              </ol>
            </div>
            <div className="snapshot-rule-note">
              <ShieldCheck size={16} />
              <p>
                <strong>保存在目前帳本</strong>
                <span>資料會保存至目前連線的本機 SQLite 或雲端 D1 帳本。</span>
              </p>
            </div>
            <div className="snapshot-manual-entry">
              <p>帳戶設定</p>
              <div>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={manageAccounts}
                  className="secondary"
                >
                  管理一般帳戶
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={manageCreditCards}
                  className="secondary"
                >
                  管理信用卡
                </button>
              </div>
            </div>
          </aside>
        </section>
        {error && <p className="notice error">{error}</p>}
        {visibleWarnings.length > 0 && (
          <div className="notice">
            {visibleWarnings.map((item, index) => (
              <p key={`${item}-${index}`}>• {item}</p>
            ))}
          </div>
        )}
        {validationWarnings.length > 0 && (
          <div
            id="snapshot-validation-errors"
            className="notice error"
            role="alert"
            tabIndex={-1}
          >
            <p className="font-semibold">資料不合理，請修正後再試：</p>
            {validationWarnings.map((item, index) => (
              <p key={`${item.path}-${index}`}>
                • {item.path ? `${issueLabel(item.path)}：` : ""}
                {item.message}
              </p>
            ))}
          </div>
        )}
        {hasPrepared && (
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
                        setHasPrepared(false);
                      }}
                      className="inline-flex items-center rounded-xl border border-[#d8e2da] bg-white px-4 py-2.5 text-xs font-semibold text-[#456353] transition hover:bg-[#f6f9f6]"
                    >
                      重新選擇項目
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
                      本次更新範圍
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
                    ...(includeCreditCards
                      ? [
                          [
                            "信用卡",
                            selectedCreditCardAccountIds.length,
                          ] as const,
                        ]
                      : []),
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
            {includeCreditCards && creditCardAccounts.length > 0 && (
              <section className="overflow-hidden rounded-[28px] border border-[#d4e0d7] bg-white shadow-[0_18px_48px_rgba(31,60,45,.09)]">
                <div className="flex flex-wrap items-end justify-between gap-5 border-b border-[#e4ebe6] bg-[#f4f9f5] px-6 py-6">
                  <div>
                    <div className="flex items-center gap-2 text-[#397259]">
                      <WalletCards size={17} />
                      <p className="text-[10px] font-bold uppercase tracking-[.18em]">
                        CREDIT CARD UPDATE
                      </p>
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-[#193126]">
                      更新信用卡帳單
                    </h3>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-[#66776e]">
                      直接編輯要更新的銀行，系統會自動選取；沒有操作的銀行會沿用上一份快照。
                    </p>
                  </div>
                  <div
                    aria-live="polite"
                    className="min-w-36 rounded-2xl border border-[#cfddd3] bg-white/80 px-4 py-3 text-right shadow-sm"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#78877e]">
                      本次更新
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#285e45]">
                      {selectedCreditCardAccountIds.length}
                      <span className="text-xs font-medium text-[#7b8981]">
                        {` / ${creditCardAccounts.length} 家銀行`}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 p-5">
                  {creditCardAccounts.map((account, accountIndex) => {
                    const accountId = account.creditCardAccountId;
                    const selected = Boolean(
                      accountId &&
                      selectedCreditCardAccountIds.includes(accountId),
                    );
                    const cardValidationIndex =
                      normalizedCreditCardAccounts.findIndex(
                        (item) => item.creditCardAccountId === accountId,
                      );
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
                      <article
                        key={account.creditCardAccountId ?? accountIndex}
                        className={`overflow-hidden rounded-[22px] border bg-white transition-all ${
                          selected
                            ? "border-[#78a88d] shadow-[0_12px_30px_rgba(43,105,72,.12)] ring-1 ring-[#78a88d]/20"
                            : "border-[#dfe7e1] shadow-[0_6px_18px_rgba(31,60,45,.04)]"
                        }`}
                      >
                        <header
                          className={`flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 ${
                            selected
                              ? "border-[#d9e7dd] bg-[#f2f8f3]"
                              : "border-[#e7ece8] bg-[#fafbf9]"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                                selected
                                  ? "bg-[#397259] text-white"
                                  : "bg-[#e9efeb] text-[#69786f]"
                              }`}
                            >
                              {selected ? (
                                <CheckCircle2 size={19} />
                              ) : (
                                <WalletCards size={19} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#193126]">
                                {account.name}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#77847c]">
                                {account.issuer}・帳單月份{" "}
                                {account.statementPeriod}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[#53665b] shadow-sm ring-1 ring-[#dce5de]">
                              {cycle
                                ? `繳款期限 ${cycle.dueDate}`
                                : "尚未設定繳款期限"}
                            </span>
                            <label
                              className={`flex cursor-pointer items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                                selected
                                  ? "bg-[#397259] text-white"
                                  : "bg-[#edf1ee] text-[#5f6f66] hover:bg-[#e4ebe6]"
                              }`}
                            >
                              <input
                                aria-label={`本次更新 ${account.name}`}
                                checked={selected}
                                disabled={!accountId || !!busy}
                                onChange={() =>
                                  accountId &&
                                  toggleCreditCardAccount(accountId)
                                }
                                type="checkbox"
                              />
                              {selected ? "本次會更新" : "沿用原資料"}
                            </label>
                          </div>
                        </header>
                        <div
                          className="grid grid-cols-3 gap-4 p-5 max-lg:grid-cols-2 max-sm:grid-cols-1"
                          onFocusCapture={() =>
                            accountId && selectCreditCardAccount(accountId)
                          }
                        >
                          <label className="text-xs font-semibold text-[#53645a]">
                            <span className="flex h-10 flex-col gap-1">
                              <span>總應繳金額</span>
                              <span className="font-normal text-[#89958e]">
                                {account.currency}
                              </span>
                            </span>
                            <NumericField
                              className="field"
                              data-field-path={`creditCardAccounts.${cardValidationIndex}.statementAmount`}
                              value={account.statementAmount}
                              onValueChange={(value) =>
                                updateCreditCard({
                                  statementAmount: value,
                                })
                              }
                            />
                          </label>
                          <label className="text-xs font-semibold text-[#53645a]">
                            <span className="flex h-10 flex-col gap-1">
                              <span>實際繳款金額</span>
                              <span className="font-normal text-[#89958e]">
                                {account.currency}
                              </span>
                            </span>
                            <NumericField
                              className="field"
                              data-field-path={`creditCardAccounts.${cardValidationIndex}.paymentAmount`}
                              value={account.paymentAmount}
                              onValueChange={(value) =>
                                updateCreditCard({
                                  paymentAmount: value,
                                })
                              }
                            />
                          </label>
                          <label className="text-xs font-semibold text-[#53645a]">
                            <span className="flex h-10 items-start">
                              繳款日期
                            </span>
                            <input
                              className="field"
                              type="date"
                              data-field-path={`creditCardAccounts.${cardValidationIndex}.paymentDate`}
                              value={inputDate(account.paymentDate)}
                              onChange={(event) =>
                                updateCreditCard({
                                  paymentDate: event.target.value || null,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 border-t border-[#edf1ee] px-5 py-3">
                          <span className="mr-auto text-xs text-[#718078]">
                            上期應繳 {account.currency}{" "}
                            {latest?.creditCardAccounts.find(
                              (previous) =>
                                previous.creditCardAccountId === accountId,
                            )?.statementAmount ?? "0"}
                            ；分期留白保存時視為 0。
                          </span>
                          <button
                            type="button"
                            className="secondary text-xs"
                            onClick={() => {
                              if (accountId) selectCreditCardAccount(accountId);
                              updateCreditCard({
                                paymentAmount: "0",
                                paymentDate: null,
                              });
                            }}
                          >
                            尚未繳款
                          </button>
                          <button
                            type="button"
                            className="secondary text-xs"
                            disabled={
                              !/^(?:\d+)(?:\.\d+)?$/.test(
                                account.statementAmount,
                              )
                            }
                            onClick={() => {
                              if (accountId) selectCreditCardAccount(accountId);
                              setCreditCardAccounts((items) =>
                                items.map((item, index) =>
                                  index === accountIndex && item.statementAmount
                                    ? {
                                        ...item,
                                        paymentAmount: item.statementAmount,
                                        paymentDate: today(),
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            本期全額繳清
                          </button>
                        </div>
                        <details
                          className="border-t border-[#edf1ee] bg-[#fbfcfb] px-5 py-3"
                          onFocusCapture={() =>
                            accountId && selectCreditCardAccount(accountId)
                          }
                        >
                          <summary className="cursor-pointer text-xs font-semibold text-[#557061] marker:text-[#7d9989]">
                            分期與溢繳（選填）
                          </summary>
                          <div className="mt-4 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                            <label className="text-xs font-semibold text-[#53645a]">
                              剩餘分期本金
                              <span className="ml-1 font-normal text-[#89958e]">
                                {account.currency}
                              </span>
                              <NumericField
                                className="field mt-2"
                                value={account.remainingInstallmentPrincipal}
                                onValueChange={(value) =>
                                  updateCreditCard({
                                    remainingInstallmentPrincipal: value,
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs font-semibold text-[#53645a]">
                              銀行顯示的溢繳餘額
                              <span className="ml-1 font-normal text-[#89958e]">
                                {account.currency}
                              </span>
                              <NumericField
                                className="field mt-2"
                                value={account.overpaymentBalance}
                                onValueChange={(value) =>
                                  updateCreditCard({
                                    overpaymentBalance: value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        </details>
                      </article>
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
                      <NumericField
                        className="field"
                        placeholder="自動取得中"
                        value={fxRate?.rate ?? ""}
                        onValueChange={(value) => applyFxRate(currency, value)}
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
            {accounts.length > 1 && (
              <section className="rounded-[22px] border border-[#dce4dd] bg-white p-5">
                <h4 className="text-sm font-semibold">現金餘額快填</h4>
                <p className="mt-1 text-xs text-[#718078]">
                  只列本次選取帳戶；完整持倉與貸款可在下方展開。
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                  {accounts.flatMap((account, accountIndex) =>
                    account.cashBalances.map((balance, balanceIndex) => {
                      const oldAmount = latest?.accounts
                        .find((item) => item.accountId === account.accountId)
                        ?.cashBalances.find(
                          (item) => item.currency === balance.currency,
                        )?.amount;
                      return (
                        <label
                          key={`${account.accountId ?? accountIndex}-${balance.currency}`}
                          className="text-xs"
                        >
                          {account.name}・{balance.currency}（原{" "}
                          {oldAmount ?? "0"}）
                          <NumericField
                            className="field mt-1"
                            value={balance.amount}
                            onValueChange={(value) =>
                              updateAccount(accountIndex, {
                                cashBalances: account.cashBalances.map(
                                  (item, index) =>
                                    index === balanceIndex
                                      ? { ...item, amount: value }
                                      : item,
                                ),
                              })
                            }
                          />
                          {oldAmount &&
                            /^\d+(?:\.\d+)?$/.test(balance.amount) && (
                              <small className="mt-1 block text-[#718078]">
                                差額{" "}
                                {decimal(balance.amount)
                                  .minus(oldAmount)
                                  .toString()}
                              </small>
                            )}
                        </label>
                      );
                    }),
                  )}
                </div>
              </section>
            )}
            <div className="space-y-4">
              {accounts.map((account, accountIndex) => (
                <details
                  open={accounts.length === 1 || !account.accountId}
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
                        這裡只更新會隨快照變動的金額與持倉；名稱、機構、類型及記帳幣別請至帳戶管理調整。
                      </p>
                      <button
                        type="button"
                        className="secondary shrink-0"
                        onClick={manageAccounts}
                      >
                        管理帳戶設定
                      </button>
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
                        className="mt-3 grid grid-cols-[120px_minmax(0,1fr)] items-end gap-3 rounded-xl border border-[#e5ebe6] bg-[#fafcf9] p-3 max-md:grid-cols-1"
                      >
                        <div>
                          幣別
                          <strong className="field flex items-center">
                            {balance.currency}
                          </strong>
                        </div>
                        <label>
                          餘額
                          <NumericField
                            className="field"
                            data-field-path={`accounts.${accountIndex}.cashBalances.${index}.amount`}
                            aria-invalid={validationWarnings.some(
                              (issue) =>
                                issue.path ===
                                `accounts.${accountIndex}.cashBalances.${index}.amount`,
                            )}
                            value={balance.amount}
                            onValueChange={(value) =>
                              updateAccount(accountIndex, {
                                cashBalances: account.cashBalances.map(
                                  (item, i) =>
                                    i === index
                                      ? { ...item, amount: value }
                                      : item,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    ))}
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
                              className="snapshot-position-card grid grid-cols-[95px_95px_110px_minmax(130px,1fr)_110px_110px_110px_42px] items-end gap-2 rounded-xl border border-[#e5ebe6] bg-[#fafcf9] p-3 max-xl:grid-cols-2"
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
                                                    ? "尚未更新行情（將依基金級別代碼或 ISIN 查詢）"
                                                    : securityType === "future"
                                                      ? "尚未更新行情"
                                                      : "尚未更新行情",
                                                ...(securityType === "future"
                                                  ? {
                                                      symbol: "",
                                                      providerSymbol: undefined,
                                                      name: "",
                                                      positionSide:
                                                        item.positionSide ??
                                                        ("long" as const),
                                                      contractMultiplier: "",
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
                              <label
                                className={
                                  position.securityType === "future"
                                    ? "hidden"
                                    : undefined
                                }
                              >
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
                                                    ? "尚未更新行情（將依基金級別代碼或 ISIN 查詢）"
                                                    : e.target.value ===
                                                        "FUTURES"
                                                      ? "尚未更新行情"
                                                      : "尚未更新行情",
                                                ...(e.target.value === "FUTURES"
                                                  ? {
                                                      symbol: "",
                                                      providerSymbol: undefined,
                                                      name: "",
                                                      positionSide:
                                                        item.positionSide ??
                                                        ("long" as const),
                                                      contractMultiplier: "",
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
                              {position.securityType === "future" && (
                                <div className="col-span-full grid grid-cols-3 gap-2 max-md:grid-cols-1">
                                  <label>
                                    契約代碼
                                    <input
                                      className="field"
                                      placeholder="例如 TMZ6、TMF202612"
                                      autoCapitalize="characters"
                                      value={position.symbol}
                                      onChange={(event) => {
                                        const nextPosition = withFuturesCode(
                                          position,
                                          event.target.value,
                                        );
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
                                  </label>
                                  <label>
                                    到期月份
                                    <input
                                      className="field"
                                      type="month"
                                      value={
                                        /^\d{6}$/.test(
                                          position.contractExpiry ?? "",
                                        )
                                          ? `${position.contractExpiry?.slice(0, 4)}-${position.contractExpiry?.slice(4)}`
                                          : ""
                                      }
                                      onChange={(event) => {
                                        const expiry =
                                          event.target.value.replace("-", "");
                                        const product = futuresProduct(
                                          position.symbol,
                                        );
                                        if (
                                          product === "TMF" ||
                                          product === "MTX"
                                        ) {
                                          setKnownFuturesContract(
                                            accountIndex,
                                            index,
                                            account,
                                            position,
                                            product,
                                            expiry,
                                          );
                                        } else {
                                          const root = position.symbol.match(
                                            /^([A-Z0-9]*[A-Z])\d{0,6}$/,
                                          )?.[1];
                                          const symbol = root
                                            ? `${root}${expiry}`
                                            : position.symbol;
                                          const nextPosition = {
                                            ...position,
                                            contractExpiry: expiry,
                                            symbol,
                                            providerSymbol: symbol,
                                            quoteStatus: "manual" as const,
                                            quoteSource: "MANUAL" as const,
                                            quoteNote: "尚未更新行情",
                                          };
                                          updateAccount(accountIndex, {
                                            positions: account.positions.map(
                                              (item, i) =>
                                                i === index
                                                  ? nextPosition
                                                  : item,
                                            ),
                                          });
                                          schedulePositionQuote(
                                            accountIndex,
                                            index,
                                            account,
                                            nextPosition,
                                          );
                                        }
                                      }}
                                    />
                                  </label>
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
                                </div>
                              )}
                              {[
                                ...(position.securityType !== "future"
                                  ? [
                                      ["代碼", "symbol"],
                                      ["名稱", "name"],
                                    ]
                                  : []),
                              ].map(([placeholder, key]) => (
                                <label key={key}>
                                  {placeholder}
                                  <input
                                    aria-label={placeholder}
                                    placeholder={placeholder}
                                    data-field-path={`accounts.${accountIndex}.positions.${index}.${key}`}
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
                                                ...(position.securityType ===
                                                "future"
                                                  ? {
                                                      contractExpiry:
                                                        value
                                                          .toUpperCase()
                                                          .match(
                                                            /^[A-Z0-9]+(\d{6})$/,
                                                          )?.[1] ??
                                                        position.contractExpiry,
                                                    }
                                                  : {}),
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
                              <PositionCostFields
                                key={`${position.positionId ?? index}-${costEditorVersion}`}
                                position={position}
                                fieldPath={`accounts.${accountIndex}.positions.${index}`}
                                invalidPaths={validationWarnings.map(
                                  (issue) => issue.path,
                                )}
                                onChange={(patch) =>
                                  updateAccount(accountIndex, {
                                    positions: account.positions.map(
                                      (item, i) =>
                                        i === index
                                          ? {
                                              ...item,
                                              ...patch,
                                              ...(patch.averageCost &&
                                              item.quoteStatus === "manual" &&
                                              item.quoteNote?.includes(
                                                "尚未更新行情",
                                              )
                                                ? {
                                                    marketPrice:
                                                      patch.averageCost,
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
                              {position.securityType === "future" && (
                                <div className="col-span-full grid grid-cols-2 gap-2 max-md:grid-cols-1">
                                  <label>
                                    顯示名稱
                                    <input
                                      className="field"
                                      value={position.name}
                                      onChange={(event) =>
                                        updateAccount(accountIndex, {
                                          positions: account.positions.map(
                                            (item, i) =>
                                              i === index
                                                ? {
                                                    ...item,
                                                    name: event.target.value,
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    每點價值
                                    <NumericField
                                      className="field"
                                      disabled={!position.symbol}
                                      placeholder={
                                        futuresProduct(position.symbol) ===
                                        "OTHER"
                                          ? "請輸入每點價值"
                                          : "輸入代碼後自動帶入"
                                      }
                                      value={position.contractMultiplier ?? ""}
                                      onValueChange={(value) =>
                                        updateAccount(accountIndex, {
                                          positions: account.positions.map(
                                            (item, i) =>
                                              i === index
                                                ? {
                                                    ...item,
                                                    contractMultiplier: value,
                                                  }
                                                : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                              )}
                              <label>
                                {canEditManualPrice(position)
                                  ? `手動市價（${position.quoteCurrency}）`
                                  : position.securityType === "fund"
                                    ? `網路淨值（${position.quoteCurrency}）`
                                    : `網路市價（${position.quoteCurrency}）`}
                                <NumericField
                                  aria-label={
                                    canEditManualPrice(position)
                                      ? "手動市價"
                                      : "網路市價"
                                  }
                                  className="field"
                                  data-field-path={`accounts.${accountIndex}.positions.${index}.marketPrice`}
                                  readOnly={!canEditManualPrice(position)}
                                  value={position.marketPrice}
                                  onValueChange={(value) => {
                                    if (!canEditManualPrice(position)) return;
                                    updateAccount(accountIndex, {
                                      positions: account.positions.map(
                                        (item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                marketPrice: value,
                                                quoteStatus: "manual" as const,
                                                quoteSource: "MANUAL" as const,
                                                quoteNote: "使用人工價格",
                                                quoteAsOf:
                                                  new Date().toISOString(),
                                              }
                                            : item,
                                      ),
                                    });
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="link text-xs"
                                onClick={() => {
                                  if (canEditManualPrice(position)) {
                                    const nextPosition = {
                                      ...position,
                                      quoteNote: "尚未更新行情",
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
                                  } else {
                                    updateAccount(accountIndex, {
                                      positions: account.positions.map(
                                        (item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                quoteStatus: "manual" as const,
                                                quoteSource: "MANUAL" as const,
                                                quoteNote: "使用人工價格",
                                                quoteAsOf:
                                                  new Date().toISOString(),
                                              }
                                            : item,
                                      ),
                                    });
                                  }
                                }}
                              >
                                {canEditManualPrice(position)
                                  ? "重新取得行情"
                                  : "使用人工價格"}
                              </button>
                              {canEditManualPrice(position) && (
                                <label className="text-xs">
                                  人工價格日期
                                  <input
                                    className="field"
                                    type="date"
                                    value={inputDate(position.quoteAsOf)}
                                    onChange={(event) =>
                                      updateAccount(accountIndex, {
                                        positions: account.positions.map(
                                          (item, i) =>
                                            i === index
                                              ? {
                                                  ...item,
                                                  quoteAsOf: event.target.value
                                                    ? toUtc(event.target.value)
                                                    : "",
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                              )}
                              <button
                                className="col-span-full justify-self-end"
                                aria-label="移除持倉"
                                onClick={() => {
                                  invalidatePositionQuotes(accountIndex);
                                  updateAccount(accountIndex, {
                                    positions: account.positions.filter(
                                      (_, i) => i !== index,
                                    ),
                                  });
                                }}
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
                                  基金級別代碼／ISIN
                                  <input
                                    className="field"
                                    placeholder="例如 T3601Y 或 IE00B9276V44"
                                    value={position.providerSymbol ?? ""}
                                    onChange={(e) => {
                                      const nextPosition = {
                                        ...position,
                                        providerSymbol: e.target.value.trim(),
                                        quoteSource: "MANUAL" as const,
                                        quoteStatus: "manual" as const,
                                        quoteNote:
                                          "尚未更新行情（將依基金級別代碼或 ISIN 查詢）",
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
                                    境內基金請填投信投顧公會的精確級別代碼；境外基金優先填
                                    ISIN，亦可填 Yahoo Finance
                                    代碼，避免不同級別互相誤配。
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
                                目前未償本金（{loan.currency}）
                                <NumericField
                                  className="field"
                                  data-field-path={`loans.${loanIndex}.outstandingPrincipal`}
                                  value={loan.outstandingPrincipal}
                                  onValueChange={(value) =>
                                    updateLoan(loanIndex, {
                                      outstandingPrincipal: value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                原始貸款金額（{loan.currency}）
                                <NumericField
                                  className="field"
                                  data-field-path={`loans.${loanIndex}.originalPrincipal`}
                                  value={loan.originalPrincipal ?? ""}
                                  onValueChange={(value) =>
                                    updateLoan(loanIndex, {
                                      originalPrincipal: value || null,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                年利率（%）
                                <NumericField
                                  className="field"
                                  data-field-path={`loans.${loanIndex}.annualInterestRate`}
                                  value={loan.annualInterestRate ?? ""}
                                  onValueChange={(value) =>
                                    updateLoan(loanIndex, {
                                      annualInterestRate: value || null,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                每月還款金額（{loan.currency}）
                                <NumericField
                                  className="field"
                                  data-field-path={`loans.${loanIndex}.monthlyPayment`}
                                  value={loan.monthlyPayment ?? ""}
                                  onValueChange={(value) =>
                                    updateLoan(loanIndex, {
                                      monthlyPayment: value || null,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                每月還款日
                                <NumericField
                                  className="field"
                                  kind="integer"
                                  value={String(loan.paymentDayOfMonth ?? "")}
                                  onValueChange={(value) =>
                                    updateLoan(loanIndex, {
                                      paymentDayOfMonth: value
                                        ? Number(value)
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
                            {key === "annualInterestRate"
                              ? ""
                              : `（${loan.currency}）`}
                            <NumericField
                              aria-label={label}
                              className="field"
                              data-field-path={`loans.${loanIndex}.${key}`}
                              value={String(loan[key as keyof LoanInput] ?? "")}
                              onValueChange={(value) =>
                                setLoans((items) =>
                                  items.map((item, index) =>
                                    index === loanIndex
                                      ? {
                                          ...item,
                                          [key]:
                                            key === "outstandingPrincipal"
                                              ? value
                                              : value || null,
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
                          <NumericField
                            aria-label="每月還款日"
                            className="field"
                            kind="integer"
                            placeholder="例如 21"
                            value={String(loan.paymentDayOfMonth ?? "")}
                            onValueChange={(value) =>
                              setLoans((items) =>
                                items.map((item, index) =>
                                  index === loanIndex
                                    ? {
                                        ...item,
                                        paymentDayOfMonth: value
                                          ? Number(value)
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
        )}
        {hasPrepared && (
          <section className="rounded-[22px] border border-[#dce4dd] bg-white p-5">
            <h3 className="text-sm font-semibold">資料基準時間</h3>
            <p className="mt-1 text-xs text-[#718078]">
              不修改時使用保存當下時間。補登只能晚於目前最新快照；較早的歷史快照需另行整理相鄰快照與資金流。
            </p>
            <label className="mt-3 block max-w-xs text-xs">
              台灣時間
              <input
                className="field mt-1"
                type="datetime-local"
                value={capturedAtInput}
                onChange={(event) => {
                  setCapturedAtInput(event.target.value);
                  setCustomCapturedAt(true);
                }}
              />
            </label>
            {customCapturedAt && (
              <button
                type="button"
                className="link mt-2 text-xs"
                onClick={() => setCustomCapturedAt(false)}
              >
                改用保存當下時間
              </button>
            )}
          </section>
        )}
        {hasPrepared && (
          <details className="rounded-[22px] border border-[#dce4dd] bg-white p-5">
            <summary className="cursor-pointer text-sm font-semibold">
              表格批次貼上
            </summary>
            <p className="mt-3 text-xs text-[#718078]">
              從試算表複製列：現金、帳戶名稱、幣別、餘額；或持倉、帳戶名稱、代碼、數量、均價。欄位以
              Tab 分隔，僅更新已選帳戶的既有項目。
            </p>
            <textarea
              className="field mt-3 min-h-28 font-mono text-xs"
              aria-label="批次貼上資料"
              value={batchRaw}
              onChange={(event) => setBatchRaw(event.target.value)}
              placeholder="現金&#9;券商帳戶&#9;TWD&#9;1200"
            />
            {batchPreview && (
              <div className="mt-3 text-xs" aria-live="polite">
                <p>
                  可更新 {batchPreview.changes.length} 列；錯誤{" "}
                  {batchPreview.errors.length} 列。
                </p>
                {batchPreview.changes.map((change, index) => (
                  <p key={index} className="mt-1 text-[#476452]">
                    • {change}
                  </p>
                ))}
                {batchPreview.errors.map((error, index) => (
                  <p key={index} className="mt-1 text-red-700">
                    • {error}
                  </p>
                ))}
                <button
                  type="button"
                  className="secondary mt-3"
                  disabled={batchPreview.errors.length > 0 || !!busy}
                  onClick={() => {
                    setAccounts(batchPreview.updated);
                    setCostEditorVersion((version) => version + 1);
                    setBatchRaw("");
                  }}
                >
                  套用 {batchPreview.changes.length} 列至本次編輯
                </button>
              </div>
            )}
          </details>
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
                      <NumericField
                        className="field"
                        placeholder="0"
                        value={flow.amountTwd}
                        onValueChange={(value) =>
                          setCashFlows((items) =>
                            items.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, amountTwd: value }
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
        {preview && (
          <section
            className="rounded-[22px] border border-[#dce4dd] bg-white p-5"
            aria-label="未儲存快照金額預覽"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">修改後金額預覽</h3>
                <p className="mt-1 text-xs text-[#718078]">
                  包含未選取但沿用的帳戶；尚未儲存。
                </p>
              </div>
              {preview.missing.length > 0 && (
                <span className="text-xs font-semibold text-amber-700">
                  有 {preview.missing.length} 項待補齊，合計尚未完整
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
              {(
                [
                  ["總資產", preview.assetsTwd, latest?.totalAssetValueTwd],
                  [
                    "總負債",
                    preview.liabilitiesTwd,
                    latest?.totalLiabilitiesTwd,
                  ],
                  ["淨值", preview.netWorthTwd, latest?.netWorthTwd],
                ] as const
              ).map(([label, current, previous]) => (
                <div key={label} className="rounded-xl bg-[#f6f9f6] p-3">
                  <p className="text-xs text-[#718078]">{label}</p>
                  <strong className="mt-1 block text-lg tabular-nums">
                    {preview.missing.length > 0 ? "待補齊" : money(current)}
                  </strong>
                  {previous && preview.missing.length === 0 && (
                    <small className="text-[#718078]">
                      原 {money(previous)}・差額{" "}
                      {money(decimal(current).minus(previous).toString())}
                    </small>
                  )}
                </div>
              ))}
            </div>
            {preview.missing.length === 0 && (
              <div className="mt-4 border-t border-[#e7ece8] pt-3">
                <p className="mb-2 text-xs font-semibold">帳戶小計（TWD）</p>
                <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
                  {mergedAccounts.map((account) => (
                    <p
                      key={account.accountId ?? account.name}
                      className="flex justify-between gap-2 text-xs"
                    >
                      <span>{account.name}</span>
                      <span className="tabular-nums">
                        {money(
                          preview.accountTotals[
                            account.accountId ?? account.name
                          ],
                        )}
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            )}
            {preview.missing.length > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                待補：{preview.missing.slice(0, 3).join("、")}
              </p>
            )}
          </section>
        )}
        <div className="sticky bottom-0 z-10 -mx-7 -mb-7 flex flex-wrap justify-end gap-3 border-t border-[#dce4dd] bg-white/95 px-7 py-5 shadow-[0_-12px_30px_rgba(22,45,32,.06)] backdrop-blur-xl max-sm:-mx-4 max-sm:-mb-4 max-sm:px-4">
          {needsManualPrice && (
            <p className="mr-auto self-center text-xs text-[#8a6a32]">
              可以直接保存；尚未更新行情的持倉會暫時使用均價估值。
            </p>
          )}
          <button className="secondary" onClick={closeEditor}>
            取消
          </button>
          <button
            className="primary min-w-40"
            disabled={!!busy || (!hasPrepared && selectedItemCount === 0)}
            onClick={hasPrepared ? save : startSelectedItems}
          >
            {busy === "save" ? (
              <>
                <LoaderCircle className="animate-spin" size={15} />
                儲存中…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                {hasPrepared ? "保存這筆紀錄" : "下一步：確認所選項目"}
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
  const contractMultiplier = Number(
    futuresContractMultiplier(position.symbol, position.contractMultiplier) ??
      0,
  );
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
      setError(
        position.securityType === "future"
          ? "請選擇結算帳戶"
          : "請選擇入帳帳戶",
      );
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
            <h2 className="text-xl font-semibold">
              {position.securityType === "future"
                ? "確認期貨結算"
                : "確認全部賣出"}
            </h2>
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
            {position.securityType === "future" ? "結算單價" : "成交單價"}（
            {position.quoteCurrency}）
            <NumericField
              className="field"
              value={salePrice}
              onValueChange={setSalePrice}
            />
          </label>
          <label>
            {position.securityType === "future" ? "結算帳戶" : "入帳帳戶"}
            <select
              className="field"
              value={settlementAccountId}
              onChange={(event) => setSettlementAccountId(event.target.value)}
              disabled={position.securityType === "future"}
            >
              {accounts
                .filter(
                  (account) =>
                    position.securityType !== "future" ||
                    account.accountId === position.accountId,
                )
                .map((account) => (
                  <option
                    key={account.accountId ?? account.name}
                    value={account.accountId}
                  >
                    {account.name}
                  </option>
                ))}
            </select>
          </label>
          {position.securityType === "future" && (
            <p className="notice text-xs">
              系統會依最後行情到結算價的損益差額更新帳戶權益並扣除費稅；從進場到結算的完整已實現損益會另外保存。
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
            <label>
              手續費（{position.quoteCurrency}）
              <NumericField
                className="field"
                value={fee}
                onValueChange={setFee}
              />
            </label>
            <label>
              交易稅（{position.quoteCurrency}）
              <NumericField
                className="field"
                value={tax}
                onValueChange={setTax}
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
            {position.securityType !== "future" && (
              <>
                <span>淨入帳</span>
                <strong className="text-right">
                  {position.quoteCurrency} {number.format(net)}
                </strong>
              </>
            )}
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
            {busy
              ? "處理中…"
              : position.securityType === "future"
                ? "確認結算"
                : "確認全部賣出"}
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
