import { describe, expect, it } from "vitest";
import {
  creditCardCycleDates,
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
