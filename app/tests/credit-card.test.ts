import { describe, expect, it } from "vitest";
import {
  creditCardCycleDates,
  creditCardDisplayPayment,
  creditCardPaymentLabel,
  creditCardPaymentMonthLabel,
  followingCreditCardDueDate,
  normalizeCreditCardAccountStatus,
} from "@/lib/credit-card";

describe("信用卡繳款期限", () => {
  it("依帳戶設定的期限日計算，不使用輸入日期代替", () => {
    expect(creditCardCycleDates("2026-09-05", 20, 27)).toMatchObject({
      dueDate: "2026-09-27",
      statementPeriod: "2026-09",
    });
  });

  it("未設定期限時不猜測日期", () => {
    expect(creditCardCycleDates("2026-09-05", 20, null)).toBeNull();
  });

  it("以繳款到期月份呈現，並將內部狀態整理成四種使用者語意", () => {
    expect(creditCardPaymentMonthLabel("2026-09-18")).toBe("2026 年 9 月");
    expect(creditCardPaymentLabel("paid")).toBe("已繳");
    expect(creditCardPaymentLabel("overpaid")).toBe("已繳");
    expect(creditCardPaymentLabel("partially_paid")).toBe("部分繳");
    expect(creditCardPaymentLabel("overdue")).toBe("未繳");
    expect(creditCardPaymentLabel("no_statement")).toBe("待更新");
  });

  it("進入下一個繳款月份後將已繳帳單顯示為當月待更新", () => {
    expect(
      creditCardDisplayPayment(
        "2026-09-18",
        18,
        "paid",
        new Date("2026-09-10T00:00:00+08:00"),
      ),
    ).toEqual({ dueDate: "2026-09-18", label: "已繳", awaitingUpdate: false });
    expect(
      creditCardDisplayPayment(
        "2026-09-18",
        18,
        "paid",
        new Date("2026-12-01T00:00:00+08:00"),
      ),
    ).toEqual({
      dueDate: "2026-12-18",
      label: "待更新",
      awaitingUpdate: true,
    });
  });

  it("已完成本期繳款後推算下個月期限", () => {
    expect(followingCreditCardDueDate("2026-09-18", 18)).toBe("2026-10-18");
    expect(followingCreditCardDueDate("2026-01-31", 31)).toBe("2026-02-28");
    expect(followingCreditCardDueDate("2026-12-31", 31)).toBe("2027-01-31");
  });

  it("剪卡只影響個別卡片，全部無使用中卡片時停用額度群組", () => {
    expect(
      normalizeCreditCardAccountStatus("active", [
        { status: "closed" },
        { status: "inactive" },
      ]),
    ).toBe("inactive");
    expect(
      normalizeCreditCardAccountStatus("closed", [{ status: "active" }]),
    ).toBe("active");
  });
});
