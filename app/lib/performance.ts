import YahooFinance from "yahoo-finance2";
import { getDatabase } from "./db";
import { decimal, money, percentage } from "./finance";
import type {
  BenchmarkId,
  PerformanceReport,
  PerformanceSeriesPoint,
} from "./types";

type Row = Record<string, unknown>;
type PerformanceInput = {
  capturedAt: string;
  valueTwd: string;
  contributionTwd: string;
  withdrawalTwd: string;
  accountCount?: number;
  positionCount?: number;
};

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const benchmarkDefinitions: Record<
  BenchmarkId,
  { name: string; symbol: string; currency: "TWD" | "USD" }
> = {
  twii: { name: "臺灣加權指數", symbol: "^TWII", currency: "TWD" },
  sp500: { name: "S&P 500（SPY）", symbol: "SPY", currency: "USD" },
  global: { name: "全球股票（VT）", symbol: "VT", currency: "USD" },
};

const taipeiDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function rangeStart(range: PerformanceReport["range"]) {
  if (range === "all") return null;
  const start = new Date();
  start.setMonth(start.getMonth() - (range === "1y" ? 12 : 6));
  return start.toISOString();
}

export async function loadPerformanceInputs(
  range: PerformanceReport["range"],
): Promise<PerformanceInput[]> {
  const db = await getDatabase();
  const since = rangeStart(range);
  const where = since ? "WHERE snapshot.captured_at >= ?" : "";
  const parameters = since ? [since] : [];
  const rows = await db
    .prepare(
      `SELECT snapshot.captured_at, snapshot.total_asset_value_twd,
      snapshot.id,
      (SELECT COUNT(*) FROM snapshot_accounts account WHERE account.snapshot_id = snapshot.id) AS account_count,
      (SELECT COUNT(*) FROM snapshot_positions position JOIN snapshot_accounts account ON account.id = position.snapshot_account_id WHERE account.snapshot_id = snapshot.id) AS position_count
      FROM snapshots snapshot
      ${where}
      ORDER BY snapshot.captured_at`,
    )
    .all(...parameters) as Row[];
  const flowRows = await db
    .prepare(
      `SELECT flow.snapshot_id, flow.flow_type, flow.amount_twd
      FROM snapshot_cash_flows flow
      JOIN snapshots snapshot ON snapshot.id = flow.snapshot_id
      ${where}`,
    )
    .all(...parameters) as Row[];
  const flowTotals = new Map<
    string,
    {
      contribution: ReturnType<typeof decimal>;
      withdrawal: ReturnType<typeof decimal>;
    }
  >();
  for (const flow of flowRows) {
    const snapshotId = String(flow.snapshot_id);
    const totals = flowTotals.get(snapshotId) ?? {
      contribution: decimal(0),
      withdrawal: decimal(0),
    };
    if (flow.flow_type === "capital_contribution")
      totals.contribution = totals.contribution.plus(String(flow.amount_twd));
    if (flow.flow_type === "capital_withdrawal")
      totals.withdrawal = totals.withdrawal.plus(String(flow.amount_twd));
    flowTotals.set(snapshotId, totals);
  }
  return rows.map((row) => ({
    capturedAt: String(row.captured_at),
    valueTwd: String(row.total_asset_value_twd),
    contributionTwd: money(
      flowTotals.get(String(row.id))?.contribution ?? decimal(0),
    ),
    withdrawalTwd: money(
      flowTotals.get(String(row.id))?.withdrawal ?? decimal(0),
    ),
    accountCount: Number(row.account_count),
    positionCount: Number(row.position_count),
  }));
}

export function calculatePortfolioPerformance(inputs: PerformanceInput[]) {
  if (inputs.length < 2) {
    return {
      beginningValueTwd: inputs[0]?.valueTwd ?? null,
      endingValueTwd: inputs.at(-1)?.valueTwd ?? null,
      externalNetFlowTwd: "0",
      cumulativeReturnPct: null,
      annualizedReturnPct: null,
      maxDrawdownPct: null,
      calculationStartAt: inputs[0]?.capturedAt ?? null,
      calculationWarning: null,
      series: inputs.map((input) => ({
        capturedAt: taipeiDay.format(new Date(input.capturedAt)),
        portfolioIndex: 100,
      })),
    };
  }

  let factor = decimal(1);
  let externalNetFlow = decimal(0);
  let peak = decimal(100);
  let maximumDrawdown = decimal(0);
  let calculationStartIndex = 0;
  let validIntervals = 0;
  let calculationWarning: string | null = null;
  const byDay = new Map<string, PerformanceSeriesPoint>();
  byDay.set(taipeiDay.format(new Date(inputs[0].capturedAt)), {
    capturedAt: taipeiDay.format(new Date(inputs[0].capturedAt)),
    portfolioIndex: 100,
  });

  for (let index = 1; index < inputs.length; index += 1) {
    const previous = inputs[index - 1];
    const current = inputs[index];
    const netFlow = decimal(current.contributionTwd).minus(
      current.withdrawalTwd,
    );
    externalNetFlow = externalNetFlow.plus(netFlow);
    const denominator = decimal(previous.valueTwd).plus(netFlow.mul(0.5));
    if (denominator.lte(0)) continue;
    const intervalReturn = decimal(current.valueTwd)
      .minus(previous.valueTwd)
      .minus(netFlow)
      .div(denominator);
    const compositionExpanded =
      (current.accountCount ?? 0) > (previous.accountCount ?? 0) ||
      (current.positionCount ?? 0) > (previous.positionCount ?? 0);
    const unclassifiedExpansion =
      netFlow.isZero() &&
      (intervalReturn.abs().gt(1) ||
        (compositionExpanded && intervalReturn.gt(0.05)));
    if (unclassifiedExpansion) {
      calculationStartIndex = index;
      factor = decimal(1);
      externalNetFlow = decimal(0);
      peak = decimal(100);
      maximumDrawdown = decimal(0);
      validIntervals = 0;
      byDay.clear();
      const day = taipeiDay.format(new Date(current.capturedAt));
      byDay.set(day, { capturedAt: day, portfolioIndex: 100 });
      calculationWarning =
        "已略過疑似未記錄資金流的早期區段，並從最近一次異常變動後重新起算。";
      continue;
    }
    validIntervals += 1;
    factor = factor.mul(intervalReturn.plus(1));
    const normalized = factor.mul(100);
    if (normalized.gt(peak)) peak = normalized;
    const drawdown = normalized.minus(peak).div(peak).mul(100);
    if (drawdown.lt(maximumDrawdown)) maximumDrawdown = drawdown;
    const day = taipeiDay.format(new Date(current.capturedAt));
    byDay.set(day, {
      capturedAt: day,
      portfolioIndex: Number(normalized.toDecimalPlaces(4).toString()),
    });
  }

  const cumulative = validIntervals > 0 ? factor.minus(1) : null;
  const elapsedDays = Math.max(
    0,
    (new Date(inputs.at(-1)!.capturedAt).valueOf() -
      new Date(inputs[calculationStartIndex].capturedAt).valueOf()) /
      86_400_000,
  );
  const annualized =
    cumulative !== null && elapsedDays >= 30 && factor.gt(0)
      ? factor
          .pow(365.2425 / elapsedDays)
          .minus(1)
          .mul(100)
      : null;

  return {
    beginningValueTwd: money(inputs[calculationStartIndex].valueTwd),
    endingValueTwd: money(inputs.at(-1)!.valueTwd),
    externalNetFlowTwd: money(externalNetFlow),
    cumulativeReturnPct:
      cumulative === null ? null : percentage(cumulative.mul(100)),
    annualizedReturnPct: annualized ? percentage(annualized) : null,
    maxDrawdownPct: percentage(maximumDrawdown),
    calculationStartAt: inputs[calculationStartIndex].capturedAt,
    calculationWarning,
    series: [...byDay.values()],
  };
}

async function benchmarkSeries(
  benchmarkId: BenchmarkId,
  period1: string,
  period2: string,
) {
  const definition = benchmarkDefinitions[benchmarkId];
  const end = new Date(period2);
  end.setUTCDate(end.getUTCDate() + 2);
  const options = {
    period1: new Date(period1),
    period2: end,
    interval: "1d" as const,
    return: "array" as const,
  };
  const prices = await yahoo.chart(definition.symbol, options);
  const fx =
    definition.currency === "USD"
      ? await yahoo.chart("USDTWD=X", options)
      : null;
  const fxQuotes = (fx?.quotes ?? [])
    .filter((quote) => quote.close !== null)
    .sort((left, right) => left.date.valueOf() - right.date.valueOf());
  let fxIndex = 0;
  let lastFx = 1;
  const values: Array<{ capturedAt: string; value: number }> = [];

  for (const quote of prices.quotes) {
    const price = quote.adjclose ?? quote.close;
    if (price === null) continue;
    while (
      fxIndex < fxQuotes.length &&
      fxQuotes[fxIndex].date.valueOf() <= quote.date.valueOf()
    ) {
      lastFx = fxQuotes[fxIndex].close ?? lastFx;
      fxIndex += 1;
    }
    if (definition.currency === "USD" && lastFx === 1) continue;
    const day = taipeiDay.format(quote.date);
    if (day < period1.slice(0, 10) || day > period2.slice(0, 10)) continue;
    values.push({ capturedAt: day, value: price * lastFx });
  }
  if (values.length < 2) throw new Error("基準歷史行情不足");
  const first = values[0].value;
  return values.map((point) => ({
    capturedAt: point.capturedAt,
    benchmarkIndex: Number(((point.value / first) * 100).toFixed(4)),
  }));
}

export async function getPerformanceReport(
  range: PerformanceReport["range"],
  benchmarkId: BenchmarkId,
): Promise<PerformanceReport> {
  const inputs = await loadPerformanceInputs(range);
  const portfolio = calculatePortfolioPerformance(inputs);
  const definition = benchmarkDefinitions[benchmarkId];
  let benchmarkError: string | null = null;
  let benchmark: PerformanceSeriesPoint[] = [];

  if (inputs.length >= 2) {
    try {
      benchmark = await benchmarkSeries(
        benchmarkId,
        portfolio.calculationStartAt ?? inputs[0].capturedAt,
        inputs.at(-1)!.capturedAt,
      );
    } catch {
      benchmarkError = "目前無法取得基準歷史行情";
    }
  }

  const merged = new Map<string, PerformanceSeriesPoint>();
  for (const point of [...portfolio.series, ...benchmark]) {
    merged.set(point.capturedAt, {
      ...merged.get(point.capturedAt),
      ...point,
    });
  }
  const benchmarkReturn = benchmark.length
    ? decimal(benchmark.at(-1)!.benchmarkIndex!).minus(100)
    : null;
  const portfolioReturn =
    portfolio.cumulativeReturnPct === null
      ? null
      : decimal(portfolio.cumulativeReturnPct);

  return {
    range,
    benchmarkId,
    benchmarkName: definition.name,
    benchmarkError,
    calculationWarning: portfolio.calculationWarning,
    beginningValueTwd: portfolio.beginningValueTwd,
    endingValueTwd: portfolio.endingValueTwd,
    externalNetFlowTwd: portfolio.externalNetFlowTwd,
    cumulativeReturnPct: portfolio.cumulativeReturnPct,
    annualizedReturnPct: portfolio.annualizedReturnPct,
    maxDrawdownPct: portfolio.maxDrawdownPct,
    benchmarkReturnPct:
      benchmarkReturn !== null ? percentage(benchmarkReturn) : null,
    excessReturnPct:
      benchmarkReturn !== null && portfolioReturn !== null
        ? percentage(portfolioReturn.minus(benchmarkReturn))
        : null,
    estimated: true,
    series: [...merged.values()].sort((left, right) =>
      left.capturedAt.localeCompare(right.capturedAt),
    ),
  };
}
