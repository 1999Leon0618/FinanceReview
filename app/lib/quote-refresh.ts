import { resolveAccountQuotes } from "./quotes";
import type {
  AccountStateInput,
  LoanInput,
  PositionInput,
  QuoteStatus,
  SnapshotDetail,
} from "./types";

export interface QuoteRefreshSummary {
  total: number;
  fresh: number;
  stale: number;
  manual: number;
}

export interface QuoteRefreshFailure {
  positionId: string;
  accountName: string;
  symbol: string;
  name: string;
  currency: string;
  oldPrice: string;
  reason: string;
}

export interface QuoteRefreshPreview extends QuoteRefreshSummary {
  baseSnapshotId: string;
  accounts: AccountStateInput[];
  loans: LoanInput[];
  failures: QuoteRefreshFailure[];
  warnings: string[];
}

type QuoteRefreshDependencies = {
  resolve?: typeof resolveAccountQuotes;
};

export function summarizeQuoteStatuses(
  accounts: AccountStateInput[],
): QuoteRefreshSummary {
  const statuses = accounts.flatMap((account) =>
    account.positions.map((position) => position.quoteStatus),
  );
  const count = (status: QuoteStatus) =>
    statuses.filter((item) => item === status).length;
  return {
    total: statuses.length,
    fresh: count("fresh"),
    stale: count("stale"),
    manual: count("manual"),
  };
}

function cloneAccounts(latest: SnapshotDetail): AccountStateInput[] {
  return latest.accounts.map((account) => ({
    accountId: account.accountId,
    name: account.name,
    institution: account.institution,
    accountType: account.accountType,
    accountReference: account.accountReference,
    defaultCurrency: account.defaultCurrency,
    cashBalances: account.cashBalances.map((balance) => ({ ...balance })),
    positions: account.positions.map((position) => ({
      positionId: position.positionId,
      securityId: position.securityId,
      market: position.market,
      exchange: position.exchange,
      symbol: position.symbol,
      providerSymbol: position.providerSymbol,
      name: position.name,
      securityType: position.securityType,
      positionSide: position.positionSide,
      contractMultiplier: position.contractMultiplier,
      contractExpiry: position.contractExpiry,
      quoteCurrency: position.quoteCurrency,
      quantity: position.quantity,
      averageCost: position.averageCost,
      marketPrice: position.marketPrice,
      quoteAsOf: position.quoteAsOf,
      quoteSource: position.quoteSource,
      quoteStatus: position.quoteStatus,
      quoteNote: position.quoteNote,
      fxRate: position.fxRate,
    })),
  }));
}

const positionKey = (position: Pick<PositionInput, "positionId" | "symbol">) =>
  position.positionId ?? position.symbol;

export async function prepareQuoteRefresh(
  latest: SnapshotDetail,
  dependencies: QuoteRefreshDependencies = {},
): Promise<QuoteRefreshPreview> {
  const accounts = cloneAccounts(latest);
  const total = accounts.reduce(
    (sum, account) => sum + account.positions.length,
    0,
  );
  if (total === 0) throw new Error("最新快照沒有可更新的投資標的");

  const resolved = await (dependencies.resolve ?? resolveAccountQuotes)(
    accounts,
  );
  const summary = summarizeQuoteStatuses(resolved.accounts);
  const previous = new Map(
    accounts.flatMap((account) =>
      account.positions.map((position) => [positionKey(position), position]),
    ),
  );
  const failures: QuoteRefreshFailure[] = [];

  const previewAccounts = resolved.accounts.map((account) => ({
    ...account,
    positions: account.positions.map((position) => {
      if (position.quoteStatus === "fresh") return position;
      const old = previous.get(positionKey(position));
      if (!old) return position;
      failures.push({
        positionId: position.positionId ?? position.symbol,
        accountName: account.name,
        symbol: position.symbol,
        name: position.name,
        currency: old.quoteCurrency,
        oldPrice: old.marketPrice,
        reason: position.quoteNote ?? "目前無法取得最新行情",
      });
      return {
        ...position,
        marketPrice: old.marketPrice,
        quoteCurrency: old.quoteCurrency,
        quoteAsOf: old.quoteAsOf,
        quoteSource: old.quoteSource,
        quoteStatus: "stale" as const,
        quoteNote: `行情更新失敗，沿用 ${old.quoteAsOf.slice(0, 10)} 的舊資料`,
        fxRate: old.fxRate,
      };
    }),
  }));

  return {
    ...summary,
    baseSnapshotId: latest.id,
    accounts: previewAccounts,
    loans: latest.loans.map((loan) => ({
      loanId: loan.loanId,
      accountId: loan.accountId,
      accountName: loan.accountName,
      name: loan.name,
      institution: loan.institution,
      loanType: loan.loanType,
      currency: loan.currency,
      originalPrincipal: loan.originalPrincipal,
      outstandingPrincipal: loan.outstandingPrincipal,
      annualInterestRate: loan.annualInterestRate,
      rateType: loan.rateType,
      monthlyPayment: loan.monthlyPayment,
      paymentDayOfMonth: loan.paymentDayOfMonth,
      nextPaymentDate: loan.nextPaymentDate,
      startDate: loan.startDate,
      endDate: loan.endDate,
      note: loan.note,
      fxRate: loan.fxRate,
    })),
    failures,
    warnings: resolved.warnings,
  };
}
