export const displayPreferenceStorageKey =
  "finance-review-display-preferences-v1";

export const displayLocales = {
  "zh-TW": "繁體中文（臺灣）",
  "en-US": "English (United States)",
  "ja-JP": "日本語（日本）",
} as const;

export const displayTimeZones = {
  "Asia/Taipei": "臺北（Asia/Taipei）",
  "Asia/Tokyo": "東京（Asia/Tokyo）",
  "Asia/Shanghai": "上海（Asia/Shanghai）",
  "Asia/Singapore": "新加坡（Asia/Singapore）",
  "Europe/London": "倫敦（Europe/London）",
  "America/New_York": "紐約（America/New_York）",
  UTC: "世界協調時間（UTC）",
} as const;

export type DisplayLocale = keyof typeof displayLocales;
export type DisplayTimeZone = keyof typeof displayTimeZones;

export interface DisplayPreferences {
  locale: DisplayLocale;
  timeZone: DisplayTimeZone;
}

export const defaultDisplayPreferences: DisplayPreferences = {
  locale: "zh-TW",
  timeZone: "Asia/Taipei",
};

const isDisplayLocale = (value: unknown): value is DisplayLocale =>
  typeof value === "string" && Object.hasOwn(displayLocales, value);

const isDisplayTimeZone = (value: unknown): value is DisplayTimeZone =>
  typeof value === "string" && Object.hasOwn(displayTimeZones, value);

export function parseDisplayPreferences(
  value: string | null,
): DisplayPreferences {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return defaultDisplayPreferences;
    const candidate = parsed as Record<string, unknown>;
    return {
      locale: isDisplayLocale(candidate.locale)
        ? candidate.locale
        : defaultDisplayPreferences.locale,
      timeZone: isDisplayTimeZone(candidate.timeZone)
        ? candidate.timeZone
        : defaultDisplayPreferences.timeZone,
    };
  } catch {
    return defaultDisplayPreferences;
  }
}

export function formatDisplayDate(
  value: Date,
  preferences: DisplayPreferences,
) {
  return new Intl.DateTimeFormat(preferences.locale, {
    dateStyle: "full",
    timeZone: preferences.timeZone,
  }).format(value);
}

export function formatDisplayDateTime(
  value: Date,
  preferences: DisplayPreferences,
) {
  return new Intl.DateTimeFormat(preferences.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: preferences.timeZone,
  }).format(value);
}

export function lastUpdatedLabel(locale: DisplayLocale) {
  if (locale === "en-US") return "Last updated";
  if (locale === "ja-JP") return "最終更新";
  return "最後更新";
}
