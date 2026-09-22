import type { PositionInput } from "@/lib/types";

export function wasPositionQuoteEdited(
  current: PositionInput,
  requested: PositionInput,
) {
  return (
    current.marketPrice !== requested.marketPrice ||
    current.quoteAsOf !== requested.quoteAsOf ||
    (current.quoteNote === "使用人工價格" &&
      requested.quoteNote !== "使用人工價格")
  );
}

export function mergeResolvedPositionQuote(
  current: PositionInput,
  requested: PositionInput,
  resolved: PositionInput,
): PositionInput {
  // A manually edited price takes precedence over an older network response.
  if (wasPositionQuoteEdited(current, requested)) return current;

  return {
    ...current,
    name: current.name.trim() ? current.name : resolved.name,
    marketPrice: resolved.marketPrice,
    quoteCurrency: resolved.quoteCurrency,
    quoteAsOf: resolved.quoteAsOf,
    quoteSource: resolved.quoteSource,
    quoteStatus: resolved.quoteStatus,
    quoteNote: resolved.quoteNote,
    fxRate: resolved.fxRate,
  };
}
