export type NumericKind = "decimal" | "integer";

/** Return null for a rejected edit; incomplete decimal edits remain editable. */
export function normalizeNumericInput(
  raw: string,
  kind: NumericKind = "decimal",
): string | null {
  const normalized = raw
    .replace(/[０-９]/g, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0xfee0),
    )
    .replace(/．/g, ".")
    .trim();
  if (normalized === "") return "";
  const grouped =
    kind === "integer"
      ? /^(?:\d{1,3}(?:,\d{3})+|\d+)$/
      : /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?$/;
  if (!grouped.test(normalized)) return null;
  return normalized.replaceAll(",", "");
}

export function isCompleteNumericInput(value: string): boolean {
  return /^\d+(?:\.\d+)?$/.test(value);
}
