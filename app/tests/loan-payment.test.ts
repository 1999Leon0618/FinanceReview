import { describe, expect, it } from "vitest";
import {
  advanceLoanPaymentDate,
  estimateLoanPrincipalPayment,
  recordLoanPayment,
} from "@/lib/loan-payment";
import type { LoanInput } from "@/lib/types";

const loan: LoanInput = {
  loanId: "23c6c157-394f-48a3-b31e-169f0c3bd6fc",
  name: "房屋貸款",
  institution: "測試銀行",
  loanType: "mortgage",
  currency: "TWD",
  originalPrincipal: "1000000",
  outstandingPrincipal: "300000",
  annualInterestRate: "2.4",
  monthlyPayment: "10000",
  paymentDayOfMonth: 31,
  nextPaymentDate: "2026-01-31",
};

describe("貸款還款", () => {
  it("以月付金扣除估算利息後帶入本金", () => {
    expect(estimateLoanPrincipalPayment(loan)).toBe("9400");
  });

  it("下期日期依約定還款日推進並處理月底", () => {
    expect(advanceLoanPaymentDate("2026-01-31", 31, "2026-01-31")).toBe(
      "2026-02-28",
    );
    expect(advanceLoanPaymentDate("2026-02-28", 31, "2026-02-28")).toBe(
      "2026-03-31",
    );
  });

  it("沒有既有下期日期時，從實際付款月份排定下個月", () => {
    expect(advanceLoanPaymentDate(null, 15, "2026-09-22")).toBe("2026-10-15");
  });

  it("扣減未償本金並推進下期日期", () => {
    expect(recordLoanPayment(loan, "9400", "2026-01-31")).toMatchObject({
      outstandingPrincipal: "290600",
      monthlyPayment: "10000",
      nextPaymentDate: "2026-02-28",
    });
  });

  it("最後一期結清後移除月付金與下次繳款日", () => {
    expect(
      recordLoanPayment(
        { ...loan, outstandingPrincipal: "5000" },
        "5000",
        "2026-01-31",
      ),
    ).toMatchObject({
      outstandingPrincipal: "0",
      monthlyPayment: null,
      nextPaymentDate: null,
    });
  });

  it("拒絕超過未償本金的還款", () => {
    expect(() => recordLoanPayment(loan, "300001", "2026-01-31")).toThrow(
      "本期償還本金不可高於未償本金",
    );
  });
});
