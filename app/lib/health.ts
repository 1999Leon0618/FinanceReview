import { followingCreditCardDueDate } from "./credit-card";
import { decimal, money, zero } from "./finance";
import type { HealthFinding, HealthReport, SnapshotDetail } from "./types";

const millisecondsPerDay = 86_400_000;
const taipeiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dayNumber(value: Date | string) {
  const formatted = taipeiDate.format(
    value instanceof Date ? value : new Date(value),
  );
  return Date.parse(`${formatted}T00:00:00.000Z`) / millisecondsPerDay;
}

function ageInDays(value: string, now: Date) {
  return Math.max(0, Math.floor(dayNumber(now) - dayNumber(value)));
}

function nextPaymentDate(dayOfMonth: number, now: Date) {
  const [year, month, day] = taipeiDate.format(now).split("-").map(Number);
  const targetMonth = dayOfMonth >= day ? month - 1 : month;
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, targetMonth, Math.min(dayOfMonth, lastDay)),
  ).toISOString();
}

function finding(
  id: string,
  category: HealthFinding["category"],
  severity: HealthFinding["severity"],
  title: string,
  detail: string,
): HealthFinding {
  return { id, category, severity, title, detail };
}

export function buildHealthReport(
  latest: SnapshotDetail | null,
  now = new Date(),
): HealthReport {
  if (!latest) {
    return {
      lastUpdatedAt: null,
      daysSinceUpdate: null,
      freshnessTone: "attention",
      freshnessLabel: "尚未建立快照",
      shouldWarnOnOpen: false,
      findings: [],
    };
  }

  const daysSinceUpdate = ageInDays(latest.capturedAt, now);
  const freshnessTone =
    daysSinceUpdate >= 180
      ? "warning"
      : daysSinceUpdate >= 46
        ? "attention"
        : "fresh";
  const findings: HealthFinding[] = [];

  if (daysSinceUpdate >= 180) {
    findings.push(
      finding(
        "snapshot-overdue",
        "action",
        "critical",
        "財務資料已超過 180 天未更新",
        `最近一份快照是 ${daysSinceUpdate} 天前，建議更新帳戶餘額與持倉行情。`,
      ),
    );
  } else if (daysSinceUpdate >= 46) {
    findings.push(
      finding(
        "snapshot-aging",
        "action",
        "warning",
        "可以安排下一次財務更新",
        `最近一份快照是 ${daysSinceUpdate} 天前。`,
      ),
    );
  }

  let calculatedCash = zero;
  let calculatedSecurities = zero;
  let calculatedLiabilities = zero;

  for (const account of latest.accounts) {
    for (const balance of account.cashBalances) {
      if (balance.currency !== "TWD" && !balance.fxRate) {
        findings.push(
          finding(
            `cash-fx-${account.accountId}-${balance.currency}`,
            "completeness",
            "critical",
            `${account.name} 缺少 ${balance.currency} 匯率`,
            "此外幣現金無法可靠換算為新臺幣。",
          ),
        );
        continue;
      }
      calculatedCash = calculatedCash.plus(
        decimal(balance.amount).mul(balance.fxRate?.rate ?? "1"),
      );
    }

    for (const position of account.positions) {
      calculatedSecurities = calculatedSecurities.plus(position.marketValueTwd);
      if (decimal(position.marketPrice).lte(0)) {
        findings.push(
          finding(
            `position-price-${position.id}`,
            "completeness",
            "critical",
            `${position.symbol} 缺少有效行情`,
            `${position.accountName} 的市場價格不是有效正數。`,
          ),
        );
      }
      if (position.quoteCurrency !== "TWD" && !position.fxRate) {
        findings.push(
          finding(
            `position-fx-${position.id}`,
            "completeness",
            "critical",
            `${position.symbol} 缺少 ${position.quoteCurrency} 匯率`,
            "此外幣持倉無法可靠換算為新臺幣。",
          ),
        );
      }
      const quoteAge = ageInDays(position.quoteAsOf, now);
      if (position.quoteStatus === "manual") {
        findings.push(
          finding(
            `position-manual-${position.id}`,
            "completeness",
            "warning",
            `${position.symbol} 使用人工行情`,
            `行情日期為 ${position.quoteAsOf.slice(0, 10)}，請確認價格仍適用。`,
          ),
        );
      } else if (position.quoteStatus === "stale" || quoteAge >= 7) {
        findings.push(
          finding(
            `position-stale-${position.id}`,
            "action",
            quoteAge >= 30 ? "critical" : "warning",
            `${position.symbol} 行情需要更新`,
            `目前行情已距今 ${quoteAge} 天。`,
          ),
        );
      }

      if (position.securityType === "future" && position.contractExpiry) {
        const match = position.contractExpiry.match(/^(\d{4})[-/]?(\d{2})/);
        if (match) {
          const [currentYear, currentMonth] = taipeiDate
            .format(now)
            .split("-")
            .map(Number);
          const monthDistance =
            Number(match[1]) * 12 +
            Number(match[2]) -
            (currentYear * 12 + currentMonth);
          if (monthDistance <= 1) {
            findings.push(
              finding(
                `future-expiry-${position.id}`,
                "action",
                monthDistance < 0 ? "critical" : "warning",
                `${position.symbol} 合約月份${monthDistance < 0 ? "已過" : "接近"}`,
                `契約月份為 ${position.contractExpiry}，請確認轉倉或結算安排。`,
              ),
            );
          }
        }
      }
    }
  }

  for (const loan of latest.loans) {
    calculatedLiabilities = calculatedLiabilities.plus(loan.valueTwd);
    if (loan.currency !== "TWD" && !loan.fxRate) {
      findings.push(
        finding(
          `loan-fx-${loan.id}`,
          "completeness",
          "critical",
          `${loan.name} 缺少 ${loan.currency} 匯率`,
          "此外幣負債無法可靠換算為新臺幣。",
        ),
      );
    }
    const dueDate =
      loan.nextPaymentDate ??
      (loan.paymentDayOfMonth
        ? nextPaymentDate(loan.paymentDayOfMonth, now)
        : null);
    if (dueDate) {
      const daysUntilDue = Math.ceil(dayNumber(dueDate) - dayNumber(now));
      if (daysUntilDue <= 7) {
        findings.push(
          finding(
            `loan-due-${loan.id}-${dueDate.slice(0, 10)}`,
            "action",
            daysUntilDue < 0 ? "critical" : "warning",
            `${loan.name}${daysUntilDue < 0 ? "還款日已過" : "即將還款"}`,
            daysUntilDue < 0
              ? `原定還款日為 ${dueDate.slice(0, 10)}，請確認是否已完成。`
              : `距離還款日 ${dueDate.slice(0, 10)} 還有 ${daysUntilDue} 天。`,
          ),
        );
      }
    }
  }

  for (const account of latest.creditCardAccounts) {
    calculatedLiabilities = calculatedLiabilities.plus(
      account.liabilityValueTwd,
    );
    if (account.currency !== "TWD" && !account.fxRate) {
      findings.push(
        finding(
          `credit-card-fx-${account.creditCardAccountId}`,
          "completeness",
          "critical",
          `${account.name} 缺少 ${account.currency} 匯率`,
          "此外幣信用卡負債無法可靠換算為新臺幣。",
        ),
      );
    }
    if (!account.paymentDayOfMonth) {
      findings.push(
        finding(
          `credit-card-payment-day-${account.creditCardAccountId}`,
          "completeness",
          "warning",
          `${account.name}尚未設定每月繳款期限`,
          "請先在信用卡帳戶設定期限日；系統不會使用建立日期代替。",
        ),
      );
    } else {
      const daysUntilDue = Math.ceil(
        dayNumber(account.dueDate) - dayNumber(now),
      );
      if (decimal(account.statementOutstanding).gt(0) && daysUntilDue <= 7) {
        findings.push(
          finding(
            `credit-card-due-${account.creditCardAccountId}-${account.dueDate.slice(0, 10)}`,
            "action",
            daysUntilDue < 0 ? "critical" : "warning",
            `${account.name}${daysUntilDue < 0 ? "帳單已逾期" : "帳單即將到期"}`,
            daysUntilDue < 0
              ? `尚欠 ${account.currency} ${account.statementOutstanding}，原繳款截止日為 ${account.dueDate.slice(0, 10)}。`
              : `尚欠 ${account.currency} ${account.statementOutstanding}，距離 ${account.dueDate.slice(0, 10)} 還有 ${daysUntilDue} 天。`,
          ),
        );
      }
    }
    if (
      account.status === "active" &&
      account.paymentDayOfMonth &&
      (account.paymentStatus === "paid" || account.paymentStatus === "overpaid")
    ) {
      const nextDueDate = followingCreditCardDueDate(
        account.dueDate,
        account.paymentDayOfMonth,
      );
      if (nextDueDate) {
        const daysUntilNextDue = Math.ceil(
          dayNumber(nextDueDate) - dayNumber(now),
        );
        if (daysUntilNextDue <= 7) {
          findings.push(
            finding(
              `credit-card-update-${account.creditCardAccountId}-${nextDueDate.slice(0, 10)}`,
              "action",
              daysUntilNextDue < 0 ? "critical" : "warning",
              `${account.name}本月繳款狀況尚未更新`,
              daysUntilNextDue < 0
                ? `本期繳款期限 ${nextDueDate.slice(0, 10)} 已過，請補登繳款狀況。`
                : `本期繳款期限為 ${nextDueDate.slice(0, 10)}，請在 ${daysUntilNextDue} 天內更新繳款狀況。`,
            ),
          );
        }
      }
    }
    if (account.utilizationPct && decimal(account.utilizationPct).gte(80)) {
      findings.push(
        finding(
          `credit-card-utilization-${account.creditCardAccountId}`,
          "action",
          decimal(account.utilizationPct).gte(100) ? "critical" : "warning",
          `${account.name} 總應繳使用比例偏高`,
          `總應繳金額占共用額度 ${Number(account.utilizationPct).toFixed(1)}%。`,
        ),
      );
    }
  }

  const totalTolerance = decimal("0.01");
  const checkTotal = (
    id: string,
    label: string,
    calculated: ReturnType<typeof decimal>,
    stored: string,
  ) => {
    if (calculated.minus(stored).abs().gt(totalTolerance)) {
      findings.push(
        finding(
          id,
          "completeness",
          "critical",
          `${label}與明細加總不一致`,
          `明細為 NT$${money(calculated)}，快照總額為 NT$${money(stored)}。`,
        ),
      );
    }
  };
  checkTotal("cash-total", "現金總額", calculatedCash, latest.totalCashTwd);
  checkTotal(
    "securities-total",
    "證券市值",
    calculatedSecurities,
    latest.totalSecuritiesTwd,
  );
  checkTotal(
    "liabilities-total",
    "負債總額",
    calculatedLiabilities,
    latest.totalLiabilitiesTwd,
  );

  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  findings.sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity],
  );

  return {
    lastUpdatedAt: latest.capturedAt,
    daysSinceUpdate,
    freshnessTone,
    freshnessLabel:
      daysSinceUpdate === 0
        ? "今天已更新"
        : daysSinceUpdate <= 45
          ? `${daysSinceUpdate} 天前更新`
          : daysSinceUpdate < 180
            ? `${daysSinceUpdate} 天未更新`
            : `已 ${daysSinceUpdate} 天未更新`,
    shouldWarnOnOpen: daysSinceUpdate >= 180,
    findings,
  };
}
