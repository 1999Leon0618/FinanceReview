export type PositionQuoteWarnings = Record<string, string[]>;

export function replacePositionQuoteWarnings(
  current: PositionQuoteWarnings,
  positionKey: string,
  warnings: string[],
) {
  const next = { ...current };
  const uniqueWarnings = [...new Set(warnings)];
  if (uniqueWarnings.length > 0) next[positionKey] = uniqueWarnings;
  else delete next[positionKey];
  return next;
}

export function mergePositionQuoteWarnings(
  warnings: string[],
  positionWarnings: PositionQuoteWarnings,
) {
  return [...new Set([...warnings, ...Object.values(positionWarnings).flat()])];
}
