import Decimal from "decimal.js";
import type { CandlePoint, ResearchReportLanguage } from "./types";

export type PortfolioAllocation = {
  symbol: string;
  market: string;
  type: string;
  weightPct: number;
};

export type StructuredResearchSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  qualityScore?: number;
};

export type SecurityEventCandidate = {
  symbol: string;
  event: string;
  eventDate: string | null;
  category: string;
  materialityScore: number;
  directnessScore: number;
  financialImpactScore: number;
  sourceQualityScore: number;
  sourceIds: string[];
  portfolioRelevance: string;
  risk: string;
  classification: "security_event" | "manager_related" | "industry_context";
};

export type RankedSecurityEvent = SecurityEventCandidate & {
  portfolioWeight: number;
  portfolioRelevanceScore: number;
};

export type NextWeekEventCandidate = {
  focus: string;
  symbol: string | null;
  eventDate: string | null;
  condition: string;
  portfolioRelevance: string;
  reason: string;
  category: string;
  importanceScore: number;
  sourceQualityScore: number;
  sourceIds: string[];
};

export type RankedNextWeekEvent = NextWeekEventCandidate & {
  portfolioRelevanceScore: number;
};

export type EtfHoldingSnapshot = {
  etfSymbol: string;
  asOf: string;
  sourceIds: string[];
  holdings: Array<{ symbol: string; name: string; weightPct: number }>;
};

export type WeeklyAttributionSnapshot = {
  id: string;
  baseSnapshotId: string | null;
  capturedAt: string;
  totalAssetValueTwd: string;
  totalSecuritiesTwd: string;
  contributionTwd: string;
  withdrawalTwd: string;
  positions: Array<{
    market: string;
    symbol: string;
    quantity: string;
    marketValueTwd: string;
  }>;
};

const clampScore = (value: number, minimum = 0, maximum = 5) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0));

const symbolKey = (market: string, symbol: string) =>
  `${market.toUpperCase()}:${symbol.toUpperCase()}`;

function allocationWeightMap(allocation: PortfolioAllocation[]) {
  const weights = new Map<string, number>();
  for (const item of allocation) {
    const normalized = item.symbol.toUpperCase();
    weights.set(symbolKey(item.market, normalized), item.weightPct);
    weights.set(normalized, (weights.get(normalized) ?? 0) + item.weightPct);
  }
  return weights;
}

export function scoreSecurityEvent(
  event: SecurityEventCandidate,
  portfolioWeight: number,
) {
  const portfolioScore = Math.min(30, Math.max(0, portfolioWeight) * 3);
  const qualitativeScore =
    clampScore(event.materialityScore) * 6 +
    clampScore(event.directnessScore) * 4 +
    clampScore(event.financialImpactScore) * 3 +
    clampScore(event.sourceQualityScore);
  const indirectPenalty =
    event.classification === "manager_related"
      ? 30
      : event.classification === "industry_context"
        ? 12
        : 0;
  return Math.round(
    Math.min(
      100,
      Math.max(0, portfolioScore + qualitativeScore - indirectPenalty),
    ),
  );
}

export function rankSecurityEvents(
  events: SecurityEventCandidate[],
  allocation: PortfolioAllocation[],
  limit = 5,
) {
  const weights = allocationWeightMap(allocation);
  const stockSymbols = new Set(
    allocation
      .filter((item) => item.type.toLowerCase() === "stock")
      .map((item) => item.symbol.toUpperCase()),
  );
  const ranked = events
    .filter((event) => stockSymbols.has(event.symbol.toUpperCase()))
    .map((event, index) => {
      const portfolioWeight = weights.get(event.symbol.toUpperCase()) ?? 0;
      return {
        ...event,
        portfolioWeight,
        portfolioRelevanceScore: scoreSecurityEvent(event, portfolioWeight),
        index,
      };
    })
    .sort(
      (left, right) =>
        right.portfolioWeight - left.portfolioWeight ||
        right.portfolioRelevanceScore - left.portfolioRelevanceScore ||
        left.index - right.index,
    );
  const perSymbol = new Map<string, number>();
  return ranked
    .filter((event) => {
      const key = event.symbol.toUpperCase();
      const count = perSymbol.get(key) ?? 0;
      if (count >= 2) return false;
      perSymbol.set(key, count + 1);
      return true;
    })
    .slice(0, limit)
    .map(({ index, ...event }) => {
      void index;
      return event;
    });
}

const nextWeekCategoryPriority: Record<string, number> = {
  earnings: 20,
  guidance: 20,
  company_event: 17,
  fed: 18,
  rates: 18,
  macro: 16,
  semiconductor: 15,
  ai: 14,
  taiwan_market: 13,
  regulation: 13,
};

export function rankNextWeekEvents(
  events: NextWeekEventCandidate[],
  allocation: PortfolioAllocation[],
  limit = 5,
) {
  const weights = allocationWeightMap(allocation);
  return events
    .map((event, index) => {
      const weight = event.symbol
        ? (weights.get(event.symbol.toUpperCase()) ?? 0)
        : 0;
      const portfolioScore = Math.min(30, weight * 3);
      const score = Math.round(
        Math.min(
          100,
          portfolioScore +
            clampScore(event.importanceScore) * 7 +
            (nextWeekCategoryPriority[event.category] ?? 8) +
            clampScore(event.sourceQualityScore) * 3,
        ),
      );
      return { ...event, portfolioRelevanceScore: score, index };
    })
    .sort(
      (left, right) =>
        right.portfolioRelevanceScore - left.portfolioRelevanceScore ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map(({ index, ...event }) => {
      void index;
      return event;
    });
}

const day = (value: string | Date) =>
  (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);

export function calculateWeeklyReturn(
  candles: CandlePoint[],
  weekStart: string,
  periodEnd: string,
) {
  const endTarget = new Date(`${weekStart}T00:00:00.000Z`);
  endTarget.setUTCDate(endTarget.getUTCDate() + 4);
  const effectiveEnd = [day(endTarget), day(periodEnd)].sort()[0];
  const ordered = [...candles].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  const beginning = ordered
    .filter((point) => day(point.date) < weekStart)
    .at(-1);
  const ending = ordered
    .filter((point) => day(point.date) <= effectiveEnd)
    .at(-1);
  if (!beginning || !ending || day(ending.date) <= day(beginning.date))
    return null;
  if (!Number.isFinite(beginning.close) || beginning.close <= 0) return null;
  return {
    from: day(beginning.date),
    to: day(ending.date),
    returnPct: Number(
      new Decimal(ending.close)
        .div(beginning.close)
        .minus(1)
        .mul(100)
        .toDecimalPlaces(2)
        .toString(),
    ),
  };
}

export function calculateWeeklyAttribution(
  beginning: WeeklyAttributionSnapshot,
  ending: WeeklyAttributionSnapshot,
) {
  const elapsedDays =
    (new Date(ending.capturedAt).valueOf() -
      new Date(beginning.capturedAt).valueOf()) /
    86_400_000;
  if (
    ending.baseSnapshotId !== beginning.id ||
    elapsedDays < 3 ||
    elapsedDays > 10
  )
    return null;

  const externalNetFlow = new Decimal(ending.contributionTwd).minus(
    ending.withdrawalTwd,
  );
  const returnDenominator = new Decimal(beginning.totalAssetValueTwd).plus(
    externalNetFlow.mul(0.5),
  );
  const portfolioReturnPct = returnDenominator.isPositive()
    ? Number(
        new Decimal(ending.totalAssetValueTwd)
          .minus(beginning.totalAssetValueTwd)
          .minus(externalNetFlow)
          .div(returnDenominator)
          .mul(100)
          .toDecimalPlaces(2)
          .toString(),
      )
    : null;

  const aggregate = (snapshot: WeeklyAttributionSnapshot) => {
    const values = new Map<
      string,
      { symbol: string; market: string; quantity: Decimal; value: Decimal }
    >();
    for (const position of snapshot.positions) {
      const key = symbolKey(position.market, position.symbol);
      const current = values.get(key) ?? {
        symbol: position.symbol.toUpperCase(),
        market: position.market,
        quantity: new Decimal(0),
        value: new Decimal(0),
      };
      current.quantity = current.quantity.plus(position.quantity);
      current.value = current.value.plus(position.marketValueTwd);
      values.set(key, current);
    }
    return values;
  };
  const start = aggregate(beginning);
  const finish = aggregate(ending);
  const securitiesTotal = new Decimal(beginning.totalSecuritiesTwd);
  const contributors = [...start.entries()].flatMap(([key, prior]) => {
    const current = finish.get(key);
    if (
      !current ||
      !prior.quantity.isPositive() ||
      !prior.quantity.eq(current.quantity) ||
      !prior.value.isPositive() ||
      !securitiesTotal.isPositive()
    )
      return [];
    const beginningWeight = prior.value.div(securitiesTotal).mul(100);
    const weeklyReturn = current.value.div(prior.value).minus(1).mul(100);
    return [
      {
        symbol: prior.symbol,
        market: prior.market,
        beginningWeightPct: Number(
          beginningWeight.toDecimalPlaces(2).toString(),
        ),
        weeklyReturnPct: Number(weeklyReturn.toDecimalPlaces(2).toString()),
        contributionPct: Number(
          beginningWeight
            .mul(weeklyReturn)
            .div(100)
            .toDecimalPlaces(2)
            .toString(),
        ),
      },
    ];
  });
  const sorted = [...contributors].sort(
    (left, right) => right.contributionPct - left.contributionPct,
  );
  return {
    from: day(beginning.capturedAt),
    to: day(ending.capturedAt),
    portfolioReturnPct,
    externalNetFlowPct: new Decimal(beginning.totalAssetValueTwd).isPositive()
      ? Number(
          externalNetFlow
            .div(beginning.totalAssetValueTwd)
            .mul(100)
            .toDecimalPlaces(2)
            .toString(),
        )
      : null,
    topPositiveContributors: sorted
      .filter((item) => item.contributionPct > 0)
      .slice(0, 3),
    topNegativeContributors: sorted
      .filter((item) => item.contributionPct < 0)
      .slice(-3)
      .reverse(),
  };
}

const leverageBySymbol: Record<
  string,
  { multiplier: number; indexName: string; dailyReset: true }
> = {
  TQQQ: { multiplier: 3, indexName: "Nasdaq-100", dailyReset: true },
};
const indexFamilyBySymbol: Record<string, string> = {
  QQQ: "Nasdaq-100",
  TQQQ: "Nasdaq-100",
  VOO: "S&P 500",
  "0050": "臺灣 50",
  "006208": "臺灣 50",
};

export function calculateEtfLookThrough(
  allocation: PortfolioAllocation[],
  snapshots: EtfHoldingSnapshot[],
) {
  const allocationBySymbol = new Map(
    allocation.map((item) => [item.symbol.toUpperCase(), item]),
  );
  const exposures = new Map<
    string,
    {
      symbol: string;
      name: string;
      directPct: Decimal;
      indirectPct: Decimal;
      dailyNominalIndirectPct: Decimal;
      via: Set<string>;
    }
  >();
  for (const item of allocation) {
    if (["etf", "fund"].includes(item.type.toLowerCase())) continue;
    exposures.set(item.symbol.toUpperCase(), {
      symbol: item.symbol.toUpperCase(),
      name: item.symbol.toUpperCase(),
      directPct: new Decimal(item.weightPct),
      indirectPct: new Decimal(0),
      dailyNominalIndirectPct: new Decimal(0),
      via: new Set(),
    });
  }
  for (const snapshot of snapshots) {
    const fund = allocationBySymbol.get(snapshot.etfSymbol.toUpperCase());
    if (!fund) continue;
    const leverage =
      leverageBySymbol[fund.symbol.toUpperCase()]?.multiplier ?? 1;
    for (const holding of snapshot.holdings) {
      const key = holding.symbol.toUpperCase();
      const exposure = exposures.get(key) ?? {
        symbol: key,
        name: holding.name || key,
        directPct: new Decimal(0),
        indirectPct: new Decimal(0),
        dailyNominalIndirectPct: new Decimal(0),
        via: new Set<string>(),
      };
      const indirect = new Decimal(fund.weightPct)
        .mul(holding.weightPct)
        .div(100);
      exposure.indirectPct = exposure.indirectPct.plus(indirect);
      exposure.dailyNominalIndirectPct = exposure.dailyNominalIndirectPct.plus(
        indirect.mul(leverage),
      );
      exposure.via.add(fund.symbol.toUpperCase());
      exposures.set(key, exposure);
    }
  }

  const heldSnapshots = snapshots.filter((snapshot) =>
    allocationBySymbol.has(snapshot.etfSymbol.toUpperCase()),
  );
  const overlaps = heldSnapshots.flatMap((left, leftIndex) =>
    heldSnapshots.slice(leftIndex + 1).map((right) => {
      const rightWeights = new Map(
        right.holdings.map((holding) => [
          holding.symbol.toUpperCase(),
          holding.weightPct,
        ]),
      );
      const common = left.holdings
        .filter((holding) => rightWeights.has(holding.symbol.toUpperCase()))
        .map((holding) => ({
          symbol: holding.symbol.toUpperCase(),
          overlapWeightPct: Math.min(
            holding.weightPct,
            rightWeights.get(holding.symbol.toUpperCase()) ?? 0,
          ),
        }))
        .sort((a, b) => b.overlapWeightPct - a.overlapWeightPct);
      return {
        left: left.etfSymbol.toUpperCase(),
        right: right.etfSymbol.toUpperCase(),
        commonHoldingsCount: common.length,
        overlapByWeightPct: Number(
          common
            .reduce(
              (sum, item) => sum.plus(item.overlapWeightPct),
              new Decimal(0),
            )
            .toDecimalPlaces(2)
            .toString(),
        ),
        majorDuplicatedHoldings: common.slice(0, 5),
      };
    }),
  );

  const familyExposure = new Map<string, Decimal>();
  for (const item of allocation) {
    const symbol = item.symbol.toUpperCase();
    const family = indexFamilyBySymbol[symbol];
    if (!family) continue;
    const multiplier = leverageBySymbol[symbol]?.multiplier ?? 1;
    familyExposure.set(
      family,
      (familyExposure.get(family) ?? new Decimal(0)).plus(
        new Decimal(item.weightPct).mul(multiplier),
      ),
    );
  }

  return {
    topUnderlyingExposures: [...exposures.values()]
      .map((item) => ({
        symbol: item.symbol,
        name: item.name,
        directPct: Number(item.directPct.toDecimalPlaces(2).toString()),
        indirectPct: Number(item.indirectPct.toDecimalPlaces(2).toString()),
        dailyNominalIndirectPct: Number(
          item.dailyNominalIndirectPct.toDecimalPlaces(2).toString(),
        ),
        totalDailyNominalExposurePct: Number(
          item.directPct
            .plus(item.dailyNominalIndirectPct)
            .toDecimalPlaces(2)
            .toString(),
        ),
        via: [...item.via],
      }))
      .sort(
        (left, right) =>
          right.totalDailyNominalExposurePct -
          left.totalDailyNominalExposurePct,
      )
      .slice(0, 10),
    overlaps: overlaps.sort(
      (left, right) => right.overlapByWeightPct - left.overlapByWeightPct,
    ),
    leveragedEtfs: allocation.flatMap((item) => {
      const leverage = leverageBySymbol[item.symbol.toUpperCase()];
      if (!leverage) return [];
      return [
        {
          symbol: item.symbol.toUpperCase(),
          portfolioWeightPct: item.weightPct,
          multiplier: leverage.multiplier,
          dailyTargetNominalExposurePct: Number(
            new Decimal(item.weightPct)
              .mul(leverage.multiplier)
              .toDecimalPlaces(2)
              .toString(),
          ),
          indexName: leverage.indexName,
          dailyReset: true,
          caveat:
            "此為每日目標名目曝險；每日重設、路徑相依、波動耗損與複利差異會使長期實現曝險不同。",
        },
      ];
    }),
    indexFamilyDailyNominalExposure: [...familyExposure].map(
      ([indexName, exposure]) => ({
        indexName,
        exposurePct: Number(exposure.toDecimalPlaces(2).toString()),
      }),
    ),
  };
}

export function sanitizeReportText(value: string, validSourceIds: Set<string>) {
  return value
    .replace(/\[([^\]]+)]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\[([^\]]+)]/g, (match, id: string) =>
      validSourceIds.has(id) ? match : id,
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function sourceReferences(sourceIds: string[]) {
  return sourceIds.length
    ? ` ${sourceIds.map((id) => `[${id}]`).join(" ")}`
    : "";
}

export function weeklyPerformanceLabel(
  language: ResearchReportLanguage,
  items: Array<{ name: string; returnPct: number; sourceId: string }>,
  portfolioReturnPct: number | null,
) {
  const sign = (value: number) =>
    `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  if (language === "en") {
    const market = items
      .map((item) => `${item.name}: ${sign(item.returnPct)} [${item.sourceId}]`)
      .join("; ");
    return `Weekly performance (previous trading-week close to current trading-week close): ${market}${portfolioReturnPct === null ? "" : `; Portfolio estimate: ${sign(portfolioReturnPct)}`}. Market returns, portfolio return, and snapshot changes are distinct measures.`;
  }
  if (language === "ja") {
    const market = items
      .map((item) => `${item.name}：${sign(item.returnPct)} [${item.sourceId}]`)
      .join("；");
    return `週間パフォーマンス（前週最終取引日の終値から当週最終取引日の終値）：${market}${portfolioReturnPct === null ? "" : `；ポートフォリオ推計：${sign(portfolioReturnPct)}`}。市場リターン、ポートフォリオリターン、スナップショット変動は別の指標です。`;
  }
  const market = items
    .map((item) => `${item.name}：${sign(item.returnPct)} [${item.sourceId}]`)
    .join("；");
  return `本週績效（前一交易週最後收盤至本交易週最後收盤）：${market}${portfolioReturnPct === null ? "" : `；Portfolio 估算：${sign(portfolioReturnPct)}`}。市場報酬、投資組合報酬與快照變動是不同指標。`;
}
