import { z } from "zod";

const identifier = z.string().min(1).max(100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().datetime({ offset: true });
const marketScope = z.enum(["TW", "US"]);
const noteType = z.enum(["premarket", "intraday", "postmarket"]);
const tone = z.enum(["neutral", "positive", "negative"]).optional();

const metricGridBlock = z.object({
  id: identifier,
  type: z.literal("metric-grid"),
  items: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(80),
        detail: z.string().trim().max(200).optional(),
        tone,
      }),
    )
    .min(1)
    .max(6),
});

const calloutBlock = z.object({
  id: identifier,
  type: z.literal("callout"),
  label: z.string().trim().min(1).max(40),
  markdown: z.string().max(4_000),
  tone,
});

const markdownBlock = z.object({
  id: identifier,
  type: z.literal("markdown"),
  markdown: z.string().max(100_000),
});

const watchstockBlock = z.object({
  id: identifier,
  type: z.literal("watchstock"),
  watchlistItemId: identifier,
  view: z.enum(["card", "kline"]).optional(),
  noRelevantContent: z.boolean().optional(),
});

export const researchDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        metricGridBlock,
        calloutBlock,
        markdownBlock,
        watchstockBlock,
      ]),
    )
    .max(100),
});

export const researchSourceInputSchema = z.object({
  id: identifier.optional(),
  blockId: identifier.nullable().optional(),
  watchlistItemId: identifier.nullable().optional(),
  title: z.string().trim().min(1).max(300),
  publisher: z.string().trim().min(1).max(120),
  url: z.url().refine((value) => /^https?:\/\//i.test(value), {
    message: "來源網址必須使用 http 或 https",
  }),
  publishedAt: isoDateTime,
  accessedAt: isoDateTime.optional(),
});

export const researchNoteInputSchema = z
  .object({
    marketScope,
    noteType,
    reportDate: isoDate,
    tradingDate: isoDate,
    asOf: isoDateTime,
    title: z.string().trim().min(1).max(200),
    subtitle: z.string().trim().max(500).nullable().optional(),
    summary: z.string().trim().max(2_000).nullable().optional(),
    noRelevantContent: z.boolean().default(false),
    document: researchDocumentSchema,
    sources: z.array(researchSourceInputSchema).max(100).default([]),
    expectedRevision: z.number().int().positive().optional(),
  })
  .superRefine((note, context) => {
    const asOf = Date.parse(note.asOf);
    const lower =
      Date.parse(`${note.reportDate}T00:00:00.000Z`) - 2 * 86_400_000;
    const upper = Date.parse(`${note.reportDate}T23:59:59.999Z`);
    for (const [index, source] of note.sources.entries()) {
      const published = Date.parse(source.publishedAt);
      const eventDay = new Intl.DateTimeFormat("en-CA", {
        timeZone:
          note.marketScope === "US" ? "America/New_York" : "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(published));
      const invalidRange =
        note.noteType === "intraday"
          ? eventDay !== note.tradingDate
          : published < lower || published > upper;
      if (invalidRange)
        context.addIssue({
          code: "custom",
          path: ["sources", index, "publishedAt"],
          message:
            note.noteType === "intraday"
              ? "盤中快報只能採用交易當日來源"
              : "盤前與盤後來源必須介於報告日期前兩日至當日",
        });
      if (published > asOf)
        context.addIssue({
          code: "custom",
          path: ["sources", index, "publishedAt"],
          message: "來源發布時間不得晚於資料截止時間",
        });
    }
  });

export const researchNoteUpdateSchema = researchNoteInputSchema;

export const watchlistCreateSchema = z.object({
  market: z.enum(["TWSE", "TPEX", "US"]),
  symbol: z.string().trim().min(1).max(30),
  providerSymbol: z.string().trim().max(50).optional(),
  origin: z.enum(["manual", "report"]).default("manual"),
  enabled: z.boolean().optional(),
});

export const watchlistUpdateSchema = z.object({ enabled: z.boolean() });

export const candleQuerySchema = z.object({
  range: z.coerce
    .number()
    .pipe(z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]))
    .default(3),
});

export const researchTodoInputSchema = z.object({
  marketScope,
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().max(2_000).nullable().optional(),
  scheduledFor: isoDateTime.nullable().optional(),
  requiresNote: z.boolean().default(true),
  watchlistItemIds: z.array(identifier).max(30).default([]),
});

export const researchTodoUpdateSchema = z
  .object({
    status: z.enum(["open", "completed"]).optional(),
    noteId: identifier.nullable().optional(),
    failureReason: z.string().trim().max(1_000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "沒有可更新的欄位");

export type ResearchNoteInput = z.infer<typeof researchNoteInputSchema>;
export type ResearchTodoInput = z.infer<typeof researchTodoInputSchema>;
