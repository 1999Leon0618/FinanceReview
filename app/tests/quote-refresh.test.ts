import { describe, expect, it } from "vitest";
import {
  prepareQuoteRefresh,
  summarizeQuoteStatuses,
} from "@/lib/quote-refresh";
import type { AccountStateInput, SnapshotDetail } from "@/lib/types";

const position = (
  symbol: string,
  quoteStatus: "fresh" | "stale" | "manual",
  marketPrice = "12",
) => ({
  market: "TWSE" as const,
  symbol,
  name: symbol,
  securityType: "stock" as const,
  quoteCurrency: "TWD",
  quantity: "1",
  averageCost: "10",
  marketPrice,
  quoteAsOf: "2026-08-28T00:00:00.000Z",
  quoteSource:
    quoteStatus === "manual" ? ("MANUAL" as const) : ("TWSE" as const),
  quoteStatus,
});

const account = (
  positions: AccountStateInput["positions"],
): AccountStateInput => ({
  accountId: "account-1",
  name: "測試券商",
  accountType: "brokerage",
  defaultCurrency: "TWD",
  cashBalances: [],
  positions,
});

const latest = (positions: AccountStateInput["positions"]): SnapshotDetail => ({
  id: "snapshot-1",
  capturedAt: "2026-08-27T00:00:00.000Z",
  rawInput: "原快照",
  baseSnapshotId: null,
  totalCashTwd: "0",
  totalSecuritiesTwd: "12",
  totalAssetValueTwd: "12",
  totalLiabilitiesTwd: "0",
  totalCreditCardLiabilitiesTwd: "0",
  totalCreditCardCreditsTwd: "0",
  netWorthTwd: "12",
  totalCostTwd: "10",
  unrealizedPnlTwd: "2",
  accounts: [
    {
      ...account(positions),
      accountId: "account-1",
      positions: positions.map((item, index) => ({
        ...item,
        id: `snapshot-position-${index}`,
        positionId: `position-${index}`,
        securityId: `security-${index}`,
        accountId: "account-1",
        accountName: "測試券商",
        costValueTwd: "10",
        marketValueTwd: "12",
        unrealizedPnlTwd: "2",
        unrealizedReturnPct: "20",
      })),
    },
  ],
  loans: [],
  creditCardAccounts: [],
  cashFlows: [],
  changeBreakdown: {
    previousNetWorthTwd: null,
    netWorthChangeTwd: null,
    assetChangeTwd: null,
    liabilityReductionTwd: null,
    capitalContributionTwd: "0",
    capitalWithdrawalTwd: "0",
    incomeTwd: "0",
    feeTaxTwd: "0",
    otherNetFlowTwd: "0",
    marketAndFxTwd: null,
  },
});

describe("一鍵更新標的現值", () => {
  it("統計各種行情狀態", () => {
    expect(
      summarizeQuoteStatuses([
        account([
          position("2330", "fresh"),
          position("0050", "stale"),
          position("FUND", "manual"),
        ]),
      ]),
    ).toEqual({ total: 3, fresh: 1, stale: 1, manual: 1 });
  });

  it("全部成功時回傳可直接保存的更新預覽", async () => {
    const result = await prepareQuoteRefresh(
      latest([position("2330", "manual")]),
      {
        resolve: async (accounts) => ({
          accounts: [
            account([
              {
                ...accounts[0].positions[0],
                marketPrice: "20",
                quoteStatus: "fresh",
                quoteSource: "TWSE",
              },
            ]),
          ],
          warnings: [],
        }),
      },
    );

    expect(result).toMatchObject({ fresh: 1, stale: 0, manual: 0 });
    expect(result.failures).toEqual([]);
    expect(result.accounts[0].positions[0].marketPrice).toBe("20");
  });

  it("更新失敗時列出補價項目並恢復上一份快照價格", async () => {
    const result = await prepareQuoteRefresh(
      latest([position("0050", "fresh", "12")]),
      {
        resolve: async (accounts) => ({
          accounts: [
            account([
              {
                ...accounts[0].positions[0],
                marketPrice: "99",
                quoteStatus: "stale",
                quoteNote: "行情服務暫時無法使用",
              },
            ]),
          ],
          warnings: ["0050 沿用舊行情。"],
        }),
      },
    );

    expect(result.failures).toEqual([
      expect.objectContaining({
        positionId: "position-0",
        symbol: "0050",
        oldPrice: "12",
        reason: "行情服務暫時無法使用",
      }),
    ]);
    expect(result.accounts[0].positions[0]).toMatchObject({
      marketPrice: "12",
      quoteStatus: "stale",
    });
  });

  it("全部失敗時仍回傳手動補價或沿用舊值的選項", async () => {
    const result = await prepareQuoteRefresh(
      latest([position("0050", "fresh")]),
      {
        resolve: async (accounts) => ({
          accounts: [
            account([
              {
                ...accounts[0].positions[0],
                quoteStatus: "manual",
                quoteSource: "MANUAL",
                quoteNote: "無可用行情",
              },
            ]),
          ],
          warnings: ["0050 無可用行情。"],
        }),
      },
    );

    expect(result.fresh).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.accounts[0].positions[0].marketPrice).toBe("12");
  });
});
