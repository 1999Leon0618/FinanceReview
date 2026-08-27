export type AccountType = 'bank' | 'brokerage' | 'cash';
export type Market = 'TWSE' | 'TPEX' | 'US';
export type SecurityType = 'stock' | 'etf';
export type QuoteStatus = 'fresh' | 'stale' | 'manual';
export type QuoteSource = 'TWSE' | 'TPEX' | 'YAHOO' | 'MANUAL';

export interface CashBalanceInput {
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

export interface FxRateInput {
  baseCurrency: string;
  quoteCurrency: 'TWD';
  rate: string;
  rateAsOf: string;
  source: 'YAHOO' | 'MANUAL' | 'CARRIED_FORWARD';
  status: QuoteStatus;
  overriddenByUser: boolean;
}

export interface SnapshotCreateInput {
  rawInput: string;
  baseSnapshotId?: string | null;
  capturedAt?: string;
  accounts: AccountStateInput[];
}

export interface SnapshotSummary {
  id: string;
  capturedAt: string;
  totalCashTwd: string;
  totalSecuritiesTwd: string;
  totalAssetValueTwd: string;
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

export interface AccountView extends Omit<AccountStateInput, 'positions'> {
  accountId: string;
  positions: PositionView[];
}

export interface SnapshotDetail extends SnapshotSummary {
  rawInput: string;
  baseSnapshotId: string | null;
  accounts: AccountView[];
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
  note: string | null;
}

export interface DashboardData {
  latest: SnapshotDetail | null;
  history: SnapshotSummary[];
  trend: Array<{ capturedAt: string; totalAssetValueTwd: string }>;
  sold: SaleView[];
}

export interface ParserPatch {
  unsupportedReason: string | null;
  accountUpdates: Array<{
    accountName: string;
    institution?: string | null;
    accountType: AccountType;
    currency: string;
    balance?: string | null;
  }>;
  positionUpdates: Array<{
    accountName: string;
    market: Market;
    symbol: string;
    name?: string | null;
    securityType: SecurityType;
    quantity: string;
    averageCost: string;
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
  accounts: AccountStateInput[];
  sales: ParserPatch['sales'];
  warnings: string[];
  unsupportedReason: string | null;
}
