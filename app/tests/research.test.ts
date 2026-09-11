import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDatabaseForTests } from "@/lib/db";
import { dataOwnerFromEmail, runWithDataOwner } from "@/lib/data-owner";
import { createSnapshot, exportBackup, importBackup } from "@/lib/repository";
import {
  createResearchNote,
  createResearchTodo,
  listResearchNotes,
  listResearchTodos,
  listWatchlist,
  setWatchlistEnabled,
  updateResearchNote,
  updateResearchTodo,
} from "@/lib/research-repository";
import { createResearchTemplate } from "@/lib/research-templates";
import { researchNoteInputSchema } from "@/lib/research-validation";

const temp = mkdtempSync(path.join(tmpdir(), "finance-review-research-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "research.db");

const ownerA = dataOwnerFromEmail("research-a@example.com");
const ownerB = dataOwnerFromEmail("research-b@example.com");

const position = {
  market: "TWSE" as const,
  symbol: "0050",
  providerSymbol: "0050.TW",
  name: "元大台灣50",
  securityType: "etf" as const,
  quoteCurrency: "TWD",
  quantity: "1000",
  averageCost: "150",
  marketPrice: "180",
  quoteAsOf: "2026-09-11T05:30:00.000Z",
  quoteSource: "TWSE" as const,
  quoteStatus: "fresh" as const,
};

const reportInput = () => ({
  marketScope: "TW" as const,
  noteType: "postmarket" as const,
  reportDate: "2026-09-11",
  tradingDate: "2026-09-11",
  asOf: "2026-09-11T06:40:00.000Z",
  title: "2026-09-11 台股盤後研究",
  subtitle: "測試報告",
  summary: "市場量縮整理。",
  noRelevantContent: false,
  document: createResearchTemplate("TW", "postmarket"),
  sources: [
    {
      title: "台股收盤資訊",
      publisher: "測試媒體",
      url: "https://example.com/market-close",
      publishedAt: "2026-09-11T06:00:00.000Z",
      accessedAt: "2026-09-11T06:30:00.000Z",
    },
  ],
});

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T07:00:00.000Z"));
  closeDatabaseForTests();
});

afterAll(() => {
  closeDatabaseForTests();
  vi.useRealTimers();
  rmSync(temp, { recursive: true, force: true });
});

describe("投資研究工作區", () => {
  it("首次同步持倉且尊重停用狀態", async () => {
    await runWithDataOwner(ownerA, async () => {
      const first = await createSnapshot({
        rawInput: "建立持倉",
        capturedAt: "2026-09-11T05:00:00.000Z",
        accounts: [
          {
            name: "研究券商",
            accountType: "brokerage",
            defaultCurrency: "TWD",
            cashBalances: [],
            positions: [position],
          },
        ],
      });
      const [item] = await listWatchlist();
      expect(item).toMatchObject({ symbol: "0050", held: true, enabled: true });
      expect(item.quote.price).toBe("180");
      await setWatchlistEnabled(item.id, false);

      await createSnapshot({
        rawInput: "更新持倉",
        baseSnapshotId: first.id,
        capturedAt: "2026-09-11T05:10:00.000Z",
        accounts: first.accounts.map((account) => ({
          accountId: account.accountId,
          name: account.name,
          accountType: account.accountType,
          defaultCurrency: account.defaultCurrency,
          cashBalances: account.cashBalances,
          positions: account.positions,
        })),
      });
      expect((await listWatchlist())[0].enabled).toBe(false);
    });
  });

  it("保存報告修訂、來源與待辦完成條件", async () => {
    await runWithDataOwner(ownerA, async () => {
      const note = await createResearchNote(reportInput());
      expect(note.revision).toBe(1);
      expect(note.sources).toHaveLength(1);

      const updated = await updateResearchNote(note.id, {
        ...reportInput(),
        expectedRevision: 1,
        summary: "更新後的研究判讀。",
        sources: note.sources.map((source) => ({
          id: source.id,
          blockId: source.blockId,
          watchlistItemId: source.watchlistItemId,
          title: source.title,
          publisher: source.publisher,
          url: source.url,
          publishedAt: source.publishedAt,
        })),
      });
      expect(updated).toMatchObject({
        revision: 2,
        summary: "更新後的研究判讀。",
      });
      expect(updated.sources[0].id).not.toBe(note.sources[0].id);

      const todo = await createResearchTodo({
        marketScope: "TW",
        title: "追蹤大盤異常",
        requiresNote: true,
        watchlistItemIds: [],
      });
      await expect(
        updateResearchTodo(todo.id, { status: "completed" }),
      ).rejects.toThrow("必須先關聯");
      const completed = await updateResearchTodo(todo.id, {
        noteId: updated.id,
        status: "completed",
      });
      expect(completed.status).toBe("completed");
    });
  });

  it("隔離使用者並完整備份研究資料", async () => {
    const backup = await runWithDataOwner(ownerA, () => exportBackup());
    expect(backup.schemaVersion).toBe(3);
    expect(backup.data.watchlist_items).toHaveLength(1);
    expect(backup.data.research_notes).toHaveLength(1);
    expect(backup.data.research_note_revisions).toHaveLength(2);
    expect(backup.data.research_todos).toHaveLength(1);

    await runWithDataOwner(ownerB, async () => {
      expect(await listResearchNotes()).toHaveLength(0);
      expect(await listResearchTodos()).toHaveLength(0);
    });

    closeDatabaseForTests();
    process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "restored.db");
    await runWithDataOwner(ownerB, async () => {
      await importBackup(backup);
      expect(await listResearchNotes()).toHaveLength(1);
      expect(await listResearchTodos()).toHaveLength(1);
      expect(await listWatchlist()).toHaveLength(1);
    });
  });
});

describe("研究來源時效紀律", () => {
  it("拒絕盤前盤後超過兩天或晚於截止時間的來源", () => {
    expect(() =>
      researchNoteInputSchema.parse({
        ...reportInput(),
        sources: [
          {
            title: "舊聞",
            publisher: "測試媒體",
            url: "https://example.com/old",
            publishedAt: "2026-09-08T06:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      researchNoteInputSchema.parse({
        ...reportInput(),
        sources: [
          {
            title: "尚未發布",
            publisher: "測試媒體",
            url: "https://example.com/future",
            publishedAt: "2026-09-11T07:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
  });

  it("盤中快報只接受交易當日來源", () => {
    expect(() =>
      researchNoteInputSchema.parse({
        ...reportInput(),
        noteType: "intraday",
        sources: [
          {
            title: "昨日消息",
            publisher: "測試媒體",
            url: "https://example.com/yesterday",
            publishedAt: "2026-09-10T06:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
  });
});
