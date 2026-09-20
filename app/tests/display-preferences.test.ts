import { describe, expect, it } from "vitest";
import {
  defaultDisplayPreferences,
  formatDisplayDate,
  formatDisplayDateTime,
  lastUpdatedLabel,
  parseDisplayPreferences,
} from "../lib/display-preferences";

describe("日期與時間顯示偏好", () => {
  it("讀取有效偏好並安全回復無效欄位", () => {
    expect(
      parseDisplayPreferences(
        JSON.stringify({ locale: "en-US", timeZone: "America/New_York" }),
      ),
    ).toEqual({ locale: "en-US", timeZone: "America/New_York" });

    expect(
      parseDisplayPreferences(
        JSON.stringify({ locale: "unknown", timeZone: "Mars/Olympus" }),
      ),
    ).toEqual(defaultDisplayPreferences);

    for (const value of [null, "{", "null", "[]", "123"]) {
      expect(parseDisplayPreferences(value)).toEqual(defaultDisplayPreferences);
    }
  });

  it("依設定的語言與時區格式化同一時間點", () => {
    const instant = new Date("2026-09-20T00:30:00.000Z");

    expect(
      formatDisplayDate(instant, {
        locale: "zh-TW",
        timeZone: "Asia/Taipei",
      }),
    ).toContain("2026年9月20日");
    expect(
      formatDisplayDateTime(instant, {
        locale: "en-US",
        timeZone: "America/New_York",
      }),
    ).toMatch(/Sep 19, 2026.*8:30 PM/);
    expect(lastUpdatedLabel("en-US")).toBe("Last updated");
    expect(lastUpdatedLabel("ja-JP")).toBe("最終更新");
  });
});
