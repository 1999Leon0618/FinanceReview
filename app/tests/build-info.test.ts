import { describe, expect, it } from "vitest";
import { formatBuildTitle, formatBuildVersion } from "@/lib/build-info";

describe("建置版本資訊", () => {
  it("顯示正式環境、套件版本與七碼 commit", () => {
    expect(
      formatBuildVersion({
        version: "0.1.0",
        commit: "1989950abcdef",
        builtAt: "2026-09-15T15:00:00.000Z",
        environment: "production",
      }),
    ).toBe("正式 · v0.1.0 · 1989950");
  });

  it("沒有 commit 時清楚標示為本機版本", () => {
    expect(
      formatBuildVersion({
        version: "0.1.0",
        commit: "local",
        builtAt: "",
        environment: "local",
      }),
    ).toBe("本機 · v0.1.0 · local");
  });

  it("無法解析建置時間時不顯示錯誤日期", () => {
    expect(
      formatBuildTitle({
        version: "0.1.0",
        commit: "local",
        builtAt: "invalid",
        environment: "local",
      }),
    ).toBe("建置時間格式無效");
  });

  it("以固定臺北時區顯示建置時間", () => {
    expect(
      formatBuildTitle({
        version: "0.1.0",
        commit: "1989950",
        builtAt: "2026-09-15T15:00:00.000Z",
        environment: "production",
      }),
    ).toBe("建置時間：2026-09-15 23:00:00（Asia/Taipei）");
  });
});
