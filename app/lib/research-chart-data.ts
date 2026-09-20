type Evidence = Record<string, unknown>;

export type AllocationChartItem = {
  name: string;
  value: number;
};

export type HoldingChartItem = AllocationChartItem & {
  type: string;
};

export type PerformanceChartItem = AllocationChartItem & {
  kind: "portfolio" | "benchmark";
};

export type AttributionChartItem = AllocationChartItem & {
  beginningWeightPct: number;
  weeklyReturnPct: number;
};

export type LookThroughChartItem = {
  name: string;
  directPct: number;
  etfIndirectPct: number;
  leveragedAdjustmentPct: number;
  totalDailyNominalExposurePct: number;
};

export type EtfOverlapChartItem = AllocationChartItem & {
  commonHoldingsCount: number;
};

const marketLabels: Record<string, string> = {
  US: "美股",
  TWSE: "台股上市",
  TPEX: "台股上櫃",
};
const securityTypeLabels: Record<string, string> = {
  stock: "股票",
  etf: "ETF",
  fund: "基金",
};

const finiteNumber = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

export function allocationTooltipText(name: unknown, value: unknown) {
  const number = finiteNumber(value) ?? 0;
  return `${typeof name === "string" && name ? name : "未分類"}占比：${number.toFixed(3)}%`;
}

export function namedPercentTooltip(
  value: unknown,
  name: unknown,
): [string, string] {
  const number = finiteNumber(value) ?? 0;
  const source = typeof name === "string" && name ? name : "占比";
  return [`${number.toFixed(3)}%`, source];
}

function records(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

export function marketAllocationChartData(evidence: Evidence) {
  const totals = new Map<string, number>();
  for (const item of records(evidence.allocation)) {
    const market = typeof item.market === "string" ? item.market : "OTHER";
    const weight = finiteNumber(item.weightPct);
    if (weight === null || weight <= 0) continue;
    const label = marketLabels[market.toUpperCase()] ?? market.toUpperCase();
    totals.set(label, (totals.get(label) ?? 0) + weight);
  }
  return [...totals]
    .map(([name, value]) => ({ name, value: Number(value.toFixed(3)) }))
    .sort((left, right) => right.value - left.value);
}

export function securityTypeAllocationChartData(evidence: Evidence) {
  const totals = new Map<string, number>();
  for (const item of records(evidence.allocation)) {
    const type =
      typeof item.type === "string" ? item.type.toLowerCase() : "other";
    const weight = finiteNumber(item.weightPct);
    if (weight === null || weight <= 0) continue;
    const label = securityTypeLabels[type] ?? "其他";
    totals.set(label, (totals.get(label) ?? 0) + weight);
  }
  return [...totals]
    .map(([name, value]) => ({ name, value: Number(value.toFixed(3)) }))
    .sort((left, right) => right.value - left.value);
}

export function topHoldingsChartData(evidence: Evidence, limit = 10) {
  const holdings = records(evidence.allocation)
    .flatMap((item): HoldingChartItem[] => {
      const value = finiteNumber(item.weightPct);
      if (typeof item.symbol !== "string" || value === null || value <= 0)
        return [];
      return [
        {
          name: item.symbol.toUpperCase(),
          value: Number(value.toFixed(3)),
          type: typeof item.type === "string" ? item.type : "security",
        },
      ];
    })
    .sort((left, right) => right.value - left.value);
  if (holdings.length <= limit) return holdings;
  const visible = holdings.slice(0, limit);
  const other = holdings
    .slice(limit)
    .reduce((total, item) => total + item.value, 0);
  return [
    ...visible,
    { name: "其他", value: Number(other.toFixed(3)), type: "other" },
  ];
}

export function weeklyPerformanceChartData(evidence: Evidence) {
  const weeklyPerformance =
    evidence.weeklyPerformance && typeof evidence.weeklyPerformance === "object"
      ? (evidence.weeklyPerformance as Record<string, unknown>)
      : null;
  if (!weeklyPerformance) return [];
  const result: PerformanceChartItem[] = [];
  const portfolioReturn = finiteNumber(weeklyPerformance.portfolioReturnPct);
  if (portfolioReturn !== null)
    result.push({
      name: "Portfolio",
      value: Number(portfolioReturn.toFixed(2)),
      kind: "portfolio",
    });
  for (const item of records(weeklyPerformance.benchmarks)) {
    const value = finiteNumber(item.returnPct);
    if (typeof item.name !== "string" || value === null) continue;
    result.push({
      name: item.name,
      value: Number(value.toFixed(2)),
      kind: "benchmark",
    });
  }
  return result;
}

export function attributionChartData(evidence: Evidence) {
  const attribution =
    evidence.weeklyAttribution && typeof evidence.weeklyAttribution === "object"
      ? (evidence.weeklyAttribution as Record<string, unknown>)
      : null;
  if (!attribution) return [];
  return [
    ...records(attribution.topPositiveContributors),
    ...records(attribution.topNegativeContributors),
  ]
    .flatMap((item): AttributionChartItem[] => {
      const value = finiteNumber(item.contributionPct);
      const beginningWeightPct = finiteNumber(item.beginningWeightPct);
      const weeklyReturnPct = finiteNumber(item.weeklyReturnPct);
      if (
        typeof item.symbol !== "string" ||
        value === null ||
        beginningWeightPct === null ||
        weeklyReturnPct === null
      )
        return [];
      return [
        {
          name: item.symbol.toUpperCase(),
          value: Number(value.toFixed(2)),
          beginningWeightPct: Number(beginningWeightPct.toFixed(2)),
          weeklyReturnPct: Number(weeklyReturnPct.toFixed(2)),
        },
      ];
    })
    .sort((left, right) => right.value - left.value);
}

export function concentrationMetrics(evidence: Evidence) {
  const summary =
    evidence.portfolioSummary && typeof evidence.portfolioSummary === "object"
      ? (evidence.portfolioSummary as Record<string, unknown>)
      : null;
  if (!summary) return [];
  return [1, 3, 5, 8].flatMap((count) => {
    const value = finiteNumber(summary[`top${count}WeightPct`]);
    return value === null
      ? []
      : [{ label: `Top ${count}`, value: Number(value.toFixed(3)) }];
  });
}

function etfLookThrough(evidence: Evidence) {
  return evidence.etfLookThrough && typeof evidence.etfLookThrough === "object"
    ? (evidence.etfLookThrough as Record<string, unknown>)
    : null;
}

export function lookThroughExposureChartData(evidence: Evidence) {
  const lookThrough = etfLookThrough(evidence);
  if (!lookThrough) return [];
  const fundSymbols = new Set(
    records(evidence.allocation).flatMap((item) => {
      const type = typeof item.type === "string" ? item.type.toLowerCase() : "";
      return typeof item.symbol === "string" && ["etf", "fund"].includes(type)
        ? [item.symbol.toUpperCase()]
        : [];
    }),
  );
  return records(lookThrough.topUnderlyingExposures)
    .flatMap((item): LookThroughChartItem[] => {
      const directPct = finiteNumber(item.directPct);
      const etfIndirectPct = finiteNumber(item.indirectPct);
      const dailyNominalIndirectPct = finiteNumber(
        item.dailyNominalIndirectPct,
      );
      const total = finiteNumber(item.totalDailyNominalExposurePct);
      if (
        typeof item.symbol !== "string" ||
        directPct === null ||
        etfIndirectPct === null ||
        dailyNominalIndirectPct === null ||
        total === null ||
        total <= 0 ||
        fundSymbols.has(item.symbol.toUpperCase())
      )
        return [];
      return [
        {
          name: item.symbol.toUpperCase(),
          directPct: Number(directPct.toFixed(2)),
          etfIndirectPct: Number(etfIndirectPct.toFixed(2)),
          leveragedAdjustmentPct: Number(
            Math.max(0, dailyNominalIndirectPct - etfIndirectPct).toFixed(2),
          ),
          totalDailyNominalExposurePct: Number(total.toFixed(2)),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.totalDailyNominalExposurePct - left.totalDailyNominalExposurePct,
    )
    .slice(0, 10);
}

export function etfOverlapChartData(evidence: Evidence) {
  const lookThrough = etfLookThrough(evidence);
  if (!lookThrough) return [];
  return records(lookThrough.overlaps)
    .flatMap((item): EtfOverlapChartItem[] => {
      const value = finiteNumber(item.overlapByWeightPct);
      const commonHoldingsCount = finiteNumber(item.commonHoldingsCount);
      if (
        typeof item.left !== "string" ||
        typeof item.right !== "string" ||
        value === null ||
        commonHoldingsCount === null ||
        value <= 0
      )
        return [];
      return [
        {
          name: `${item.left.toUpperCase()} × ${item.right.toUpperCase()}`,
          value: Number(value.toFixed(2)),
          commonHoldingsCount: Math.round(commonHoldingsCount),
        },
      ];
    })
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);
}

export function indexExposureMetrics(evidence: Evidence) {
  const lookThrough = etfLookThrough(evidence);
  if (!lookThrough) return [];
  return records(lookThrough.indexFamilyDailyNominalExposure).flatMap(
    (item) => {
      const value = finiteNumber(item.exposurePct);
      return typeof item.indexName === "string" && value !== null && value > 0
        ? [{ label: item.indexName, value: Number(value.toFixed(2)) }]
        : [];
    },
  );
}
