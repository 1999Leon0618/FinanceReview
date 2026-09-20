import { describe, expect, it } from "vitest";
import {
  defaultDisplayPreferences,
  formatDisplayDate,
  formatDisplayDateTime,
  parseDisplayPreferences,
} from "../lib/display-preferences";

describe("日期與時間顯示偏好", () => {
  it("讀取有效偏好並安全回復無效欄位", () => {
    expect(
      parseDisplayPreferences(JSON.stringify({ timeZone: "America/New_York" })),
    ).toEqual({ timeZone: "America/New_York" });

    expect(
      parseDisplayPreferences(JSON.stringify({ timeZone: "Mars/Olympus" })),
    ).toEqual(defaultDisplayPreferences);

    for (const value of [null, "{", "null", "[]", "123"]) {
      expect(parseDisplayPreferences(value)).toEqual(defaultDisplayPreferences);
    }
  });

  it("依設定的時區格式化同一時間點", () => {
    const instant = new Date("2026-09-20T00:30:00.000Z");

    expect(
      formatDisplayDate(instant, {
        timeZone: "Asia/Taipei",
      }),
    ).toContain("2026年9月20日");
    expect(
      formatDisplayDateTime(instant, {
        timeZone: "America/New_York",
      }),
    ).toMatch(/2026.*9.*19.*晚上8:30/);
  });
});
