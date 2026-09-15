import { describe, expect, it } from "vitest";
import { financePageFromPathname } from "@/lib/dashboard-navigation";

describe("Dashboard 分頁路徑", () => {
  it.each([
    ["/", "overview"],
    ["/accounts", "accounts"],
    ["/investments", "investments"],
    ["/credit-cards", "credit-cards"],
    ["/research", "research"],
    ["/settings", "settings"],
  ])("將 %s 對應至 %s 分頁", (pathname, expected) => {
    expect(financePageFromPathname(pathname)).toBe(expected);
  });

  it("不攔截 Dashboard 以外的頁面", () => {
    expect(financePageFromPathname("/admin/users")).toBeNull();
    expect(financePageFromPathname("/pending")).toBeNull();
  });
});
