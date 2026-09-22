import { describe, expect, it } from "vitest";
import {
  capturedAfterLatest,
  parseTaipeiDateTimeInput,
  taipeiDateTimeInput,
} from "@/lib/snapshot-datetime";

describe("快照資料基準時間", () => {
  it("台灣時間與 UTC 正確往返", () => {
    expect(parseTaipeiDateTimeInput("2026-09-18T12:30")).toBe(
      "2026-09-18T04:30:00.000Z",
    );
    expect(taipeiDateTimeInput(new Date("2026-09-18T04:30:00Z"))).toBe(
      "2026-09-18T12:30",
    );
  });

  it("拒絕無效日期及早於現有最新快照的補登", () => {
    expect(parseTaipeiDateTimeInput("2026-02-31T12:00")).toBeNull();
    expect(
      capturedAfterLatest("2026-09-18T04:30:00Z", "2026-09-19T00:00:00Z"),
    ).toBe(false);
  });
});
