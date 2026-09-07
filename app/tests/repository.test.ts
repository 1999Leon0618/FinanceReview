import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDatabaseForTests } from "@/lib/db";
import { dataOwnerFromEmail, runWithDataOwner } from "@/lib/data-owner";
import {
  createSnapshot,
  exportBackup,
  getAccountTrend,
  getCreditCardTrend,
  getDashboard,
  getLatestSnapshot,
  getSecurityTrend,
  getSnapshotDetail,
  importBackup,
  listSales,
  sellPosition,
} from "@/lib/repository";
import { buildProposal } from "@/lib/parser";
import { accountStateSchema } from "@/lib/validation";

const temp = mkdtempSync(path.join(tmpdir(), "finance-review-test-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "test.db");

const baseAccount = {
  name: "富邦證券",
  institution: "富邦",
  accountType: "brokerage" as const,
  defaultCurrency: "TWD",
  cashBalances: [{ currency: "TWD", amount: "100000" }],
  positions: [
    {
      market: "TWSE" as const,
      symbol: "0050",
      name: "元大台灣50",
      securityType: "etf" as const,
      quoteCurrency: "TWD",
      quantity: "3000",
      averageCost: "100",
      marketPrice: "150",
      quoteAsOf: "2026-08-27T00:00:00.000Z",
      quoteSource: "TWSE" as const,
      quoteStatus: "fresh" as const,
    },
  ],
};
let loanSnapshotId = "";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-28T12:00:00.000Z"));
  closeDatabaseForTests();
});

describe("依登入郵箱隔離資料", () => {
  it("不同郵箱無法讀取彼此的快照、儀表板與備份", async () => {
    const ownerA = dataOwnerFromEmail("User.A@Example.com");
    const ownerB = dataOwnerFromEmail("user.b@example.com");
    const snapshotA = await runWithDataOwner(ownerA, () =>
      createSnapshot({
        rawInput: "A 的私人資料",
        capturedAt: "2026-09-01T00:00:00.000Z",
        accounts: [
          {
            name: "A 的帳戶",
            accountType: "bank",
            defaultCurrency: "TWD",
            cashBalances: [{ currency: "TWD", amount: "100" }],
            positions: [],
          },
        ],
      }),
    );

    await runWithDataOwner(ownerB, async () => {
      expect(await getSnapshotDetail(snapshotA.id)).toBeNull();
      expect((await getDashboard()).latest).toBeNull();
      expect((await exportBackup()).data.snapshots).toHaveLength(0);
    });

    await runWithDataOwner(ownerB, () =>
      createSnapshot({
        rawInput: "B 的私人資料",
        capturedAt: "2026-09-02T00:00:00.000Z",
        accounts: [
          {
            name: "B 的帳戶",
            accountType: "bank",
            defaultCurrency: "TWD",
            cashBalances: [{ currency: "TWD", amount: "200" }],
            positions: [],
          },
        ],
      }),
    );

    await runWithDataOwner(ownerA, async () => {
      expect((await getDashboard()).latest?.rawInput).toBe("A 的私人資料");
      const backup = await exportBackup();
      expect(backup.data.snapshots).toHaveLength(1);
      expect(backup.data.accounts).toHaveLength(1);
      expect(JSON.stringify(backup)).not.toContain(ownerA.key);
      expect(JSON.stringify(backup)).not.toContain(ownerA.email);
    });
  });
});
afterAll(() => {
  closeDatabaseForTests();
  vi.useRealTimers();
  rmSync(temp, { recursive: true, force: true });
});

describe("快照與全部賣出", () => {
  it("伺服器重算總額", async () => {
    const snapshot = await createSnapshot({
      rawInput: "初始狀態",
      capturedAt: "2026-08-27T08:00:00.000Z",
      accounts: [baseAccount],
    });
    expect(snapshot.totalCashTwd).toBe("100000");
    expect(snapshot.totalSecuritiesTwd).toBe("450000");
    expect(snapshot.totalAssetValueTwd).toBe("550000");
    expect(snapshot.unrealizedPnlTwd).toBe("150000");
  });

  it("原子性結算賣出、調整現金、計算已實現損益並關閉持倉", async () => {
    const position = (await getLatestSnapshot())!.accounts[0].positions[0];
    const result = await sellPosition(position.positionId!, {
      soldAt: "2026-08-28T00:00:00.000Z",
      salePrice: "151",
      currency: "TWD",
      settlementAccountId: position.accountId,
      fee: "300",
      tax: "450",
      note: "全部出清",
    });
    expect(result.totalCashTwd).toBe("552250");
    expect(result.totalSecuritiesTwd).toBe("0");
    expect(result.totalAssetValueTwd).toBe("552250");
    expect(result.accounts[0].positions).toHaveLength(0);
    expect(await listSales()).toMatchObject([
      {
        positionId: position.positionId,
        quantity: "3000",
        salePrice: "151",
        grossProceeds: "453000",
        netProceeds: "452250",
        costBasis: "300000",
        realizedPnl: "152250",
        realizedPnlTwd: "152250",
      },
    ]);
    expect(result.changeBreakdown).toMatchObject({
      feeTaxTwd: "750",
      netWorthChangeTwd: "2250",
      marketAndFxTwd: "3000",
    });
    await expect(
      sellPosition(position.positionId!, {
        soldAt: "2026-08-28T00:00:00.000Z",
        salePrice: "151",
        currency: "TWD",
        settlementAccountId: position.accountId,
        fee: "0",
        tax: "0",
      }),
    ).rejects.toThrow("已售出");
  });

  it("重新持有同一證券會建立新的持倉週期", async () => {
    const soldId = (await listSales())[0].positionId;
    const previous = (await getLatestSnapshot())!;
    const next = await createSnapshot({
      rawInput: "重新持有",
      baseSnapshotId: previous.id,
      capturedAt: "2026-09-01T08:00:00.000Z",
      accounts: [
        {
          ...baseAccount,
          accountId: previous.accounts[0].accountId,
          positions: [
            {
              ...baseAccount.positions[0],
              quantity: "1000",
              averageCost: "145",
            },
          ],
        },
      ],
    });
    expect(next.accounts[0].positions[0].positionId).not.toBe(soldId);
    expect(await listSales()).toHaveLength(1);
  });

  it("分次記錄同一帳戶時保留既有幣別", async () => {
    const first = await createSnapshot({
      rawInput: "永豐銀行30652",
      capturedAt: "2026-09-02T08:00:00.000Z",
      accounts: [
        {
          name: "永豐銀行",
          institution: "永豐",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "30652" }],
          positions: [],
        },
      ],
    });
    const proposal = await buildProposal("永豐銀行日幣60000", {
      unsupportedReason: null,
      accountUpdates: [
        {
          accountName: "永豐銀行",
          institution: "永豐",
          accountType: "bank",
          currency: "JPY",
          balance: "60000",
        },
      ],
      positionUpdates: [],
      loanUpdates: [],
      sales: [],
      warnings: [],
    });

    expect(proposal.baseSnapshotId).toBe(first.id);
    expect(proposal.accounts).toHaveLength(1);
    expect(proposal.accounts[0].cashBalances).toEqual([
      { currency: "TWD", amount: "30652" },
      { currency: "JPY", amount: "60000" },
    ]);
    expect(proposal.preservedAccounts).toHaveLength(0);
  });

  it("確認表只回傳本次相關帳戶，完整快照仍保留其他帳戶", async () => {
    await createSnapshot({
      rawInput: "建立銀行與券商帳戶",
      capturedAt: "2026-09-03T08:00:00.000Z",
      accounts: [
        {
          name: "永豐銀行",
          institution: "永豐",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "30000" }],
          positions: [],
        },
        baseAccount,
      ],
    });

    const proposal = await buildProposal("永豐銀行 35000", {
      unsupportedReason: null,
      accountUpdates: [
        {
          accountName: "永豐銀行",
          institution: "永豐",
          accountType: "bank",
          currency: "TWD",
          balance: "35000",
        },
      ],
      positionUpdates: [],
      loanUpdates: [],
      sales: [],
      warnings: [],
    });

    expect(proposal.accounts.map((account) => account.name)).toEqual([
      "永豐銀行",
    ]);
    expect(proposal.accounts[0].cashBalances[0].amount).toBe("35000");
    expect(proposal.preservedAccounts.map((account) => account.name)).toEqual([
      "富邦證券",
    ]);
  });

  it("銀行與券商可包含投資品項，純現金帳戶不可包含", async () => {
    expect(() =>
      accountStateSchema.parse({ ...baseAccount, accountType: "bank" }),
    ).not.toThrow();
    expect(() =>
      accountStateSchema.parse({ ...baseAccount, accountType: "cash" }),
    ).toThrow(/現金帳戶只能記錄現金餘額/);

    const fundSnapshot = await createSnapshot({
      rawInput: "國泰世華銀行新增基金",
      capturedAt: "2026-09-04T08:00:00.000Z",
      accounts: [
        {
          ...baseAccount,
          name: "國泰世華銀行",
          institution: "國泰",
          accountType: "bank",
          positions: [
            {
              market: "FUND",
              symbol: "FUND-001",
              name: "全球收益基金",
              securityType: "fund",
              quoteCurrency: "TWD",
              quantity: "100",
              averageCost: "10",
              marketPrice: "11",
              quoteAsOf: "2026-09-04T00:00:00.000Z",
              quoteSource: "MANUAL",
              quoteStatus: "manual",
            },
          ],
        },
      ],
    });

    expect(fundSnapshot.accounts[0].cashBalances[0].amount).toBe("100000");
    expect(fundSnapshot.accounts[0].positions[0]).toMatchObject({
      market: "FUND",
      securityType: "fund",
      symbol: "FUND-001",
    });

    const proposal = await buildProposal("國泰世華銀行全球收益基金120單位", {
      unsupportedReason: null,
      accountUpdates: [],
      positionUpdates: [
        {
          accountName: "國泰世華銀行",
          market: "FUND",
          symbol: "FUND-001",
          name: "全球收益基金",
          securityType: "fund",
          quantity: "120",
          averageCost: "10",
        },
      ],
      loanUpdates: [],
      sales: [],
      warnings: [],
    });
    expect(proposal.accounts[0]).toMatchObject({
      name: "國泰世華銀行",
      accountType: "bank",
      positions: [{ symbol: "FUND-001", quantity: "120" }],
    });
    expect(proposal.warnings).toEqual([]);
  });

  it("貸款未償本金會從資產總額扣除並保留快照明細", async () => {
    const snapshot = await createSnapshot({
      rawInput: "國泰房貸剩餘30萬，利率2.1%，每月繳38000",
      capturedAt: "2026-09-04T12:00:00.000Z",
      accounts: [
        {
          ...baseAccount,
          name: "國泰世華銀行",
          institution: "國泰",
          accountType: "bank",
        },
      ],
      loans: [
        {
          accountName: "國泰世華銀行",
          name: "國泰房貸",
          institution: "國泰",
          loanType: "mortgage",
          currency: "TWD",
          originalPrincipal: "500000",
          outstandingPrincipal: "300000",
          annualInterestRate: "2.1",
          rateType: "floating",
          monthlyPayment: "38000",
          paymentDayOfMonth: 21,
          nextPaymentDate: "2026-10-05",
        },
      ],
    });
    loanSnapshotId = snapshot.id;

    expect(snapshot).toMatchObject({
      totalAssetValueTwd: "550000",
      totalLiabilitiesTwd: "300000",
      netWorthTwd: "250000",
    });
    expect(snapshot.loans[0]).toMatchObject({
      accountId: snapshot.accounts[0].accountId,
      accountName: "國泰世華銀行",
      name: "國泰房貸",
      outstandingPrincipal: "300000",
      paymentDayOfMonth: 21,
      valueTwd: "300000",
    });
    expect(snapshot.accounts[0].loans).toMatchObject([
      {
        accountName: "國泰世華銀行",
        name: "國泰房貸",
        outstandingPrincipal: "300000",
      },
    ]);

    const proposal = await buildProposal("國泰房貸剩餘本金280000", {
      unsupportedReason: null,
      accountUpdates: [],
      positionUpdates: [],
      loanUpdates: [
        {
          name: "國泰房貸",
          institution: "國泰世華銀行",
          loanType: "mortgage",
          currency: "TWD",
          outstandingPrincipal: "280000",
        },
      ],
      sales: [],
      warnings: [],
    });
    expect(proposal.accounts).toMatchObject([
      { name: "國泰世華銀行", accountType: "bank" },
    ]);
    expect(proposal.loans).toMatchObject([
      {
        accountName: "國泰世華銀行",
        name: "國泰房貸",
        outstandingPrincipal: "280000",
      },
    ]);
  });

  it("以資金流拆分外部投入與市場變動", async () => {
    const previous = (await getLatestSnapshot())!;
    const snapshot = await createSnapshot({
      rawInput: "投入資金",
      baseSnapshotId: previous.id,
      accounts: previous.accounts.map((account) => ({
        ...account,
        cashBalances: account.cashBalances.map((balance) =>
          balance.currency === "TWD"
            ? { ...balance, amount: String(Number(balance.amount) + 10000) }
            : balance,
        ),
      })),
      loans: previous.loans,
      cashFlows: [
        {
          flowType: "capital_contribution",
          amountTwd: "10000",
          note: "本月投入",
        },
      ],
    });

    expect(snapshot.cashFlows).toMatchObject([
      { flowType: "capital_contribution", amountTwd: "10000" },
    ]);
    expect(snapshot.changeBreakdown).toMatchObject({
      netWorthChangeTwd: "10000",
      capitalContributionTwd: "10000",
      marketAndFxTwd: "0",
    });
  });

  it("JSON 備份包含賣出與資金流紀錄但不含行情快取", async () => {
    const backup = await exportBackup();
    expect(backup.data.position_sales).toHaveLength(1);
    expect(backup.data.loans).toHaveLength(1);
    expect(backup.data.snapshot_loans.length).toBeGreaterThan(0);
    expect(backup.data.snapshot_cash_flows.length).toBeGreaterThan(0);
    expect(backup.data).not.toHaveProperty("quote_cache");
  });

  it("同一天的財務走勢只保留最後一筆快照", async () => {
    await createSnapshot({
      rawInput: "上午更新",
      capturedAt: "2026-09-05T01:00:00.000Z",
      accounts: [baseAccount],
    });
    await createSnapshot({
      rawInput: "下午更新",
      capturedAt: "2026-09-05T09:00:00.000Z",
      accounts: [
        {
          ...baseAccount,
          cashBalances: [{ currency: "TWD", amount: "120000" }],
        },
      ],
    });

    const dashboard = await getDashboard("all");
    const sameDay = dashboard.trend.filter(
      (item) => item.capturedAt.slice(0, 10) === "2026-09-05",
    );
    expect(sameDay).toEqual([
      {
        capturedAt: "2026-09-05T09:00:00.000Z",
        totalAssetValueTwd: "570000",
      },
    ]);
    expect(dashboard.history[0].rawInput).toBe("下午更新");
  });

  it("帳戶現金餘額固定將 TWD 排在第一筆", async () => {
    const snapshot = await createSnapshot({
      rawInput: "測試多幣別排序",
      capturedAt: "2026-09-06T08:00:00.000Z",
      accounts: [
        {
          name: "多幣別帳戶",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [
            {
              currency: "JPY",
              amount: "10000",
              fxRate: {
                baseCurrency: "JPY",
                quoteCurrency: "TWD",
                rate: "0.21",
                rateAsOf: "2026-09-06T00:00:00.000Z",
                source: "MANUAL",
                status: "manual",
                overriddenByUser: true,
              },
            },
            { currency: "TWD", amount: "30000" },
          ],
          positions: [],
        },
      ],
    });
    expect(
      snapshot.accounts[0].cashBalances.map((item) => item.currency),
    ).toEqual(["TWD", "JPY"]);
  });

  it("期貨只計算損益，不把契約名目價值加進總資產", async () => {
    const snapshot = await createSnapshot({
      rawInput: "元大期貨帳戶權益30萬，小型臺指期2026/09多單2口均價22150",
      capturedAt: "2026-09-07T08:00:00.000Z",
      accounts: [
        {
          name: "元大期貨帳戶",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "300000" }],
          positions: [
            {
              market: "FUTURES",
              symbol: "MTX202609",
              name: "小型臺指期 2026/09",
              securityType: "future",
              positionSide: "long",
              contractMultiplier: "50",
              contractExpiry: "202609",
              quoteCurrency: "TWD",
              quantity: "2",
              averageCost: "22150",
              marketPrice: "22320",
              quoteAsOf: "2026-09-07T00:00:00.000Z",
              quoteSource: "MANUAL",
              quoteStatus: "fresh",
            },
          ],
        },
      ],
    });

    expect(snapshot).toMatchObject({
      totalCashTwd: "300000",
      totalSecuritiesTwd: "0",
      totalAssetValueTwd: "300000",
      unrealizedPnlTwd: "17000",
    });
    expect(snapshot.accounts[0].positions[0]).toMatchObject({
      positionSide: "long",
      contractMultiplier: "50",
      contractExpiry: "202609",
      marketValueTwd: "0",
      unrealizedPnlTwd: "17000",
      unrealizedReturnPct: "0.767494",
    });
  });

  it("Firstrade 名稱別名會沿用同一個帳戶識別", async () => {
    const first = await createSnapshot({
      rawInput: "Firstrade 帳戶",
      capturedAt: "2026-09-08T08:00:00.000Z",
      accounts: [
        {
          name: "Firstrade",
          institution: "Firstrade",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    });
    const second = await createSnapshot({
      rawInput: "FIRSTRADE證券 帳戶",
      baseSnapshotId: first.id,
      capturedAt: "2026-09-09T08:00:00.000Z",
      accounts: [
        {
          name: "FIRSTRADE證券",
          institution: "FIRSTRADE證券",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    });

    expect(second.accounts[0]).toMatchObject({
      accountId: first.accounts[0].accountId,
      name: "Firstrade",
      institution: "Firstrade",
    });
  });

  it("同機構的新帳戶未提供識別碼時拒絕猜測", async () => {
    await expect(
      createSnapshot({
        rawInput: "Firstrade IRA",
        capturedAt: "2026-09-10T08:00:00.000Z",
        accounts: [
          {
            name: "Firstrade IRA",
            institution: "Firstrade",
            accountType: "brokerage",
            defaultCurrency: "TWD",
            cashBalances: [{ currency: "TWD", amount: "0" }],
            positions: [],
          },
        ],
      }),
    ).rejects.toThrow("請使用既有帳戶名稱，或為不同帳戶填寫帳戶識別碼");
  });

  it("帳戶識別碼可區分同機構帳戶並辨識格式差異", async () => {
    const first = await createSnapshot({
      rawInput: "Firstrade IRA",
      capturedAt: "2026-09-11T08:00:00.000Z",
      accounts: [
        {
          name: "Firstrade IRA",
          institution: "Firstrade",
          accountReference: "IRA-1234",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    });
    const second = await createSnapshot({
      rawInput: "Firstrade retirement",
      baseSnapshotId: first.id,
      capturedAt: "2026-09-12T08:00:00.000Z",
      accounts: [
        {
          name: "Firstrade retirement",
          institution: "Firstrade",
          accountReference: "ira1234",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    });

    expect(second.accounts[0].accountId).toBe(first.accounts[0].accountId);
  });

  it("同一快照出現重複帳戶時在計算前阻止儲存", async () => {
    const duplicate = {
      name: "Firstrade",
      institution: "Firstrade",
      accountType: "brokerage" as const,
      defaultCurrency: "TWD",
      cashBalances: [{ currency: "TWD", amount: "0" }],
      positions: [],
    };
    await expect(
      createSnapshot({
        rawInput: "重複帳戶",
        capturedAt: "2026-09-13T08:00:00.000Z",
        accounts: [duplicate, { ...duplicate, name: "FIRSTRADE證券" }],
      }),
    ).rejects.toThrow("避免資產重複計算");
  });

  it("不同機構即使帳戶名稱相同也不會誤合併", async () => {
    const first = await createSnapshot({
      rawInput: "甲券商投資帳戶",
      capturedAt: "2026-09-14T08:00:00.000Z",
      accounts: [
        {
          name: "投資帳戶",
          institution: "甲券商",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    });
    const second = await createSnapshot({
      rawInput: "乙券商投資帳戶",
      capturedAt: "2026-09-15T08:00:00.000Z",
      accounts: [
        {
          name: "投資帳戶",
          institution: "乙券商",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    });

    expect(second.accounts[0].accountId).not.toBe(first.accounts[0].accountId);
  });

  it("提供單一帳戶淨值與跨帳戶標的走勢，並在不再持有後回到零", async () => {
    const position = {
      market: "TWSE" as const,
      symbol: "006208",
      name: "富邦台50",
      securityType: "etf" as const,
      quoteCurrency: "TWD",
      averageCost: "80",
      marketPrice: "100",
      quoteAsOf: "2026-09-16T00:00:00.000Z",
      quoteSource: "TWSE" as const,
      quoteStatus: "fresh" as const,
    };
    const first = await createSnapshot({
      rawInput: "建立帳戶與標的走勢",
      capturedAt: "2026-09-16T08:00:00.000Z",
      accounts: [
        {
          name: "走勢帳戶 A",
          institution: "甲銀行",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "100" }],
          positions: [{ ...position, quantity: "10" }],
        },
        {
          name: "走勢帳戶 B",
          institution: "乙銀行",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "200" }],
          positions: [{ ...position, quantity: "5", averageCost: "90" }],
        },
      ],
      loans: [
        {
          accountName: "走勢帳戶 A",
          name: "測試負債",
          institution: "甲銀行",
          loanType: "other",
          currency: "TWD",
          outstandingPrincipal: "50",
        },
      ],
    });
    const [accountA, accountB] = first.accounts;
    const securityId = accountA.positions[0].securityId!;
    const second = await createSnapshot({
      rawInput: "更新帳戶與標的走勢",
      baseSnapshotId: first.id,
      capturedAt: "2026-09-17T08:00:00.000Z",
      accounts: [
        {
          ...accountA,
          cashBalances: [{ currency: "TWD", amount: "150" }],
          positions: [
            {
              ...accountA.positions[0],
              marketPrice: "110",
              quoteAsOf: "2026-09-17T00:00:00.000Z",
            },
          ],
        },
        {
          ...accountB,
          positions: [
            {
              ...accountB.positions[0],
              marketPrice: "110",
              quoteAsOf: "2026-09-17T00:00:00.000Z",
            },
          ],
        },
      ],
      loans: [
        {
          ...first.loans[0],
          outstandingPrincipal: "40",
        },
      ],
    });
    await createSnapshot({
      rawInput: "標的不再持有",
      baseSnapshotId: second.id,
      capturedAt: "2026-09-18T08:00:00.000Z",
      accounts: second.accounts.map((account) => ({
        ...account,
        positions: [],
      })),
      loans: second.loans,
    });

    expect(
      (await getAccountTrend(accountA.accountId, "all")).slice(-3, -1),
    ).toEqual([
      {
        capturedAt: "2026-09-16T08:00:00.000Z",
        cashValueTwd: "100",
        securityValueTwd: "1000",
        liabilityValueTwd: "50",
        totalAssetValueTwd: "1100",
        netValueTwd: "1050",
      },
      {
        capturedAt: "2026-09-17T08:00:00.000Z",
        cashValueTwd: "150",
        securityValueTwd: "1100",
        liabilityValueTwd: "40",
        totalAssetValueTwd: "1250",
        netValueTwd: "1210",
      },
    ]);
    expect(await getSecurityTrend(securityId, "all")).toEqual([
      {
        capturedAt: "2026-09-16T08:00:00.000Z",
        quantity: "15",
        marketValueTwd: "1500",
        costValueTwd: "1250",
      },
      {
        capturedAt: "2026-09-17T08:00:00.000Z",
        quantity: "15",
        marketValueTwd: "1650",
        costValueTwd: "1250",
      },
      {
        capturedAt: "2026-09-18T08:00:00.000Z",
        quantity: "0",
        marketValueTwd: "0",
        costValueTwd: "0",
      },
    ]);
  });

  it("信用卡以共用額度計算使用比例、分期負債與溢繳資產", async () => {
    const first = await createSnapshot({
      rawInput: "建立信用卡帳單快照",
      capturedAt: "2026-09-20T08:00:00.000Z",
      accounts: [
        {
          name: "測試現金",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "100000" }],
          positions: [],
        },
      ],
      creditCardAccounts: [
        {
          name: "國泰世華信用卡",
          issuer: "國泰世華",
          currency: "TWD",
          sharedCreditLimit: "200000",
          statementDayOfMonth: 3,
          paymentDayOfMonth: 18,
          status: "active",
          cards: [
            {
              name: "CUBE 卡",
              lastFour: "1234",
              network: "visa",
              holderType: "primary",
              status: "active",
            },
            {
              name: "蝦皮卡",
              lastFour: "5678",
              network: "mastercard",
              holderType: "primary",
              status: "active",
            },
          ],
          statementPeriod: "2026-08",
          statementDate: "2026-09-03",
          dueDate: "2026-09-18",
          statementAmount: "30000",
          paymentAmount: "30000",
          paymentDate: "2026-09-17",
          remainingInstallmentPrincipal: "20000",
          overpaymentBalance: "0",
        },
      ],
    });

    expect(first).toMatchObject({
      totalAssetValueTwd: "100000",
      totalLiabilitiesTwd: "20000",
      totalCreditCardLiabilitiesTwd: "20000",
      totalCreditCardCreditsTwd: "0",
      netWorthTwd: "80000",
    });
    expect(first.creditCardAccounts[0]).toMatchObject({
      paymentStatus: "paid",
      statementOutstanding: "0",
      utilizationPct: "15",
      liabilityValueTwd: "20000",
      cards: [{ lastFour: "1234" }, { lastFour: "5678" }],
    });

    const preserved = await createSnapshot({
      rawInput: "只更新現金，信用卡自動承接",
      baseSnapshotId: first.id,
      capturedAt: "2026-09-21T08:00:00.000Z",
      accounts: [
        {
          ...first.accounts[0],
          cashBalances: [{ currency: "TWD", amount: "90000" }],
        },
      ],
    });
    expect(preserved.creditCardAccounts[0]).toMatchObject({
      creditCardAccountId: first.creditCardAccounts[0].creditCardAccountId,
      liabilityValueTwd: "20000",
    });

    const overpaid = await createSnapshot({
      rawInput: "更新信用卡溢繳狀態",
      baseSnapshotId: preserved.id,
      capturedAt: "2026-09-22T08:00:00.000Z",
      accounts: preserved.accounts,
      creditCardAccounts: [
        {
          ...preserved.creditCardAccounts[0],
          statementPeriod: "2026-09",
          statementDate: "2026-09-20",
          dueDate: "2026-10-05",
          statementAmount: "10000",
          paymentAmount: "15000",
          paymentDate: "2026-09-21",
          remainingInstallmentPrincipal: "0",
          overpaymentBalance: "5000",
        },
      ],
    });
    expect(overpaid).toMatchObject({
      totalCashTwd: "90000",
      totalCreditCardLiabilitiesTwd: "0",
      totalCreditCardCreditsTwd: "5000",
      totalAssetValueTwd: "95000",
      totalLiabilitiesTwd: "0",
      netWorthTwd: "95000",
    });
    expect(overpaid.creditCardAccounts[0].paymentStatus).toBe("overpaid");
    expect((await getCreditCardTrend("all")).slice(-2)).toEqual([
      {
        capturedAt: "2026-08-01T00:00:00.000Z",
        statementPeriod: "2026-08",
        totalDueTwd: "30000",
        paymentAmountTwd: "30000",
      },
      {
        capturedAt: "2026-09-01T00:00:00.000Z",
        statementPeriod: "2026-09",
        totalDueTwd: "10000",
        paymentAmountTwd: "15000",
      },
    ]);

    await createSnapshot({
      rawInput: "更新信用卡帳戶設定",
      baseSnapshotId: overpaid.id,
      capturedAt: "2026-09-23T08:00:00.000Z",
      accounts: overpaid.accounts,
      creditCardAccounts: [
        {
          ...overpaid.creditCardAccounts[0],
          statementPeriod: "2026-10",
          dueDate: "2026-10-18",
        },
      ],
    });
    expect(
      (await getCreditCardTrend("all")).some(
        (item) => item.statementPeriod === "2026-10",
      ),
    ).toBe(false);
  });

  it("備份可在新資料庫還原貸款與淨值", async () => {
    const backup = await exportBackup();
    closeDatabaseForTests();
    process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "imported.db");
    const result = await importBackup(backup);
    const restored = await getSnapshotDetail(loanSnapshotId);
    expect(result.imported).toBeGreaterThan(0);
    expect(restored).toMatchObject({
      totalLiabilitiesTwd: "300000",
      netWorthTwd: "250000",
    });
    expect(restored?.loans[0]).toMatchObject({
      name: "國泰房貸",
      outstandingPrincipal: "300000",
      paymentDayOfMonth: 21,
    });
    expect(backup.data.credit_card_accounts).toHaveLength(1);
    expect(backup.data.credit_cards).toHaveLength(2);
    expect(backup.data.snapshot_credit_card_accounts.length).toBeGreaterThan(0);
  });
});
