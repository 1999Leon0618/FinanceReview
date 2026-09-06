import { describe, expect, it } from "vitest";
import {
  creditCardAccountInputSchema,
  loanInputSchema,
  saleCreateSchema,
  snapshotCreateSchema,
} from "@/lib/validation";

const loan = {
  name: "房貸",
  institution: "測試銀行",
  loanType: "mortgage" as const,
  currency: "TWD",
  originalPrincipal: "1000000",
  outstandingPrincipal: "800000",
  annualInterestRate: "2.2",
  monthlyPayment: "12000",
  startDate: "2025-01-01",
  endDate: "2045-01-01",
};

describe("資產與負債資料合理性檢核", () => {
  it("驗證信用卡帳單日期、繳款日期與卡號末四碼", () => {
    const base = {
      name: "國泰信用卡",
      issuer: "國泰世華",
      currency: "TWD",
      sharedCreditLimit: "200000",
      paymentDayOfMonth: 18,
      status: "active" as const,
      cards: [{ name: "CUBE", lastFour: "1234", status: "active" as const }],
      statementPeriod: "2026-08",
      statementDate: "2026-09-03",
      dueDate: "2026-09-18",
      statementAmount: "12000",
      paymentAmount: "12000",
      paymentDate: "2026-09-17",
      remainingInstallmentPrincipal: "0",
      overpaymentBalance: "0",
    };
    expect(creditCardAccountInputSchema.safeParse(base).success).toBe(true);
    expect(
      creditCardAccountInputSchema.safeParse({
        ...base,
        paymentDate: null,
        cards: [{ ...base.cards[0], lastFour: "12" }],
      }).success,
    ).toBe(false);
  });

  it("允許零元帳單沒有繳款日期及期限，避免阻擋其他帳戶設定", () => {
    expect(
      creditCardAccountInputSchema.safeParse({
        name: "零元信用卡",
        issuer: "測試銀行",
        currency: "TWD",
        sharedCreditLimit: "100000",
        paymentDayOfMonth: null,
        status: "active",
        cards: [],
        statementPeriod: "2026-09",
        statementDate: "2026-09-05",
        dueDate: "2026-09-05",
        statementAmount: "0",
        paymentAmount: "0",
        paymentDate: null,
        remainingInstallmentPrincipal: "0",
        overpaymentBalance: "0",
      }).success,
    ).toBe(true);
  });

  it("拒絕未償本金高於原始貸款金額", () => {
    const result = loanInputSchema.safeParse({
      ...loan,
      outstandingPrincipal: "1200000",
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toContain("不可高於");
  });

  it("拒絕重複貸款，避免負債重複扣除", () => {
    const result = snapshotCreateSchema.safeParse({
      rawInput: "",
      accounts: [],
      loans: [loan, { ...loan }],
    });

    expect(result.success).toBe(false);
    if (!result.success)
      expect(
        result.error.issues.some((issue) => issue.message.includes("重複貸款")),
      ).toBe(true);
  });

  it("拒絕零元資金流", () => {
    const result = snapshotCreateSchema.safeParse({
      rawInput: "",
      accounts: [
        {
          name: "現金",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1" }],
          positions: [],
        },
      ],
      cashFlows: [{ flowType: "capital_contribution", amountTwd: "0" }],
    });
    expect(result.success).toBe(false);
  });

  it("接受包含價格、入帳帳戶與費稅的完整賣出", () => {
    const result = saleCreateSchema.safeParse({
      soldAt: "2026-09-01",
      salePrice: "151",
      currency: "TWD",
      settlementAccountId: "00000000-0000-4000-8000-000000000001",
      fee: "300",
      tax: "450",
    });
    expect(result.success).toBe(true);
  });
});
