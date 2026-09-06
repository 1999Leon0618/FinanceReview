import { z } from "zod";
import {
  accountNameKey,
  sameAccountIdentity,
  sameLoanIdentity,
} from "@/lib/account-identity";

const dateString = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "日期格式無效");
const decimalString = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/, "必須是非負十進位數字");
const positiveDecimalString = decimalString.refine(
  (value) => Number(value) > 0,
  "必須大於 0",
);
const nonZeroDecimalString = decimalString.refine(
  (value) => Number(value) !== 0,
  "必須大於 0",
);
const currency = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const fxRateSchema = z.object({
  baseCurrency: currency,
  quoteCurrency: z.literal("TWD"),
  rate: positiveDecimalString,
  rateAsOf: dateString,
  source: z.enum(["YAHOO", "MANUAL", "CARRIED_FORWARD"]),
  status: z.enum(["fresh", "stale", "manual"]),
  overriddenByUser: z.boolean(),
});

export const positionInputSchema = z
  .object({
    positionId: z.string().uuid().optional(),
    securityId: z.string().uuid().optional(),
    market: z.enum(["TWSE", "TPEX", "US", "FUND", "FUTURES"]),
    exchange: z.string().nullable().optional(),
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .transform((value) => value.toUpperCase()),
    providerSymbol: z.string().trim().optional(),
    name: z.string().trim().min(1).max(120),
    securityType: z.enum(["stock", "etf", "fund", "future"]),
    positionSide: z.enum(["long", "short"]).optional(),
    contractMultiplier: positiveDecimalString.optional(),
    contractExpiry: z
      .string()
      .regex(/^\d{6}$/, "到期月份必須是 YYYYMM")
      .optional(),
    quoteCurrency: currency,
    quantity: positiveDecimalString,
    averageCost: decimalString,
    marketPrice: positiveDecimalString,
    quoteAsOf: dateString,
    quoteSource: z.enum(["TWSE", "TPEX", "YAHOO", "MANUAL"]),
    quoteStatus: z.enum(["fresh", "stale", "manual"]),
    quoteNote: z.string().max(300).nullable().optional(),
    fxRate: fxRateSchema.optional(),
  })
  .superRefine((position, context) => {
    if ((position.securityType === "fund") !== (position.market === "FUND")) {
      context.addIssue({
        code: "custom",
        path: ["market"],
        message:
          "一般基金必須使用 FUND 市場，股票與 ETF 則需使用上市、上櫃或美股市場",
      });
    }
    if (
      (position.securityType === "future") !==
      (position.market === "FUTURES")
    ) {
      context.addIssue({
        code: "custom",
        path: ["market"],
        message: "期貨必須使用 FUTURES 市場",
      });
    }
    if (position.securityType === "future") {
      if (!position.positionSide)
        context.addIssue({
          code: "custom",
          path: ["positionSide"],
          message: "期貨必須指定多單或空單",
        });
      if (!position.contractMultiplier)
        context.addIssue({
          code: "custom",
          path: ["contractMultiplier"],
          message: "期貨必須指定契約乘數",
        });
      if (!position.contractExpiry)
        context.addIssue({
          code: "custom",
          path: ["contractExpiry"],
          message: "期貨必須指定到期月份",
        });
    }
  });

export const accountStateSchema = z
  .object({
    accountId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(100),
    institution: z.string().trim().max(100).nullable().optional(),
    accountType: z.enum(["bank", "brokerage", "cash"]),
    accountReference: z.string().trim().max(50).nullable().optional(),
    defaultCurrency: currency,
    cashBalances: z.array(
      z.object({
        currency,
        amount: decimalString,
        fxRate: fxRateSchema.optional(),
      }),
    ),
    positions: z.array(positionInputSchema),
  })
  .superRefine((account, context) => {
    if (account.accountType === "cash" && account.positions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["positions"],
        message:
          "銀行與券商帳戶可以包含股票、ETF、基金或期貨；現金帳戶只能記錄現金餘額",
      });
    }
  });

export const loanInputSchema = z
  .object({
    loanId: z.string().uuid().optional(),
    accountId: z.string().uuid().nullable().optional(),
    accountName: z.string().trim().min(1).max(100).nullable().optional(),
    name: z.string().trim().min(1).max(120),
    institution: z.string().trim().max(100).nullable().optional(),
    loanType: z.enum([
      "mortgage",
      "personal",
      "auto",
      "student",
      "credit",
      "other",
    ]),
    currency,
    originalPrincipal: positiveDecimalString.nullable().optional(),
    outstandingPrincipal: decimalString,
    annualInterestRate: decimalString.nullable().optional(),
    rateType: z.enum(["fixed", "floating"]).nullable().optional(),
    monthlyPayment: decimalString.nullable().optional(),
    paymentDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    nextPaymentDate: dateString.nullable().optional(),
    startDate: dateString.nullable().optional(),
    endDate: dateString.nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    fxRate: fxRateSchema.optional(),
  })
  .superRefine((loan, context) => {
    if (
      loan.originalPrincipal &&
      Number(loan.outstandingPrincipal) > Number(loan.originalPrincipal)
    ) {
      context.addIssue({
        code: "custom",
        path: ["outstandingPrincipal"],
        message: "目前未償本金不可高於原始貸款金額",
      });
    }
    if (loan.annualInterestRate && Number(loan.annualInterestRate) > 100) {
      context.addIssue({
        code: "custom",
        path: ["annualInterestRate"],
        message: "年利率不可高於 100%，請確認是否誤填為小數或金額",
      });
    }
    if (
      Number(loan.outstandingPrincipal) === 0 &&
      loan.monthlyPayment &&
      Number(loan.monthlyPayment) > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["monthlyPayment"],
        message: "貸款已無未償本金，不應仍有每月還款金額",
      });
    }
    if (
      loan.startDate &&
      loan.endDate &&
      Date.parse(loan.startDate) > Date.parse(loan.endDate)
    ) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "預計結束日不可早於貸款開始日",
      });
    }
    if (
      loan.nextPaymentDate &&
      loan.startDate &&
      Date.parse(loan.nextPaymentDate) < Date.parse(loan.startDate)
    ) {
      context.addIssue({
        code: "custom",
        path: ["nextPaymentDate"],
        message: "下次繳款日不可早於貸款開始日",
      });
    }
    if (
      loan.nextPaymentDate &&
      loan.endDate &&
      Date.parse(loan.nextPaymentDate) > Date.parse(loan.endDate)
    ) {
      context.addIssue({
        code: "custom",
        path: ["nextPaymentDate"],
        message: "下次繳款日不可晚於預計結束日",
      });
    }
  });

export const creditCardAccountInputSchema = z
  .object({
    creditCardAccountId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    issuer: z.string().trim().min(1).max(100),
    currency,
    sharedCreditLimit: decimalString,
    statementDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    paymentDayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    status: z.enum(["active", "inactive"]),
    note: z.string().trim().max(500).nullable().optional(),
    cards: z.array(
      z.object({
        cardId: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120),
        lastFour: z
          .string()
          .trim()
          .regex(/^\d{4}$/, "卡號末四碼必須是 4 位數字")
          .nullable()
          .optional(),
        network: z
          .enum(["visa", "mastercard", "jcb", "amex", "unionpay", "other"])
          .nullable()
          .optional(),
        holderType: z.enum(["primary", "additional"]).nullable().optional(),
        status: z.enum(["active", "inactive", "closed"]),
        note: z.string().trim().max(500).nullable().optional(),
      }),
    ),
    statementPeriod: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "帳單月份必須是 YYYY-MM"),
    statementDate: dateString,
    dueDate: dateString,
    statementAmount: decimalString,
    paymentAmount: decimalString,
    paymentDate: dateString.nullable().optional(),
    remainingInstallmentPrincipal: decimalString,
    overpaymentBalance: decimalString,
    fxRate: fxRateSchema.optional(),
  })
  .superRefine((account, context) => {
    if (Date.parse(account.dueDate) < Date.parse(account.statementDate)) {
      context.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "信用卡繳款截止日不可早於帳單日",
      });
    }
    if (Number(account.paymentAmount) > 0 && !account.paymentDate) {
      context.addIssue({
        code: "custom",
        path: ["paymentDate"],
        message: "信用卡已有實際繳款金額時，請填寫繳款日期",
      });
    }
    const duplicateCard = account.cards.findIndex(
      (card, index, cards) =>
        cards.findIndex(
          (item) =>
            (card.cardId && item.cardId === card.cardId) ||
            (card.lastFour && item.lastFour === card.lastFour),
        ) !== index,
    );
    if (duplicateCard >= 0) {
      context.addIssue({
        code: "custom",
        path: ["cards", duplicateCard],
        message: `${account.name} 的實體卡片不可重複`,
      });
    }
  });

function addDuplicateIssues(
  value: {
    accounts: z.infer<typeof accountStateSchema>[];
    loans: z.infer<typeof loanInputSchema>[];
    creditCardAccounts?: z.infer<typeof creditCardAccountInputSchema>[];
  },
  context: z.RefinementCtx,
) {
  value.accounts.forEach((account, accountIndex) => {
    const duplicateCurrency = account.cashBalances.findIndex(
      (balance, index, balances) =>
        balances.findIndex((item) => item.currency === balance.currency) !==
        index,
    );
    if (duplicateCurrency >= 0) {
      context.addIssue({
        code: "custom",
        path: ["accounts", accountIndex, "cashBalances", duplicateCurrency],
        message: `${account.name} 的同一幣別餘額不可重複`,
      });
    }
    const duplicatePosition = account.positions.findIndex(
      (position, index, positions) =>
        positions.findIndex(
          (item) =>
            item.market === position.market && item.symbol === position.symbol,
        ) !== index,
    );
    if (duplicatePosition >= 0) {
      context.addIssue({
        code: "custom",
        path: ["accounts", accountIndex, "positions", duplicatePosition],
        message: `${account.name} 的同一持倉不可重複`,
      });
    }
  });
  value.accounts.forEach((account, index) => {
    if (
      value.accounts.findIndex((item) => sameAccountIdentity(item, account)) !==
      index
    ) {
      context.addIssue({
        code: "custom",
        path: ["accounts", index],
        message: `偵測到重複帳戶：${account.name}`,
      });
    }
  });
  value.loans.forEach((loan, index) => {
    if (
      value.loans.findIndex((item) => sameLoanIdentity(item, loan)) !== index
    ) {
      context.addIssue({
        code: "custom",
        path: ["loans", index],
        message: `偵測到重複貸款：${loan.name}`,
      });
    }
    if (
      (loan.accountId || loan.accountName) &&
      !value.accounts.some(
        (account) =>
          (loan.accountId && account.accountId === loan.accountId) ||
          (loan.accountName &&
            accountNameKey(account.name) === accountNameKey(loan.accountName)),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["loans", index, "accountName"],
        message: `${loan.name} 指定的所屬帳戶不存在於本次快照`,
      });
    }
  });
  (value.creditCardAccounts ?? []).forEach((account, index, accounts) => {
    const duplicate = accounts.findIndex(
      (item) =>
        (account.creditCardAccountId &&
          item.creditCardAccountId === account.creditCardAccountId) ||
        (!account.creditCardAccountId &&
          item.issuer.trim().toLocaleLowerCase("zh-TW") ===
            account.issuer.trim().toLocaleLowerCase("zh-TW") &&
          item.name.trim().toLocaleLowerCase("zh-TW") ===
            account.name.trim().toLocaleLowerCase("zh-TW") &&
          item.currency === account.currency),
    );
    if (duplicate !== index) {
      context.addIssue({
        code: "custom",
        path: ["creditCardAccounts", index],
        message: `偵測到重複信用卡帳戶：${account.name}`,
      });
    }
  });
}

export const snapshotCreateSchema = z
  .object({
    rawInput: z.string().max(20_000),
    baseSnapshotId: z.string().uuid().nullable().optional(),
    capturedAt: dateString.optional(),
    accounts: z.array(accountStateSchema).default([]),
    loans: z.array(loanInputSchema).default([]),
    creditCardAccounts: z.array(creditCardAccountInputSchema).optional(),
    cashFlows: z
      .array(
        z.object({
          flowType: z.enum([
            "capital_contribution",
            "capital_withdrawal",
            "income",
            "fee_tax",
            "other_inflow",
            "other_outflow",
          ]),
          amountTwd: nonZeroDecimalString,
          note: z.string().trim().max(300).nullable().optional(),
        }),
      )
      .default([]),
  })
  .refine(
    (value) =>
      value.accounts.length > 0 ||
      value.loans.length > 0 ||
      (value.creditCardAccounts?.length ?? 0) > 0,
    { message: "至少需要一個帳戶、一筆貸款或一個信用卡帳戶" },
  )
  .superRefine(addDuplicateIssues);

export const saleCreateSchema = z
  .object({
    soldAt: dateString,
    salePrice: positiveDecimalString,
    currency,
    settlementAccountId: z.string().uuid(),
    fee: decimalString.default("0"),
    tax: decimalString.default("0"),
    note: z.string().max(500).nullable().optional(),
  })
  .superRefine((sale, context) => {
    const grossHint = Number(sale.salePrice);
    if (Number(sale.fee) + Number(sale.tax) < 0 || grossHint <= 0) {
      context.addIssue({
        code: "custom",
        path: ["salePrice"],
        message: "成交價格與費稅資料無效",
      });
    }
  });

export const quoteResolveSchema = z
  .object({
    accounts: z.array(accountStateSchema),
    loans: z.array(loanInputSchema).default([]),
    creditCardAccounts: z.array(creditCardAccountInputSchema).optional(),
  })
  .superRefine(addDuplicateIssues);

export type SnapshotCreatePayload = z.infer<typeof snapshotCreateSchema>;
export type SaleCreatePayload = z.infer<typeof saleCreateSchema>;
