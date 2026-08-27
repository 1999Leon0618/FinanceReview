import { z } from 'zod';

const dateString = z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), '日期格式無效');
const decimalString = z.string().trim().regex(/^\d+(?:\.\d+)?$/, '必須是非負十進位數字');
const positiveDecimalString = decimalString.refine((value) => Number(value) > 0, '必須大於 0');
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const fxRateSchema = z.object({
  baseCurrency: currency,
  quoteCurrency: z.literal('TWD'),
  rate: positiveDecimalString,
  rateAsOf: dateString,
  source: z.enum(['YAHOO', 'MANUAL', 'CARRIED_FORWARD']),
  status: z.enum(['fresh', 'stale', 'manual']),
  overriddenByUser: z.boolean(),
});

export const positionInputSchema = z.object({
  positionId: z.string().uuid().optional(),
  securityId: z.string().uuid().optional(),
  market: z.enum(['TWSE', 'TPEX', 'US']),
  exchange: z.string().nullable().optional(),
  symbol: z.string().trim().min(1).max(24).transform((value) => value.toUpperCase()),
  providerSymbol: z.string().trim().optional(),
  name: z.string().trim().min(1).max(120),
  securityType: z.enum(['stock', 'etf']),
  quoteCurrency: currency,
  quantity: positiveDecimalString,
  averageCost: decimalString,
  marketPrice: positiveDecimalString,
  quoteAsOf: dateString,
  quoteSource: z.enum(['TWSE', 'TPEX', 'YAHOO', 'MANUAL']),
  quoteStatus: z.enum(['fresh', 'stale', 'manual']),
  quoteNote: z.string().max(300).nullable().optional(),
  fxRate: fxRateSchema.optional(),
});

export const accountStateSchema = z.object({
  accountId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  institution: z.string().trim().max(100).nullable().optional(),
  accountType: z.enum(['bank', 'brokerage', 'cash']),
  accountReference: z.string().trim().max(50).nullable().optional(),
  defaultCurrency: currency,
  cashBalances: z.array(z.object({
    currency,
    amount: decimalString,
    fxRate: fxRateSchema.optional(),
  })),
  positions: z.array(positionInputSchema),
});

export const snapshotCreateSchema = z.object({
  rawInput: z.string().max(20_000),
  baseSnapshotId: z.string().uuid().nullable().optional(),
  capturedAt: dateString.optional(),
  accounts: z.array(accountStateSchema).min(1, '至少需要一個帳戶'),
});

export const saleCreateSchema = z.object({
  soldAt: dateString,
  salePrice: decimalString.nullable().optional(),
  currency,
  note: z.string().max(500).nullable().optional(),
});

export const parserPatchSchema = z.object({
  unsupportedReason: z.string().nullable(),
  accountUpdates: z.array(z.object({
    accountName: z.string().trim().min(1),
    institution: z.string().nullable().optional(),
    accountType: z.enum(['bank', 'brokerage', 'cash']),
    currency,
    balance: decimalString.nullable().optional(),
  })),
  positionUpdates: z.array(z.object({
    accountName: z.string().trim().min(1),
    market: z.enum(['TWSE', 'TPEX', 'US']),
    symbol: z.string().trim().min(1).transform((value) => value.toUpperCase()),
    name: z.string().nullable().optional(),
    securityType: z.enum(['stock', 'etf']),
    quantity: positiveDecimalString,
    averageCost: decimalString,
  })),
  sales: z.array(z.object({
    accountName: z.string().trim().min(1),
    market: z.enum(['TWSE', 'TPEX', 'US']),
    symbol: z.string().trim().min(1).transform((value) => value.toUpperCase()),
    soldAt: dateString,
    salePrice: decimalString.nullable().optional(),
    note: z.string().nullable().optional(),
  })),
  warnings: z.array(z.string()),
});

export const quoteResolveSchema = z.object({
  accounts: z.array(accountStateSchema),
});

export type SnapshotCreatePayload = z.infer<typeof snapshotCreateSchema>;
export type SaleCreatePayload = z.infer<typeof saleCreateSchema>;
