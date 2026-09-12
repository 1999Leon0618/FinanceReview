type AccountType = "bank" | "brokerage" | "cash";
export type Market = "TWSE" | "TPEX" | "US" | "FUND" | "FUTURES";
type SecurityType = "stock" | "etf" | "fund" | "future";
type PositionSide = "long" | "short";
type LoanType =
  "mortgage" | "personal" | "auto" | "student" | "credit" | "other";
type LoanRateType = "fixed" | "floating";
export type QuoteStatus = "fresh" | "stale" | "manual";
export type QuoteSource = "TWSE" | "TPEX" | "YAHOO" | "MANUAL";
type SnapshotCashFlowType =
  | "capital_contribution"
  | "capital_withdrawal"
  | "income"
  | "fee_tax"
  | "other_inflow"
  | "other_outflow";
type CreditCardAccountStatus = "active" | "inactive" | "closed";
type CreditCardNetwork =
  "visa" | "mastercard" | "jcb" | "amex" | "unionpay" | "other";
type CreditCardHolderType = "primary" | "additional";
export type CreditCardPaymentStatus =
  | "no_statement"
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "overpaid"
  | "overdue";

export interface SnapshotCashFlowInput {
  flowType: SnapshotCashFlowType;
  amountTwd: string;
  note?: string | null;
}

export interface SnapshotCashFlowView extends SnapshotCashFlowInput {
  id: string;
}

export interface SnapshotChangeBreakdown {
  previousNetWorthTwd: string | null;
  netWorthChangeTwd: string | null;
  assetChangeTwd: string | null;
  liabilityReductionTwd: string | null;
  capitalContributionTwd: string;
  capitalWithdrawalTwd: string;
  incomeTwd: string;
  feeTaxTwd: string;
  otherNetFlowTwd: string;
  marketAndFxTwd: string | null;
}

interface CashBalanceInput {
  currency: string;
  amount: string;
  fxRate?: FxRateInput;
}

export interface PositionInput {
  positionId?: string;
  securityId?: string;
  market: Market;
  exchange?: string | null;
  symbol: string;
  providerSymbol?: string;
  name: string;
  securityType: SecurityType;
  positionSide?: PositionSide;
  contractMultiplier?: string;
  contractExpiry?: string;
  quoteCurrency: string;
  quantity: string;
  averageCost: string;
  marketPrice: string;
  quoteAsOf: string;
  quoteSource: QuoteSource;
  quoteStatus: QuoteStatus;
  quoteNote?: string | null;
  fxRate?: FxRateInput;
}

export interface AccountStateInput {
  accountId?: string;
  name: string;
  institution?: string | null;
  accountType: AccountType;
  accountReference?: string | null;
  defaultCurrency: string;
  cashBalances: CashBalanceInput[];
  positions: PositionInput[];
}

export interface LoanInput {
  loanId?: string;
  accountId?: string | null;
  accountName?: string | null;
  name: string;
  institution?: string | null;
  loanType: LoanType;
  currency: string;
  originalPrincipal?: string | null;
  outstandingPrincipal: string;
  annualInterestRate?: string | null;
  rateType?: LoanRateType | null;
  monthlyPayment?: string | null;
  paymentDayOfMonth?: number | null;
  nextPaymentDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  note?: string | null;
  fxRate?: FxRateInput;
}

export interface LoanView extends LoanInput {
  id: string;
  valueTwd: string;
}

interface CreditCardInput {
  cardId?: string;
  name: string;
  lastFour?: string | null;
  network?: CreditCardNetwork | null;
  holderType?: CreditCardHolderType | null;
  status: CreditCardAccountStatus;
  note?: string | null;
}

export interface CreditCardAccountInput {
  creditCardAccountId?: string;
  name: string;
  issuer: string;
  currency: string;
  sharedCreditLimit: string;
  statementDayOfMonth?: number | null;
  paymentDayOfMonth?: number | null;
  status: CreditCardAccountStatus;
  note?: string | null;
  cards: CreditCardInput[];
  statementPeriod: string;
  statementDate: string;
  dueDate: string;
  statementAmount: string;
  paymentAmount: string;
  paymentDate?: string | null;
  remainingInstallmentPrincipal: string;
  overpaymentBalance: string;
  fxRate?: FxRateInput;
}

export interface CreditCardAccountView extends CreditCardAccountInput {
  id: string;
  statementOutstanding: string;
  utilizationPct: string | null;
  paymentStatus: CreditCardPaymentStatus;
  paidOnTime: boolean | null;
  statementAmountTwd: string;
  liabilityValueTwd: string;
  creditAssetValueTwd: string;
}

export interface FxRateInput {
  baseCurrency: string;
  quoteCurrency: "TWD";
  rate: string;
  rateAsOf: string;
  source: "YAHOO" | "MANUAL" | "CARRIED_FORWARD";
  status: QuoteStatus;
  overriddenByUser: boolean;
}

export interface SnapshotCreateInput {
  rawInput: string;
  baseSnapshotId?: string | null;
  capturedAt?: string;
  accounts: AccountStateInput[];
  loans?: LoanInput[];
  creditCardAccounts?: CreditCardAccountInput[];
  cashFlows?: SnapshotCashFlowInput[];
}

export interface SnapshotSummary {
  id: string;
  capturedAt: string;
  rawInput: string;
  totalCashTwd: string;
  totalSecuritiesTwd: string;
  totalAssetValueTwd: string;
  totalLiabilitiesTwd: string;
  totalCreditCardLiabilitiesTwd: string;
  totalCreditCardCreditsTwd: string;
  netWorthTwd: string;
  totalCostTwd: string;
  unrealizedPnlTwd: string;
}

export interface PositionView extends PositionInput {
  id: string;
  accountId: string;
  accountName: string;
  costValueTwd: string;
  marketValueTwd: string;
  unrealizedPnlTwd: string;
  unrealizedReturnPct: string | null;
}

export interface AccountView extends Omit<AccountStateInput, "positions"> {
  accountId: string;
  positions: PositionView[];
  loans?: LoanView[];
}

export interface SnapshotDetail extends SnapshotSummary {
  baseSnapshotId: string | null;
  accounts: AccountView[];
  loans: LoanView[];
  creditCardAccounts: CreditCardAccountView[];
  cashFlows: SnapshotCashFlowView[];
  changeBreakdown: SnapshotChangeBreakdown;
}

export interface SaleView {
  id: string;
  positionId: string;
  securityId: string;
  accountName: string;
  symbol: string;
  securityName: string;
  soldAt: string;
  quantity: string;
  salePrice: string | null;
  currency: string;
  settlementAccountId: string | null;
  settlementAccountName: string | null;
  fee: string | null;
  tax: string | null;
  grossProceeds: string | null;
  netProceeds: string | null;
  costBasis: string | null;
  realizedPnl: string | null;
  fxRate: string | null;
  realizedPnlTwd: string | null;
  note: string | null;
}

type UpdateFreshnessTone = "fresh" | "attention" | "warning";
type HealthSeverity = "info" | "warning" | "critical";

export interface HealthFinding {
  id: string;
  category: "completeness" | "action";
  severity: HealthSeverity;
  title: string;
  detail: string;
}

export interface HealthReport {
  lastUpdatedAt: string | null;
  daysSinceUpdate: number | null;
  freshnessTone: UpdateFreshnessTone;
  freshnessLabel: string;
  shouldWarnOnOpen: boolean;
  findings: HealthFinding[];
}

export type BenchmarkId = "twii" | "sp500" | "global";

export interface PerformanceSeriesPoint {
  capturedAt: string;
  portfolioIndex?: number;
  benchmarkIndex?: number;
}

export interface PerformanceReport {
  range: "6m" | "1y" | "all";
  benchmarkId: BenchmarkId;
  benchmarkName: string;
  benchmarkError: string | null;
  calculationWarning: string | null;
  beginningValueTwd: string | null;
  endingValueTwd: string | null;
  externalNetFlowTwd: string;
  cumulativeReturnPct: string | null;
  annualizedReturnPct: string | null;
  maxDrawdownPct: string | null;
  benchmarkReturnPct: string | null;
  excessReturnPct: string | null;
  estimated: boolean;
  series: PerformanceSeriesPoint[];
}

export interface DashboardData {
  latest: SnapshotDetail | null;
  history: SnapshotSummary[];
  trend: Array<{ capturedAt: string; totalAssetValueTwd: string }>;
  sold: SaleView[];
  health: HealthReport;
}

export interface AccountTrendPoint {
  capturedAt: string;
  cashValueTwd: string;
  securityValueTwd: string;
  liabilityValueTwd: string;
  totalAssetValueTwd: string;
  netValueTwd: string;
}

export interface SecurityTrendPoint {
  capturedAt: string;
  quantity: string;
  marketValueTwd: string;
  costValueTwd: string;
}

export interface CreditCardTrendPoint {
  capturedAt: string;
  paymentPeriod: string;
  totalDueTwd: string;
  paymentAmountTwd: string;
}

export interface ParserPatch {
  unsupportedReason: string | null;
  accountUpdates: Array<{
    accountName: string;
    institution?: string | null;
    accountReference?: string | null;
    accountType: AccountType;
    currency: string;
    balance?: string | null;
  }>;
  positionUpdates: Array<{
    accountName: string;
    market: Market;
    symbol: string;
    providerSymbol?: string;
    name?: string | null;
    securityType: SecurityType;
    positionSide?: PositionSide;
    contractMultiplier?: string;
    contractExpiry?: string;
    quantity: string;
    averageCost: string;
  }>;
  loanUpdates: Array<{
    accountName?: string | null;
    name: string;
    institution?: string | null;
    loanType: LoanType;
    currency: string;
    originalPrincipal?: string | null;
    outstandingPrincipal: string;
    annualInterestRate?: string | null;
    rateType?: LoanRateType | null;
    monthlyPayment?: string | null;
    paymentDayOfMonth?: number | null;
    nextPaymentDate?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    note?: string | null;
  }>;
  sales: Array<{
    accountName: string;
    market: Market;
    symbol: string;
    soldAt: string;
    salePrice?: string | null;
    note?: string | null;
  }>;
  warnings: string[];
}

export interface SnapshotProposal {
  rawInput: string;
  baseSnapshotId: string | null;
  /** 本次輸入直接涉及、需要顯示給使用者確認的帳戶。 */
  accounts: AccountStateInput[];
  /** 未受本次輸入影響，但儲存完整快照時仍需保留的帳戶。 */
  preservedAccounts: AccountStateInput[];
  /** 本次輸入直接涉及、需要顯示給使用者確認的貸款。 */
  loans: LoanInput[];
  /** 未受本次輸入影響，但儲存完整快照時仍需保留的貸款。 */
  preservedLoans: LoanInput[];
  sales: ParserPatch["sales"];
  warnings: string[];
  unsupportedReason: string | null;
}

export type ResearchMarketScope = "TW" | "US";
export type ResearchNoteType = "premarket" | "intraday" | "postmarket";
type WatchlistOrigin = "holding" | "manual" | "report";
type WatchstockView = "card" | "kline";

export interface MarketQuoteView {
  price: string | null;
  previousClose: string | null;
  changeValue: string | null;
  changePercent: string | null;
  volume: string | null;
  currency: string;
  quoteAsOf: string | null;
  source: QuoteSource | null;
  status: QuoteStatus | "missing";
  marketSession: string | null;
  note: string | null;
}

export interface WatchlistItem {
  id: string;
  securityId: string;
  market: Extract<Market, "TWSE" | "TPEX" | "US">;
  symbol: string;
  providerSymbol: string;
  name: string;
  securityType: Extract<SecurityType, "stock" | "etf">;
  quoteCurrency: string;
  origin: WatchlistOrigin;
  enabled: boolean;
  held: boolean;
  quote: MarketQuoteView;
  createdAt: string;
  updatedAt: string;
}

export interface CandlePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ResearchNoteBlock =
  | {
      id: string;
      type: "metric-grid";
      items: Array<{
        label: string;
        value: string;
        detail?: string;
        tone?: "neutral" | "positive" | "negative";
      }>;
    }
  | {
      id: string;
      type: "callout";
      label: string;
      markdown: string;
      tone?: "neutral" | "positive" | "negative";
    }
  | { id: string; type: "markdown"; markdown: string }
  | {
      id: string;
      type: "watchstock";
      watchlistItemId: string;
      view?: WatchstockView;
      noRelevantContent?: boolean;
    };

export interface ResearchNoteDocumentV1 {
  schemaVersion: 1;
  blocks: ResearchNoteBlock[];
}

export interface ResearchSource {
  id: string;
  noteId: string;
  blockId: string | null;
  watchlistItemId: string | null;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
}

export interface ResearchQuoteSnapshot extends MarketQuoteView {
  id: string;
  noteId: string;
  blockId: string;
  watchlistItemId: string;
  view: WatchstockView;
  market: Extract<Market, "TWSE" | "TPEX" | "US">;
  symbol: string;
  name: string;
  candles: CandlePoint[];
}

export interface ResearchNote {
  id: string;
  marketScope: ResearchMarketScope;
  noteType: ResearchNoteType;
  reportDate: string;
  tradingDate: string;
  asOf: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  noRelevantContent: boolean;
  document: ResearchNoteDocumentV1;
  contentSchemaVersion: 1;
  revision: number;
  archivedAt: string | null;
  sources: ResearchSource[];
  quoteSnapshots: ResearchQuoteSnapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchTodo {
  id: string;
  marketScope: ResearchMarketScope;
  title: string;
  details: string | null;
  scheduledFor: string | null;
  status: "open" | "completed";
  requiresNote: boolean;
  noteId: string | null;
  watchlistItemIds: string[];
  failureReason: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
