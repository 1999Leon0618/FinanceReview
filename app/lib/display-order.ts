export const displaySections = {
  accounts: "帳戶與現金",
  holdings: "投資持倉",
  loans: "貸款與負債",
  creditCards: "信用卡群組",
} as const;

export type DisplaySection = keyof typeof displaySections;
export type DisplayOrder = Partial<Record<DisplaySection, string[]>>;
export const displayOrderStorageKey = "finance-review-display-order-v1";

export function parseDisplayOrder(value: string | null): DisplayOrder {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const result: DisplayOrder = {};
    for (const section of Object.keys(displaySections) as DisplaySection[]) {
      const ids = (parsed as Record<string, unknown>)[section];
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
        result[section] = [...new Set(ids)];
      }
    }
    return result;
  } catch {
    return {};
  }
}

// 未排序的新項目依原始順序放在最後，不改動快照資料。
export function applyDisplayOrder<T>(
  items: readonly T[],
  order: readonly string[] | undefined,
  key: (item: T) => string,
): T[] {
  const ranks = new Map(order?.map((id, index) => [id, index]));
  return [...items].sort(
    (a, b) => (ranks.get(key(a)) ?? Infinity) - (ranks.get(key(b)) ?? Infinity),
  );
}
