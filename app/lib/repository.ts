import { randomUUID } from "node:crypto";
import {
  accountNameKey,
  accountReferenceKey,
  canonicalizeAccountName,
  canonicalizeInstitution,
  canonicalizeLoanName,
  institutionKey,
  loanNameKey,
} from "./account-identity";
import type { FinanceDatabase } from "./db";
import {
  calculateFuturesPosition,
  calculatePosition,
  decimal,
  money,
  shares,
  zero,
} from "./finance";
import { getDatabase, withTransaction } from "./db";
import { buildHealthReport } from "./health";
import { getDataOwner } from "./data-owner";
import type {
  AccountStateInput,
  AccountView,
  CreditCardAccountInput,
  CreditCardAccountView,
  CreditCardPaymentStatus,
  CreditCardTrendPoint,
  DashboardData,
  FxRateInput,
  LoanInput,
  LoanView,
  PositionInput,
  PositionView,
  SaleView,
  SnapshotCashFlowView,
  SnapshotChangeBreakdown,
  SnapshotCreateInput,
  SnapshotDetail,
  SnapshotSummary,
} from "./types";

type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "");
const nullableText = (value: unknown) =>
  value === null || value === undefined ? null : String(value);

function snapshotSummary(row: Row): SnapshotSummary {
  return {
    id: text(row.id),
    capturedAt: text(row.captured_at),
    rawInput: text(row.raw_input),
    totalCashTwd: text(row.total_cash_twd),
    totalSecuritiesTwd: text(row.total_securities_twd),
    totalAssetValueTwd: text(row.total_asset_value_twd),
    totalLiabilitiesTwd: text(row.total_liabilities_twd),
    totalCreditCardLiabilitiesTwd: text(row.total_credit_card_liabilities_twd),
    totalCreditCardCreditsTwd: text(row.total_credit_card_credits_twd),
    netWorthTwd: text(row.net_worth_twd),
    totalCostTwd: text(row.total_cost_twd),
    unrealizedPnlTwd: text(row.unrealized_pnl_twd),
  };
}

function creditCardPaymentStatus(
  statementAmount: string,
  paymentAmount: string,
  overpaymentBalance: string,
  dueDate: string,
  capturedAt: string,
): CreditCardPaymentStatus {
  const statement = decimal(statementAmount);
  const payment = decimal(paymentAmount);
  const difference = statement.minus(payment);
  const outstanding = difference.gt(0) ? difference : zero;
  if (decimal(overpaymentBalance).gt(0) || payment.gt(statement))
    return "overpaid";
  if (statement.isZero()) return "no_statement";
  if (outstanding.gt(0) && Date.parse(dueDate) < Date.parse(capturedAt))
    return "overdue";
  if (payment.isZero()) return "unpaid";
  if (payment.lt(statement)) return "partially_paid";
  return "paid";
}

async function fxRateById(
  db: FinanceDatabase,
  id: string | null,
): Promise<FxRateInput | undefined> {
  if (!id) return undefined;
  const row = (await db
    .prepare("SELECT * FROM snapshot_fx_rates WHERE id = ?")
    .get(id)) as Row | undefined;
  if (!row) return undefined;
  return {
    baseCurrency: text(row.base_currency),
    quoteCurrency: "TWD",
    rate: text(row.rate),
    rateAsOf: text(row.rate_as_of),
    source: text(row.source) as FxRateInput["source"],
    status: text(row.status) as FxRateInput["status"],
    overriddenByUser: Boolean(row.overridden_by_user),
  };
}

export async function getSnapshotDetail(
  id: string,
  db?: FinanceDatabase,
): Promise<SnapshotDetail | null> {
  db ??= await getDatabase();
  const ownerKey = getDataOwner().key;
  const snapshot = (await db
    .prepare("SELECT * FROM snapshots WHERE id = ? AND owner_key = ?")
    .get(id, ownerKey)) as Row | undefined;
  if (!snapshot) return null;

  const accountRows = (await db
    .prepare(
      "SELECT * FROM snapshot_accounts WHERE snapshot_id = ? ORDER BY sort_order, name",
    )
    .all(id)) as Row[];
  const accounts: AccountView[] = await Promise.all(
    accountRows.map(async (account) => {
      const snapshotAccountId = text(account.id);
      const balances = (await db
        .prepare(
          `SELECT * FROM cash_balances WHERE snapshot_account_id = ?
        ORDER BY CASE WHEN currency = 'TWD' THEN 0 ELSE 1 END, currency`,
        )
        .all(snapshotAccountId)) as Row[];
      const positions = (await db
        .prepare(
          `SELECT sp.*, s.provider_symbol FROM snapshot_positions sp
        JOIN securities s ON s.id = sp.security_id
        WHERE sp.snapshot_account_id = ? ORDER BY sp.security_name, sp.symbol`,
        )
        .all(snapshotAccountId)) as Row[];
      return {
        accountId: text(account.account_id),
        name: text(account.name),
        institution: nullableText(account.institution),
        accountType: text(account.account_type) as AccountView["accountType"],
        accountReference: nullableText(account.account_reference),
        defaultCurrency: text(account.default_currency),
        cashBalances: await Promise.all(
          balances.map(async (balance) => ({
            currency: text(balance.currency),
            amount: text(balance.amount),
            fxRate: await fxRateById(db, nullableText(balance.fx_rate_id)),
          })),
        ),
        positions: await Promise.all(
          positions.map(async (position): Promise<PositionView> => ({
            id: text(position.id),
            positionId: text(position.position_id),
            securityId: text(position.security_id),
            accountId: text(account.account_id),
            accountName: text(account.name),
            market: text(position.market) as PositionView["market"],
            exchange: null,
            symbol: text(position.symbol),
            providerSymbol: text(position.provider_symbol),
            name: text(position.security_name),
            securityType: text(
              position.security_type,
            ) as PositionView["securityType"],
            positionSide:
              (nullableText(position.position_side) as
                PositionView["positionSide"] | null) ?? undefined,
            contractMultiplier:
              nullableText(position.contract_multiplier) ?? undefined,
            contractExpiry: nullableText(position.contract_expiry) ?? undefined,
            quoteCurrency: text(position.quote_currency),
            quantity: text(position.quantity),
            averageCost: text(position.average_cost),
            marketPrice: text(position.market_price),
            quoteAsOf: text(position.quote_as_of),
            quoteSource: text(
              position.quote_source,
            ) as PositionView["quoteSource"],
            quoteStatus: text(
              position.quote_status,
            ) as PositionView["quoteStatus"],
            quoteNote: nullableText(position.quote_note),
            fxRate: await fxRateById(db, nullableText(position.fx_rate_id)),
            costValueTwd: text(position.cost_value_twd),
            marketValueTwd: text(position.market_value_twd),
            unrealizedPnlTwd: text(position.unrealized_pnl_twd),
            unrealizedReturnPct: nullableText(position.unrealized_return_pct),
          })),
        ),
      };
    }),
  );
  const loanRows = (await db
    .prepare(
      `SELECT sl.*, sa.account_id AS linked_account_id,
      sa.name AS linked_account_name
      FROM snapshot_loans sl
      LEFT JOIN snapshot_accounts sa ON sa.id = sl.snapshot_account_id
      WHERE sl.snapshot_id = ? ORDER BY sl.sort_order, sl.name`,
    )
    .all(id)) as Row[];
  const loans: LoanView[] = await Promise.all(
    loanRows.map(async (loan) => ({
      id: text(loan.id),
      loanId: text(loan.loan_id),
      accountId: nullableText(loan.linked_account_id),
      accountName: nullableText(loan.linked_account_name),
      name: text(loan.name),
      institution: nullableText(loan.institution),
      loanType: text(loan.loan_type) as LoanView["loanType"],
      currency: text(loan.currency),
      originalPrincipal: nullableText(loan.original_principal),
      outstandingPrincipal: text(loan.outstanding_principal),
      annualInterestRate: nullableText(loan.annual_interest_rate),
      rateType:
        (nullableText(loan.rate_type) as LoanView["rateType"] | null) ?? null,
      monthlyPayment: nullableText(loan.monthly_payment),
      paymentDayOfMonth:
        loan.payment_day_of_month === null ||
        loan.payment_day_of_month === undefined
          ? null
          : Number(loan.payment_day_of_month),
      nextPaymentDate: nullableText(loan.next_payment_date),
      startDate: nullableText(loan.start_date),
      endDate: nullableText(loan.end_date),
      note: nullableText(loan.note),
      fxRate: await fxRateById(db, nullableText(loan.fx_rate_id)),
      valueTwd: text(loan.value_twd),
    })),
  );
  const creditCardRows = (await db
    .prepare(
      `SELECT * FROM snapshot_credit_card_accounts
      WHERE snapshot_id = ? ORDER BY sort_order, name`,
    )
    .all(id)) as Row[];
  const creditCardAccounts: CreditCardAccountView[] = await Promise.all(
    creditCardRows.map(async (account) => {
      const accountId = text(account.credit_card_account_id);
      const cards = (
        (await db
          .prepare(
            `SELECT * FROM credit_cards WHERE credit_card_account_id = ?
            ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'inactive' THEN 1 ELSE 2 END, name`,
          )
          .all(accountId)) as Row[]
      ).map((card) => ({
        cardId: text(card.id),
        name: text(card.name),
        lastFour: nullableText(card.last_four),
        network:
          (nullableText(card.network) as
            CreditCardAccountView["cards"][number]["network"] | null) ?? null,
        holderType:
          (nullableText(card.holder_type) as
            CreditCardAccountView["cards"][number]["holderType"] | null) ??
          null,
        status: text(
          card.status,
        ) as CreditCardAccountView["cards"][number]["status"],
        note: nullableText(card.note),
      }));
      const statementAmount = text(account.statement_amount);
      const paymentAmount = text(account.payment_amount);
      const overpaymentBalance = text(account.overpayment_balance);
      const dueDate = text(account.due_date);
      const paymentDate = nullableText(account.payment_date);
      return {
        id: text(account.id),
        creditCardAccountId: accountId,
        name: text(account.name),
        issuer: text(account.issuer),
        currency: text(account.currency),
        sharedCreditLimit: text(account.shared_credit_limit),
        statementDayOfMonth:
          account.statement_day_of_month === null
            ? null
            : Number(account.statement_day_of_month),
        paymentDayOfMonth:
          account.payment_day_of_month === null
            ? null
            : Number(account.payment_day_of_month),
        status: text(account.account_status) as CreditCardAccountView["status"],
        note: nullableText(account.note),
        cards,
        statementPeriod: text(account.statement_period),
        statementDate: text(account.statement_date),
        dueDate,
        statementAmount,
        paymentAmount,
        paymentDate,
        remainingInstallmentPrincipal: text(
          account.remaining_installment_principal,
        ),
        overpaymentBalance,
        fxRate: await fxRateById(db, nullableText(account.fx_rate_id)),
        statementOutstanding: text(account.statement_outstanding),
        utilizationPct: nullableText(account.utilization_pct),
        paymentStatus: creditCardPaymentStatus(
          statementAmount,
          paymentAmount,
          overpaymentBalance,
          dueDate,
          text(snapshot.captured_at),
        ),
        paidOnTime: paymentDate
          ? Date.parse(paymentDate) <= Date.parse(dueDate)
          : null,
        statementAmountTwd: text(account.statement_amount_twd),
        liabilityValueTwd: text(account.liability_value_twd),
        creditAssetValueTwd: text(account.credit_asset_value_twd),
      };
    }),
  );

  const accountsWithLoans = accounts.map((account) => ({
    ...account,
    loans: loans.filter((loan) => loan.accountId === account.accountId),
  }));
  const cashFlows = (
    (await db
      .prepare(
        "SELECT * FROM snapshot_cash_flows WHERE snapshot_id = ? ORDER BY sort_order, created_at",
      )
      .all(id)) as Row[]
  ).map((flow): SnapshotCashFlowView => ({
    id: text(flow.id),
    flowType: text(flow.flow_type) as SnapshotCashFlowView["flowType"],
    amountTwd: text(flow.amount_twd),
    note: nullableText(flow.note),
  }));
  const flowTotal = (type: SnapshotCashFlowView["flowType"]) =>
    cashFlows
      .filter((flow) => flow.flowType === type)
      .reduce((sum, flow) => sum.plus(flow.amountTwd), zero);
  const contribution = flowTotal("capital_contribution");
  const withdrawal = flowTotal("capital_withdrawal");
  const income = flowTotal("income");
  const feeTax = flowTotal("fee_tax");
  const otherNet = flowTotal("other_inflow").minus(flowTotal("other_outflow"));
  const previous = snapshot.base_snapshot_id
    ? ((await db
        .prepare(
          `SELECT total_asset_value_twd, total_liabilities_twd, net_worth_twd
          FROM snapshots WHERE id = ? AND owner_key = ?`,
        )
        .get(text(snapshot.base_snapshot_id), ownerKey)) as Row | undefined)
    : undefined;
  const assetChange = previous
    ? decimal(text(snapshot.total_asset_value_twd)).minus(
        text(previous.total_asset_value_twd),
      )
    : null;
  const changeBreakdown: SnapshotChangeBreakdown = {
    previousNetWorthTwd: previous ? text(previous.net_worth_twd) : null,
    netWorthChangeTwd: previous
      ? money(
          decimal(text(snapshot.net_worth_twd)).minus(
            text(previous.net_worth_twd),
          ),
        )
      : null,
    assetChangeTwd: assetChange ? money(assetChange) : null,
    liabilityReductionTwd: previous
      ? money(
          decimal(text(previous.total_liabilities_twd)).minus(
            text(snapshot.total_liabilities_twd),
          ),
        )
      : null,
    capitalContributionTwd: money(contribution),
    capitalWithdrawalTwd: money(withdrawal),
    incomeTwd: money(income),
    feeTaxTwd: money(feeTax),
    otherNetFlowTwd: money(otherNet),
    marketAndFxTwd: assetChange
      ? money(
          assetChange
            .minus(contribution)
            .plus(withdrawal)
            .minus(income)
            .plus(feeTax)
            .minus(otherNet),
        )
      : null,
  };

  return {
    ...snapshotSummary(snapshot),
    rawInput: text(snapshot.raw_input),
    baseSnapshotId: nullableText(snapshot.base_snapshot_id),
    accounts: accountsWithLoans,
    loans,
    creditCardAccounts,
    cashFlows,
    changeBreakdown,
  };
}

export async function getLatestSnapshot(
  db?: FinanceDatabase,
): Promise<SnapshotDetail | null> {
  db ??= await getDatabase();
  const ownerKey = getDataOwner().key;
  const row = (await db
    .prepare(
      "SELECT id FROM snapshots WHERE owner_key = ? ORDER BY captured_at DESC, created_at DESC LIMIT 1",
    )
    .get(ownerKey)) as Row | undefined;
  return row ? await getSnapshotDetail(text(row.id), db) : null;
}

export async function listSnapshotSummaries(
  limit = 100,
  db?: FinanceDatabase,
): Promise<SnapshotSummary[]> {
  db ??= await getDatabase();
  const ownerKey = getDataOwner().key;
  return (
    (await db
      .prepare(
        "SELECT * FROM snapshots WHERE owner_key = ? ORDER BY captured_at DESC, created_at DESC LIMIT ?",
      )
      .all(ownerKey, limit)) as Row[]
  ).map(snapshotSummary);
}

async function ensureFxRate(
  db: FinanceDatabase,
  snapshotId: string,
  fx: FxRateInput | undefined,
  currency: string,
  cache: Map<string, { id: string; rate: string }>,
): Promise<{ id: string | null; rate: string }> {
  if (currency === "TWD") return { id: null, rate: "1" };
  const cached = cache.get(currency);
  if (cached) return cached;
  if (!fx) throw new Error(`${currency} 缺少 TWD 匯率`);
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO snapshot_fx_rates(
    id, snapshot_id, base_currency, quote_currency, rate, rate_as_of,
    source, status, overridden_by_user, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      snapshotId,
      fx.baseCurrency,
      fx.quoteCurrency,
      fx.rate,
      new Date(fx.rateAsOf).toISOString(),
      fx.source,
      fx.status,
      fx.overriddenByUser ? 1 : 0,
      new Date().toISOString(),
    );
  cache.set(currency, { id, rate: fx.rate });
  return { id, rate: fx.rate };
}

async function findOrCreateAccount(
  db: FinanceDatabase,
  input: AccountStateInput,
  now: string,
  active: Row[],
): Promise<string> {
  const ownerKey = getDataOwner().key;
  if (input.accountId) {
    const found = await db
      .prepare("SELECT id FROM accounts WHERE id = ? AND owner_key = ?")
      .get(input.accountId, ownerKey);
    if (!found) throw new Error(`找不到帳戶：${input.name}`);
    await db
      .prepare(
        `UPDATE accounts SET name = ?, institution = ?, account_type = ?,
      account_reference = ?, default_currency = ?, archived_at = NULL, updated_at = ?
      WHERE id = ? AND owner_key = ?`,
      )
      .run(
        input.name,
        input.institution ?? null,
        input.accountType,
        input.accountReference ?? null,
        input.defaultCurrency,
        now,
        input.accountId,
        ownerKey,
      );
    const cached = active.find((row) => text(row.id) === input.accountId);
    const updated = {
      id: input.accountId,
      name: input.name,
      institution: input.institution ?? null,
      account_reference: input.accountReference ?? null,
    };
    if (cached) Object.assign(cached, updated);
    else active.push(updated);
    return input.accountId;
  }
  const reference = accountReferenceKey(input.accountReference);
  const institution = institutionKey(input.institution);
  const chooseOne = (candidates: Row[], reason: string) => {
    if (candidates.length > 1)
      throw new Error(
        `${input.name} 符合多個既有帳戶（${reason}），請使用既有帳戶名稱並填寫帳戶識別碼。`,
      );
    return candidates[0] ? text(candidates[0].id) : null;
  };
  if (reference) {
    const matched = chooseOne(
      active.filter(
        (row) =>
          accountReferenceKey(nullableText(row.account_reference)) ===
            reference &&
          (!institution ||
            institutionKey(nullableText(row.institution)) === institution),
      ),
      "帳戶識別碼相同",
    );
    if (matched) return matched;
  }
  const matchedByName = chooseOne(
    active.filter(
      (row) =>
        accountNameKey(text(row.name)) === accountNameKey(input.name) &&
        (!institution ||
          !institutionKey(nullableText(row.institution)) ||
          institutionKey(nullableText(row.institution)) === institution),
    ),
    "帳戶名稱相同",
  );
  if (matchedByName) return matchedByName;
  if (institution && !reference) {
    const sameInstitution = active.filter(
      (row) => institutionKey(nullableText(row.institution)) === institution,
    );
    if (sameInstitution.length > 0) {
      const names = sameInstitution.map((row) => text(row.name)).join("、");
      throw new Error(
        `${input.institution} 已有帳戶（${names}），但無法確認是否為同一帳戶；請使用既有帳戶名稱，或為不同帳戶填寫帳戶識別碼。`,
      );
    }
  }
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO accounts(id, owner_key, name, institution, account_type, account_reference,
    default_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      ownerKey,
      input.name,
      input.institution ?? null,
      input.accountType,
      input.accountReference ?? null,
      input.defaultCurrency,
      now,
      now,
    );
  active.push({
    id,
    name: input.name,
    institution: input.institution ?? null,
    account_reference: input.accountReference ?? null,
  });
  return id;
}

async function findOrCreateSecurity(
  db: FinanceDatabase,
  input: PositionInput,
  now: string,
  cache: Map<string, string>,
): Promise<string> {
  const symbol = input.symbol.toUpperCase();
  const cacheKey = `${input.market}:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    await db
      .prepare(
        `UPDATE securities SET exchange = ?, provider_symbol = ?, name = ?, security_type = ?,
      quote_currency = ?, archived_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.exchange ?? null,
        input.providerSymbol ?? symbol,
        input.name,
        input.securityType,
        input.quoteCurrency,
        now,
        cached,
      );
    return cached;
  }
  const found = (await db
    .prepare("SELECT id FROM securities WHERE market = ? AND symbol = ?")
    .get(input.market, symbol)) as Row | undefined;
  if (found) {
    const id = text(found.id);
    await db
      .prepare(
        `UPDATE securities SET exchange = ?, provider_symbol = ?, name = ?, security_type = ?,
      quote_currency = ?, archived_at = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.exchange ?? null,
        input.providerSymbol ?? symbol,
        input.name,
        input.securityType,
        input.quoteCurrency,
        now,
        id,
      );
    cache.set(cacheKey, id);
    return id;
  }
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO securities(id, market, exchange, symbol, provider_symbol, name,
    security_type, quote_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.market,
      input.exchange ?? null,
      symbol,
      input.providerSymbol ?? symbol,
      input.name,
      input.securityType,
      input.quoteCurrency,
      now,
      now,
    );
  cache.set(cacheKey, id);
  return id;
}

async function findOrCreatePosition(
  db: FinanceDatabase,
  input: PositionInput,
  accountId: string,
  securityId: string,
  capturedAt: string,
  now: string,
): Promise<string> {
  const ownerKey = getDataOwner().key;
  if (input.positionId) {
    const found = await db
      .prepare(
        `SELECT position.id FROM account_positions position
        JOIN accounts account ON account.id = position.account_id
        WHERE position.id = ? AND position.status = 'active' AND account.owner_key = ?`,
      )
      .get(input.positionId, ownerKey);
    if (!found) throw new Error(`持倉已售出或不存在：${input.symbol}`);
    return input.positionId;
  }
  const active = (await db
    .prepare(
      "SELECT id FROM account_positions WHERE account_id = ? AND security_id = ? AND status = 'active'",
    )
    .get(accountId, securityId)) as Row | undefined;
  if (active) return text(active.id);
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO account_positions(id, account_id, security_id, status,
    first_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`,
    )
    .run(id, accountId, securityId, capturedAt, now, now);
  return id;
}

async function findOrCreateLoan(
  db: FinanceDatabase,
  input: LoanInput,
  now: string,
): Promise<string> {
  const ownerKey = getDataOwner().key;
  if (input.loanId) {
    const found = await db
      .prepare("SELECT id FROM loans WHERE id = ? AND owner_key = ?")
      .get(input.loanId, ownerKey);
    if (!found) throw new Error(`找不到貸款：${input.name}`);
    await db
      .prepare(
        `UPDATE loans SET account_id = ?, name = ?, institution = ?, loan_type = ?, currency = ?,
      archived_at = ?, updated_at = ? WHERE id = ? AND owner_key = ?`,
      )
      .run(
        input.accountId ?? null,
        input.name,
        input.institution ?? null,
        input.loanType,
        input.currency,
        decimal(input.outstandingPrincipal).isZero() ? now : null,
        now,
        input.loanId,
        ownerKey,
      );
    return input.loanId;
  }
  const institution = institutionKey(input.institution);
  const matching = (
    (await db
      .prepare(
        `SELECT id, account_id, name, institution, currency FROM loans
        WHERE archived_at IS NULL AND owner_key = ?`,
      )
      .all(ownerKey)) as Row[]
  ).filter(
    (row) =>
      (!input.accountId ||
        !nullableText(row.account_id) ||
        nullableText(row.account_id) === input.accountId) &&
      institutionKey(nullableText(row.institution)) === institution &&
      loanNameKey(text(row.name), nullableText(row.institution)) ===
        loanNameKey(input.name, input.institution) &&
      text(row.currency) === input.currency,
  );
  if (matching.length > 1)
    throw new Error(
      `${input.name} 符合多筆既有貸款，請從既有紀錄更新，不要建立新貸款。`,
    );
  if (matching[0]) return text(matching[0].id);
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO loans(id, owner_key, account_id, name, institution, loan_type, currency, archived_at,
    created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      ownerKey,
      input.accountId ?? null,
      input.name,
      input.institution ?? null,
      input.loanType,
      input.currency,
      decimal(input.outstandingPrincipal).isZero() ? now : null,
      now,
      now,
    );
  return id;
}

async function findOrCreateCreditCardAccount(
  db: FinanceDatabase,
  input: CreditCardAccountInput,
  now: string,
): Promise<string> {
  const ownerKey = getDataOwner().key;
  if (input.creditCardAccountId) {
    const found = await db
      .prepare(
        "SELECT id FROM credit_card_accounts WHERE id = ? AND owner_key = ?",
      )
      .get(input.creditCardAccountId, ownerKey);
    if (!found) throw new Error(`找不到信用卡帳戶：${input.name}`);
    await db
      .prepare(
        `UPDATE credit_card_accounts SET name = ?, issuer = ?, currency = ?,
      shared_credit_limit = ?, statement_day_of_month = ?, payment_day_of_month = ?,
      status = ?, note = ?, archived_at = ?, updated_at = ?
      WHERE id = ? AND owner_key = ?`,
      )
      .run(
        input.name,
        input.issuer,
        input.currency,
        input.sharedCreditLimit,
        input.statementDayOfMonth ?? null,
        input.paymentDayOfMonth ?? null,
        input.status,
        input.note ?? null,
        input.status === "closed" ? now : null,
        now,
        input.creditCardAccountId,
        ownerKey,
      );
    return input.creditCardAccountId;
  }
  const found = (await db
    .prepare(
      `SELECT id FROM credit_card_accounts
      WHERE lower(name) = lower(?) AND lower(issuer) = lower(?) AND currency = ?
      AND owner_key = ?
      ORDER BY archived_at IS NULL DESC LIMIT 1`,
    )
    .get(input.name, input.issuer, input.currency, ownerKey)) as
    Row | undefined;
  if (found) return text(found.id);
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO credit_card_accounts(
      id, owner_key, name, issuer, currency, shared_credit_limit, statement_day_of_month,
      payment_day_of_month, status, note, archived_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      ownerKey,
      input.name,
      input.issuer,
      input.currency,
      input.sharedCreditLimit,
      input.statementDayOfMonth ?? null,
      input.paymentDayOfMonth ?? null,
      input.status,
      input.note ?? null,
      input.status === "closed" ? now : null,
      now,
      now,
    );
  return id;
}

async function findOrCreateCreditCard(
  db: FinanceDatabase,
  accountId: string,
  input: CreditCardAccountInput["cards"][number],
  now: string,
): Promise<string> {
  if (input.cardId) {
    const found = await db
      .prepare(
        "SELECT id FROM credit_cards WHERE id = ? AND credit_card_account_id = ?",
      )
      .get(input.cardId, accountId);
    if (!found) throw new Error(`找不到實體信用卡：${input.name}`);
    await db
      .prepare(
        `UPDATE credit_cards SET name = ?, last_four = ?, network = ?, holder_type = ?,
      status = ?, note = ?, archived_at = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        input.name,
        input.lastFour ?? null,
        input.network ?? null,
        input.holderType ?? null,
        input.status,
        input.note ?? null,
        input.status === "closed" ? now : null,
        now,
        input.cardId,
      );
    return input.cardId;
  }
  const found = input.lastFour
    ? ((await db
        .prepare(
          `SELECT id FROM credit_cards
          WHERE credit_card_account_id = ? AND last_four = ? LIMIT 1`,
        )
        .get(accountId, input.lastFour)) as Row | undefined)
    : ((await db
        .prepare(
          `SELECT id FROM credit_cards
          WHERE credit_card_account_id = ? AND lower(name) = lower(?) LIMIT 1`,
        )
        .get(accountId, input.name)) as Row | undefined);
  if (found) return text(found.id);
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO credit_cards(
      id, credit_card_account_id, name, last_four, network, holder_type,
      status, note, archived_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      accountId,
      input.name,
      input.lastFour ?? null,
      input.network ?? null,
      input.holderType ?? null,
      input.status,
      input.note ?? null,
      input.status === "closed" ? now : null,
      now,
      now,
    );
  return id;
}

function creditCardViewToInput(
  account: CreditCardAccountView,
): CreditCardAccountInput {
  return {
    creditCardAccountId: account.creditCardAccountId,
    name: account.name,
    issuer: account.issuer,
    currency: account.currency,
    sharedCreditLimit: account.sharedCreditLimit,
    statementDayOfMonth: account.statementDayOfMonth,
    paymentDayOfMonth: account.paymentDayOfMonth,
    status: account.status,
    note: account.note,
    cards: account.cards.map((card) => ({ ...card })),
    statementPeriod: account.statementPeriod,
    statementDate: account.statementDate,
    dueDate: account.dueDate,
    statementAmount: account.statementAmount,
    paymentAmount: account.paymentAmount,
    paymentDate: account.paymentDate,
    remainingInstallmentPrincipal: account.remainingInstallmentPrincipal,
    overpaymentBalance: account.overpaymentBalance,
    fxRate: account.fxRate,
  };
}

function normalizeSnapshotIdentities(
  input: SnapshotCreateInput,
): SnapshotCreateInput {
  return {
    ...input,
    accounts: input.accounts.map((account) => ({
      ...account,
      name: canonicalizeAccountName(account.name),
      institution: canonicalizeInstitution(account.institution),
      accountReference: account.accountReference?.trim() || null,
    })),
    loans: (input.loans ?? []).map((loan) => {
      const institution = canonicalizeInstitution(loan.institution);
      return {
        ...loan,
        accountName: loan.accountName
          ? canonicalizeAccountName(loan.accountName)
          : null,
        institution,
        name: canonicalizeLoanName(loan.name, institution),
      };
    }),
    creditCardAccounts: input.creditCardAccounts?.map((account) => ({
      ...account,
      name: account.name.trim(),
      issuer: account.issuer.trim(),
      note: account.note?.trim() || null,
      cards: account.cards.map((card) => ({
        ...card,
        name: card.name.trim(),
        lastFour: card.lastFour?.trim() || null,
        note: card.note?.trim() || null,
      })),
    })),
  };
}

function assertNoDuplicateIdentities(input: SnapshotCreateInput) {
  const accountKeys = new Set<string>();
  const unidentifiedInstitutions = new Map<string, string>();
  for (const account of input.accounts) {
    const reference = accountReferenceKey(account.accountReference);
    const institution = institutionKey(account.institution);
    const key = account.accountId
      ? `id:${account.accountId}`
      : reference
        ? `reference:${institution}:${reference}`
        : `name:${institution}:${accountNameKey(account.name)}`;
    if (accountKeys.has(key))
      throw new Error(
        `偵測到重複帳戶：${account.name}；請合併後再儲存，避免資產重複計算。`,
      );
    accountKeys.add(key);
    if (!account.accountId && !reference && institution) {
      const previous = unidentifiedInstitutions.get(institution);
      if (previous && accountNameKey(previous) !== accountNameKey(account.name))
        throw new Error(
          `${account.institution} 有多個無法區分的帳戶（${previous}、${account.name}）；請分別填寫帳戶識別碼。`,
        );
      unidentifiedInstitutions.set(institution, account.name);
    }
  }

  const loanKeys = new Set<string>();
  for (const loan of input.loans ?? []) {
    const key = loan.loanId
      ? `id:${loan.loanId}`
      : `${loan.accountId ?? accountNameKey(loan.accountName ?? "")}:${institutionKey(loan.institution)}:${loanNameKey(loan.name, loan.institution)}:${loan.currency}`;
    if (loanKeys.has(key))
      throw new Error(
        `偵測到重複貸款：${loan.name}；請合併後再儲存，避免負債重複扣除。`,
      );
    loanKeys.add(key);
  }
  const creditCardKeys = new Set<string>();
  for (const account of input.creditCardAccounts ?? []) {
    const key = account.creditCardAccountId
      ? `id:${account.creditCardAccountId}`
      : `${institutionKey(account.issuer)}:${account.name.trim().toLocaleLowerCase("zh-TW")}:${account.currency}`;
    if (creditCardKeys.has(key))
      throw new Error(`偵測到重複信用卡帳戶：${account.name}`);
    creditCardKeys.add(key);
  }
}

async function createSnapshotInDb(
  db: FinanceDatabase,
  rawInput: SnapshotCreateInput,
): Promise<string> {
  const ownerKey = getDataOwner().key;
  const inheritedCreditCards =
    rawInput.creditCardAccounts === undefined && rawInput.baseSnapshotId
      ? ((
          await getSnapshotDetail(rawInput.baseSnapshotId, db)
        )?.creditCardAccounts.map(creditCardViewToInput) ?? [])
      : rawInput.creditCardAccounts;
  const input = normalizeSnapshotIdentities({
    ...rawInput,
    creditCardAccounts: inheritedCreditCards,
  });
  assertNoDuplicateIdentities(input);
  const id = randomUUID();
  const now = new Date().toISOString();
  const capturedAt = input.capturedAt
    ? new Date(input.capturedAt).toISOString()
    : now;
  await db
    .prepare(
      `INSERT INTO snapshots(
    id, owner_key, captured_at, base_snapshot_id, raw_input, parser_model, parser_schema_version,
    total_cash_twd, total_securities_twd, total_asset_value_twd,
    total_liabilities_twd, net_worth_twd, total_cost_twd,
    unrealized_pnl_twd, created_at, updated_at
  ) SELECT ?, ?, ?, ?, ?, 'deterministic-rules', 2, '0', '0', '0', '0', '0', '0', '0', ?, ?
    WHERE ? IS NULL OR ? = (
      SELECT latest.id FROM snapshots latest
      WHERE latest.owner_key = ?
      ORDER BY latest.captured_at DESC, latest.created_at DESC LIMIT 1
    )`,
    )
    .run(
      id,
      ownerKey,
      capturedAt,
      input.baseSnapshotId ?? null,
      input.rawInput,
      now,
      now,
      input.baseSnapshotId ?? null,
      input.baseSnapshotId ?? null,
      ownerKey,
    );

  const fxCache = new Map<string, { id: string; rate: string }>();
  const securityCache = new Map<string, string>();
  const accountCache = (await db
    .prepare(
      `SELECT id, name, institution, account_reference FROM accounts
      WHERE archived_at IS NULL AND owner_key = ?`,
    )
    .all(ownerKey)) as Row[];
  let totalCash = zero;
  let totalSecurities = zero;
  let totalCost = zero;
  let totalPnl = zero;
  let totalLiabilities = zero;
  let totalCreditCardLiabilities = zero;
  let totalCreditCardCredits = zero;
  const snapshotAccountLinks: Array<{
    accountId: string;
    snapshotAccountId: string;
    name: string;
    institution?: string | null;
  }> = [];

  for (const [index, account] of input.accounts.entries()) {
    if (account.accountType === "cash" && account.positions.length > 0) {
      throw new Error(`現金帳戶不能包含投資品項：${account.name}`);
    }
    const accountId = await findOrCreateAccount(db, account, now, accountCache);
    const snapshotAccountId = randomUUID();
    snapshotAccountLinks.push({
      accountId,
      snapshotAccountId,
      name: account.name,
      institution: account.institution,
    });
    await db
      .prepare(
        `INSERT INTO snapshot_accounts(
      id, snapshot_id, account_id, name, institution, account_type,
      account_reference, default_currency, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshotAccountId,
        id,
        accountId,
        account.name,
        account.institution ?? null,
        account.accountType,
        account.accountReference ?? null,
        account.defaultCurrency,
        index,
      );

    for (const balance of account.cashBalances) {
      const fx = await ensureFxRate(
        db,
        id,
        balance.fxRate,
        balance.currency,
        fxCache,
      );
      const valueTwd = decimal(balance.amount).mul(fx.rate);
      totalCash = totalCash.plus(valueTwd);
      await db
        .prepare(
          `INSERT INTO cash_balances(
        id, snapshot_account_id, currency, amount, fx_rate_id, value_twd
      ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          snapshotAccountId,
          balance.currency,
          balance.amount,
          fx.id,
          money(valueTwd),
        );
    }

    for (const position of account.positions) {
      if ((position.securityType === "fund") !== (position.market === "FUND")) {
        throw new Error(`基金類型與市場不一致：${position.name}`);
      }
      if (
        (position.securityType === "future") !==
        (position.market === "FUTURES")
      ) {
        throw new Error(`期貨類型與市場不一致：${position.name}`);
      }
      const securityId = await findOrCreateSecurity(
        db,
        position,
        now,
        securityCache,
      );
      const positionId = await findOrCreatePosition(
        db,
        position,
        accountId,
        securityId,
        capturedAt,
        now,
      );
      const fx = await ensureFxRate(
        db,
        id,
        position.fxRate,
        position.quoteCurrency,
        fxCache,
      );
      const calculated =
        position.securityType === "future"
          ? calculateFuturesPosition(
              position.quantity,
              position.averageCost,
              position.marketPrice,
              position.contractMultiplier ?? "0",
              position.positionSide ?? "long",
              fx.rate,
            )
          : calculatePosition(
              position.quantity,
              position.averageCost,
              position.marketPrice,
              fx.rate,
            );
      totalSecurities = totalSecurities.plus(calculated.marketValueTwd);
      totalCost = totalCost.plus(calculated.costValueTwd);
      totalPnl = totalPnl.plus(calculated.unrealizedPnlTwd);
      await db
        .prepare(
          `INSERT INTO snapshot_positions(
        id, snapshot_account_id, position_id, security_id, market, symbol, security_name,
        security_type, position_side, contract_multiplier, contract_expiry,
        quote_currency, quantity, average_cost, market_price, quote_as_of,
        quote_source, quote_status, quote_note, fx_rate_id, cost_value_quote, market_value_quote,
        cost_value_twd, market_value_twd, unrealized_pnl_twd, unrealized_return_pct,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          snapshotAccountId,
          positionId,
          securityId,
          position.market,
          position.symbol.toUpperCase(),
          position.name,
          position.securityType,
          position.positionSide ?? null,
          position.contractMultiplier ?? null,
          position.contractExpiry ?? null,
          position.quoteCurrency,
          position.quantity,
          position.averageCost,
          position.marketPrice,
          new Date(position.quoteAsOf).toISOString(),
          position.quoteSource,
          position.quoteStatus,
          position.quoteNote ?? null,
          fx.id,
          calculated.costValueQuote,
          calculated.marketValueQuote,
          calculated.costValueTwd,
          calculated.marketValueTwd,
          calculated.unrealizedPnlTwd,
          calculated.unrealizedReturnPct,
          now,
          now,
        );
    }
  }

  for (const [index, loan] of (input.loans ?? []).entries()) {
    let linkedAccount = snapshotAccountLinks.find(
      (account) =>
        (loan.accountId && account.accountId === loan.accountId) ||
        (loan.accountName &&
          accountNameKey(account.name) === accountNameKey(loan.accountName)),
    );
    if (!linkedAccount && loan.institution) {
      const loanInstitution = institutionKey(loan.institution);
      const candidates = snapshotAccountLinks.filter((account) => {
        const accountInstitution = institutionKey(account.institution);
        return (
          accountInstitution.length > 0 &&
          (loanInstitution.includes(accountInstitution) ||
            accountInstitution.includes(loanInstitution) ||
            accountNameKey(account.name).includes(loanInstitution))
        );
      });
      if (candidates.length === 1) linkedAccount = candidates[0];
    }
    const loanId = await findOrCreateLoan(
      db,
      {
        ...loan,
        accountId: linkedAccount?.accountId ?? null,
        accountName: linkedAccount?.name ?? loan.accountName ?? null,
      },
      now,
    );
    const fx = await ensureFxRate(db, id, loan.fxRate, loan.currency, fxCache);
    const valueTwd = decimal(loan.outstandingPrincipal).mul(fx.rate);
    totalLiabilities = totalLiabilities.plus(valueTwd);
    await db
      .prepare(
        `INSERT INTO snapshot_loans(
      id, snapshot_id, snapshot_account_id, loan_id, name, institution, loan_type, currency,
      original_principal, outstanding_principal, annual_interest_rate, rate_type,
      monthly_payment, payment_day_of_month, next_payment_date, start_date, end_date, note,
      fx_rate_id, value_twd, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        id,
        linkedAccount?.snapshotAccountId ?? null,
        loanId,
        loan.name,
        loan.institution ?? null,
        loan.loanType,
        loan.currency,
        loan.originalPrincipal ?? null,
        loan.outstandingPrincipal,
        loan.annualInterestRate ?? null,
        loan.rateType ?? null,
        loan.monthlyPayment ?? null,
        loan.paymentDayOfMonth ?? null,
        loan.nextPaymentDate
          ? new Date(loan.nextPaymentDate).toISOString()
          : null,
        loan.startDate ? new Date(loan.startDate).toISOString() : null,
        loan.endDate ? new Date(loan.endDate).toISOString() : null,
        loan.note ?? null,
        fx.id,
        money(valueTwd),
        index,
        now,
        now,
      );
  }

  for (const [index, account] of (input.creditCardAccounts ?? []).entries()) {
    const accountId = await findOrCreateCreditCardAccount(db, account, now);
    for (const card of account.cards) {
      await findOrCreateCreditCard(db, accountId, card, now);
    }
    const fx = await ensureFxRate(
      db,
      id,
      account.fxRate,
      account.currency,
      fxCache,
    );
    const statement = decimal(account.statementAmount);
    const payment = decimal(account.paymentAmount);
    const paymentDifference = statement.minus(payment);
    const statementOutstanding = paymentDifference.gt(0)
      ? paymentDifference
      : zero;
    const netBalance = statementOutstanding
      .plus(account.remainingInstallmentPrincipal)
      .minus(account.overpaymentBalance);
    const liability = netBalance.gt(0) ? netBalance : zero;
    const creditAsset = netBalance.lt(0) ? netBalance.abs() : zero;
    const utilization = decimal(account.sharedCreditLimit).gt(0)
      ? statement
          .div(account.sharedCreditLimit)
          .mul(100)
          .toDecimalPlaces(6)
          .toString()
      : null;
    const statementAmountTwd = statement.mul(fx.rate);
    const liabilityValueTwd = liability.mul(fx.rate);
    const creditAssetValueTwd = creditAsset.mul(fx.rate);
    totalCreditCardLiabilities =
      totalCreditCardLiabilities.plus(liabilityValueTwd);
    totalCreditCardCredits = totalCreditCardCredits.plus(creditAssetValueTwd);
    totalLiabilities = totalLiabilities.plus(liabilityValueTwd);
    await db
      .prepare(
        `INSERT INTO snapshot_credit_card_accounts(
      id, snapshot_id, credit_card_account_id, name, issuer, currency,
      shared_credit_limit, statement_day_of_month, payment_day_of_month,
      account_status, note, statement_period, statement_date, due_date,
      statement_amount, payment_amount, payment_date,
      remaining_installment_principal, overpayment_balance,
      statement_outstanding, utilization_pct, fx_rate_id, statement_amount_twd,
      liability_value_twd, credit_asset_value_twd, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        id,
        accountId,
        account.name,
        account.issuer,
        account.currency,
        account.sharedCreditLimit,
        account.statementDayOfMonth ?? null,
        account.paymentDayOfMonth ?? null,
        account.status,
        account.note ?? null,
        account.statementPeriod,
        new Date(account.statementDate).toISOString(),
        new Date(account.dueDate).toISOString(),
        account.statementAmount,
        account.paymentAmount,
        account.paymentDate
          ? new Date(account.paymentDate).toISOString()
          : null,
        account.remainingInstallmentPrincipal,
        account.overpaymentBalance,
        money(statementOutstanding),
        utilization,
        fx.id,
        money(statementAmountTwd),
        money(liabilityValueTwd),
        money(creditAssetValueTwd),
        index,
        now,
        now,
      );
  }

  for (const [index, flow] of (input.cashFlows ?? []).entries()) {
    await db
      .prepare(
        `INSERT INTO snapshot_cash_flows(
      id, snapshot_id, flow_type, amount_twd, note, sort_order, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        id,
        flow.flowType,
        money(flow.amountTwd),
        flow.note ?? null,
        index,
        now,
      );
  }

  await db
    .prepare(
      `UPDATE snapshots SET total_cash_twd = ?, total_securities_twd = ?,
    total_asset_value_twd = ?, total_liabilities_twd = ?, net_worth_twd = ?,
    total_credit_card_liabilities_twd = ?, total_credit_card_credits_twd = ?,
    total_cost_twd = ?, unrealized_pnl_twd = ?, updated_at = ?
    WHERE id = ?`,
    )
    .run(
      money(totalCash),
      money(totalSecurities),
      money(totalCash.plus(totalSecurities).plus(totalCreditCardCredits)),
      money(totalLiabilities),
      money(
        totalCash
          .plus(totalSecurities)
          .plus(totalCreditCardCredits)
          .minus(totalLiabilities),
      ),
      money(totalCreditCardLiabilities),
      money(totalCreditCardCredits),
      money(totalCost),
      money(totalPnl),
      now,
      id,
    );
  await db
    .prepare(
      "INSERT INTO snapshot_commits(snapshot_id, committed_at) VALUES (?, ?)",
    )
    .run(id, now);
  return id;
}

export async function createSnapshot(
  input: SnapshotCreateInput,
): Promise<SnapshotDetail> {
  const id = await withTransaction(async (db) => createSnapshotInDb(db, input));
  const detail = await getSnapshotDetail(id);
  if (!detail) throw new Error("建立快照後無法讀取資料");
  return detail;
}

export async function listSales(db?: FinanceDatabase): Promise<SaleView[]> {
  db ??= await getDatabase();
  const ownerKey = getDataOwner().key;
  const rows = (await db
    .prepare(
      `SELECT ps.*, a.name AS account_name, settlement.name AS settlement_account_name,
      s.id AS security_id, s.symbol, s.name AS security_name
    FROM position_sales ps
    JOIN account_positions ap ON ap.id = ps.position_id
    JOIN accounts a ON a.id = ap.account_id
    JOIN securities s ON s.id = ap.security_id
    LEFT JOIN accounts settlement ON settlement.id = ps.settlement_account_id
    WHERE a.owner_key = ?
    ORDER BY ps.sold_at DESC, ps.created_at DESC`,
    )
    .all(ownerKey)) as Row[];
  return rows.map((row) => ({
    id: text(row.id),
    positionId: text(row.position_id),
    securityId: text(row.security_id),
    accountName: text(row.account_name),
    symbol: text(row.symbol),
    securityName: text(row.security_name),
    soldAt: text(row.sold_at),
    quantity: text(row.quantity),
    salePrice: nullableText(row.sale_price),
    currency: text(row.currency),
    settlementAccountId: nullableText(row.settlement_account_id),
    settlementAccountName: nullableText(row.settlement_account_name),
    fee: nullableText(row.fee),
    tax: nullableText(row.tax),
    grossProceeds: nullableText(row.gross_proceeds),
    netProceeds: nullableText(row.net_proceeds),
    costBasis: nullableText(row.cost_basis),
    realizedPnl: nullableText(row.realized_pnl),
    fxRate: nullableText(row.fx_rate),
    realizedPnlTwd: nullableText(row.realized_pnl_twd),
    note: nullableText(row.note),
  }));
}

function dateFromRange(range: string): string | null {
  if (range === "all") return null;
  const date = new Date();
  date.setMonth(date.getMonth() - (range === "1y" ? 12 : 6));
  return date.toISOString();
}

const taipeiDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dedupeDailyTrend(
  rows: Array<{ capturedAt: string; totalAssetValueTwd: string }>,
) {
  return dedupeLatestByTaipeiDay(rows);
}

function dedupeLatestByTaipeiDay<T extends { capturedAt: string }>(rows: T[]) {
  const latestByDay = new Map<string, T>();
  for (const row of rows) {
    const day = taipeiDay.format(new Date(row.capturedAt));
    const existing = latestByDay.get(day);
    if (!existing || row.capturedAt > existing.capturedAt) {
      latestByDay.set(day, row);
    }
  }
  return [...latestByDay.values()].sort((a, b) =>
    a.capturedAt.localeCompare(b.capturedAt),
  );
}

export async function getDashboard(range = "6m"): Promise<DashboardData> {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  const latest = await getLatestSnapshot(db);
  const history = await listSnapshotSummaries(100, db);
  const since = dateFromRange(range);
  const rows = since
    ? await db
        .prepare(
          "SELECT captured_at, net_worth_twd FROM snapshots WHERE owner_key = ? AND captured_at >= ? ORDER BY captured_at",
        )
        .all(ownerKey, since)
    : await db
        .prepare(
          "SELECT captured_at, net_worth_twd FROM snapshots WHERE owner_key = ? ORDER BY captured_at",
        )
        .all(ownerKey);
  return {
    latest,
    history,
    trend: dedupeDailyTrend(
      (rows as Row[]).map((row) => ({
        capturedAt: text(row.captured_at),
        totalAssetValueTwd: text(row.net_worth_twd),
      })),
    ),
    sold: await listSales(db),
    health: buildHealthReport(latest),
  };
}

export async function sellPosition(
  positionId: string,
  input: {
    soldAt: string;
    salePrice: string;
    currency: string;
    settlementAccountId: string;
    fee: string;
    tax: string;
    note?: string | null;
  },
): Promise<SnapshotDetail> {
  const resultId = await withTransaction(async (db) => {
    const ownerKey = getDataOwner().key;
    const lifecycle = (await db
      .prepare(
        `SELECT position.* FROM account_positions position
        JOIN accounts account ON account.id = position.account_id
        WHERE position.id = ? AND position.status = 'active' AND account.owner_key = ?`,
      )
      .get(positionId, ownerKey)) as Row | undefined;
    if (!lifecycle) throw new Error("持倉已售出或不存在");
    const latest = await getLatestSnapshot(db);
    if (!latest) throw new Error("沒有可供賣出的最新快照");
    const current = latest.accounts
      .flatMap((account) => account.positions)
      .find((position) => position.positionId === positionId);
    if (!current) throw new Error("最新快照中找不到這筆持倉");
    if (input.currency !== current.quoteCurrency)
      throw new Error("成交幣別必須與持倉報價幣別一致");
    const settlementAccount = latest.accounts.find(
      (account) => account.accountId === input.settlementAccountId,
    );
    if (!settlementAccount) throw new Error("找不到指定的入帳帳戶");

    const quantity = decimal(current.quantity);
    const salePrice = decimal(input.salePrice);
    const fee = decimal(input.fee);
    const tax = decimal(input.tax);
    const costBasis =
      current.securityType === "future"
        ? zero
        : quantity.mul(current.averageCost);
    const grossProceeds =
      current.securityType === "future"
        ? salePrice
            .minus(current.averageCost)
            .mul(current.positionSide === "short" ? -1 : 1)
            .mul(quantity)
            .mul(current.contractMultiplier ?? "0")
        : quantity.mul(salePrice);
    const netProceeds = grossProceeds.minus(fee).minus(tax);
    if (current.securityType !== "future" && netProceeds.isNegative())
      throw new Error("手續費與交易稅不可高於成交總額");
    const realizedPnl =
      current.securityType === "future"
        ? netProceeds
        : netProceeds.minus(costBasis);
    const fxRate = decimal(
      current.quoteCurrency === "TWD" ? "1" : (current.fxRate?.rate ?? "0"),
    );
    if (fxRate.lte(0)) throw new Error("缺少成交幣別的有效匯率");

    const accounts = latest.accounts.map((account): AccountStateInput => ({
      accountId: account.accountId,
      name: account.name,
      institution: account.institution,
      accountType: account.accountType,
      accountReference: account.accountReference,
      defaultCurrency: account.defaultCurrency,
      cashBalances:
        account.accountId !== settlementAccount.accountId
          ? account.cashBalances
          : (() => {
              const balances = account.cashBalances.map((balance) => ({
                ...balance,
              }));
              const target = balances.find(
                (balance) => balance.currency === input.currency,
              );
              if (target) {
                const nextAmount = decimal(target.amount).plus(netProceeds);
                if (nextAmount.isNegative())
                  throw new Error("結算後現金餘額不可為負數");
                target.amount = money(nextAmount);
              } else {
                if (netProceeds.isNegative())
                  throw new Error("入帳帳戶沒有足夠現金支付結算損失與費用");
                balances.push({
                  currency: input.currency,
                  amount: money(netProceeds),
                  fxRate: current.fxRate,
                });
              }
              return balances;
            })(),
      positions: account.positions.filter(
        (position) => position.positionId !== positionId,
      ),
    }));
    const soldAt = new Date(input.soldAt).toISOString();
    const snapshotId = await createSnapshotInDb(db, {
      rawInput: `${current.accountName} 的 ${current.symbol} 已全部賣出`,
      baseSnapshotId: latest.id,
      accounts,
      loans: latest.loans,
      cashFlows: fee.plus(tax).gt(0)
        ? [
            {
              flowType: "fee_tax",
              amountTwd: money(fee.plus(tax).mul(fxRate)),
              note: `${current.symbol} 全部賣出費稅`,
            },
          ]
        : [],
    });
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO position_sales(
      id, position_id, result_snapshot_id, sold_at, quantity, sale_price, currency,
      settlement_account_id, fee, tax, gross_proceeds, net_proceeds, cost_basis,
      realized_pnl, fx_rate, realized_pnl_twd, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        positionId,
        snapshotId,
        soldAt,
        current.quantity,
        input.salePrice,
        input.currency,
        settlementAccount.accountId,
        money(fee),
        money(tax),
        money(grossProceeds),
        money(netProceeds),
        money(costBasis),
        money(realizedPnl),
        fxRate.toString(),
        money(realizedPnl.mul(fxRate)),
        input.note ?? null,
        now,
      );
    await db
      .prepare(
        "UPDATE account_positions SET status = 'sold', sold_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(soldAt, now, positionId);
    return snapshotId;
  });
  const detail = await getSnapshotDetail(resultId);
  if (!detail) throw new Error("賣出後無法讀取結果快照");
  return detail;
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDatabase();
  const result = await db
    .prepare("DELETE FROM snapshots WHERE id = ? AND owner_key = ?")
    .run(id, getDataOwner().key);
  if (Number(result.changes) === 0) throw new Error("找不到快照");
}

export async function getAccountTrend(accountId: string, range = "all") {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  const since = dateFromRange(range);
  const rows = (await db
    .prepare(
      `SELECT s.captured_at,
    COALESCE((SELECT SUM(CAST(cb.value_twd AS REAL)) FROM cash_balances cb WHERE cb.snapshot_account_id = sa.id), 0) AS cash_value,
    COALESCE((SELECT SUM(CAST(sp.market_value_twd AS REAL)) FROM snapshot_positions sp WHERE sp.snapshot_account_id = sa.id), 0) AS security_value,
    COALESCE((SELECT SUM(CAST(sl.value_twd AS REAL)) FROM snapshot_loans sl WHERE sl.snapshot_account_id = sa.id), 0) AS liability_value
    FROM snapshot_accounts sa
    JOIN snapshots s ON s.id = sa.snapshot_id
    WHERE sa.account_id = ?
      AND s.owner_key = ?
      AND (? IS NULL OR s.captured_at >= ?)
    ORDER BY s.captured_at`,
    )
    .all(accountId, ownerKey, since, since)) as Row[];
  return dedupeLatestByTaipeiDay(
    rows.map((row) => {
      const cashValue = decimal(text(row.cash_value));
      const securityValue = decimal(text(row.security_value));
      const liabilityValue = decimal(text(row.liability_value));
      const totalAssetValue = cashValue.plus(securityValue);
      return {
        capturedAt: text(row.captured_at),
        cashValueTwd: money(cashValue),
        securityValueTwd: money(securityValue),
        liabilityValueTwd: money(liabilityValue),
        totalAssetValueTwd: money(totalAssetValue),
        netValueTwd: money(totalAssetValue.minus(liabilityValue)),
      };
    }),
  );
}

export async function getSecurityTrend(securityId: string, range = "all") {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  const since = dateFromRange(range);
  const rows = (await db
    .prepare(
      `SELECT s.captured_at,
    COALESCE(SUM(CASE WHEN sp.security_id = ? THEN CAST(sp.quantity AS REAL) ELSE 0 END), 0) AS quantity,
    COALESCE(SUM(CASE WHEN sp.security_id = ? THEN CAST(sp.market_value_twd AS REAL) ELSE 0 END), 0) AS market_value_twd,
    COALESCE(SUM(CASE WHEN sp.security_id = ? THEN CAST(sp.cost_value_twd AS REAL) ELSE 0 END), 0) AS cost_value_twd
    FROM snapshots s
    LEFT JOIN snapshot_accounts sa ON sa.snapshot_id = s.id
    LEFT JOIN snapshot_positions sp ON sp.snapshot_account_id = sa.id
    WHERE s.captured_at >= (
      SELECT MIN(first_snapshot.captured_at)
      FROM snapshot_positions first_position
      JOIN snapshot_accounts first_account ON first_account.id = first_position.snapshot_account_id
      JOIN snapshots first_snapshot ON first_snapshot.id = first_account.snapshot_id
      WHERE first_position.security_id = ? AND first_snapshot.owner_key = ?
    )
      AND s.owner_key = ?
      AND (? IS NULL OR s.captured_at >= ?)
    GROUP BY s.id, s.captured_at
    ORDER BY s.captured_at`,
    )
    .all(
      securityId,
      securityId,
      securityId,
      securityId,
      ownerKey,
      ownerKey,
      since,
      since,
    )) as Row[];
  return dedupeLatestByTaipeiDay(
    rows.map((row) => ({
      capturedAt: text(row.captured_at),
      quantity: shares(decimal(text(row.quantity))),
      marketValueTwd: money(decimal(text(row.market_value_twd))),
      costValueTwd: money(decimal(text(row.cost_value_twd))),
    })),
  );
}

export async function getCreditCardTrend(
  range = "all",
): Promise<CreditCardTrendPoint[]> {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  const since = dateFromRange(range);
  const rows = (await db
    .prepare(
      `SELECT s.captured_at, sc.credit_card_account_id, sc.statement_period,
      sc.statement_amount, sc.payment_amount, COALESCE(fx.rate, '1') AS fx_rate
      FROM snapshot_credit_card_accounts sc
      JOIN snapshots s ON s.id = sc.snapshot_id
      LEFT JOIN snapshot_fx_rates fx ON fx.id = sc.fx_rate_id
      WHERE s.owner_key = ? AND (? IS NULL OR s.captured_at >= ?)
        AND s.raw_input <> '更新信用卡帳戶設定'
      ORDER BY s.captured_at`,
    )
    .all(ownerKey, since, since)) as Row[];

  const latestByAccountAndPeriod = new Map<string, Row>();
  for (const row of rows) {
    latestByAccountAndPeriod.set(
      `${text(row.credit_card_account_id)}:${text(row.statement_period)}`,
      row,
    );
  }

  const totalsByPeriod = new Map<
    string,
    {
      totalDueTwd: ReturnType<typeof decimal>;
      paymentAmountTwd: ReturnType<typeof decimal>;
    }
  >();
  for (const row of latestByAccountAndPeriod.values()) {
    const period = text(row.statement_period);
    const current = totalsByPeriod.get(period) ?? {
      totalDueTwd: zero,
      paymentAmountTwd: zero,
    };
    const rate = decimal(text(row.fx_rate));
    totalsByPeriod.set(period, {
      totalDueTwd: current.totalDueTwd.plus(
        decimal(text(row.statement_amount)).mul(rate),
      ),
      paymentAmountTwd: current.paymentAmountTwd.plus(
        decimal(text(row.payment_amount)).mul(rate),
      ),
    });
  }

  return [...totalsByPeriod.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([statementPeriod, totals]) => ({
      capturedAt: `${statementPeriod}-01T00:00:00.000Z`,
      statementPeriod,
      totalDueTwd: money(totals.totalDueTwd),
      paymentAmountTwd: money(totals.paymentAmountTwd),
    }));
}

const backupTables = [
  "accounts",
  "securities",
  "account_positions",
  "loans",
  "credit_card_accounts",
  "credit_cards",
  "snapshots",
  "snapshot_accounts",
  "snapshot_fx_rates",
  "cash_balances",
  "snapshot_positions",
  "snapshot_loans",
  "snapshot_credit_card_accounts",
  "snapshot_cash_flows",
  "position_sales",
  "app_settings",
] as const;

const backupColumns: Record<(typeof backupTables)[number], readonly string[]> =
  {
    accounts: [
      "id",
      "name",
      "institution",
      "account_type",
      "account_reference",
      "default_currency",
      "archived_at",
      "created_at",
      "updated_at",
    ],
    securities: [
      "id",
      "market",
      "exchange",
      "symbol",
      "provider_symbol",
      "name",
      "security_type",
      "quote_currency",
      "archived_at",
      "created_at",
      "updated_at",
    ],
    account_positions: [
      "id",
      "account_id",
      "security_id",
      "status",
      "first_seen_at",
      "sold_at",
      "created_at",
      "updated_at",
    ],
    loans: [
      "id",
      "account_id",
      "name",
      "institution",
      "loan_type",
      "currency",
      "archived_at",
      "created_at",
      "updated_at",
    ],
    credit_card_accounts: [
      "id",
      "name",
      "issuer",
      "currency",
      "shared_credit_limit",
      "statement_day_of_month",
      "payment_day_of_month",
      "status",
      "note",
      "archived_at",
      "created_at",
      "updated_at",
    ],
    credit_cards: [
      "id",
      "credit_card_account_id",
      "name",
      "last_four",
      "network",
      "holder_type",
      "status",
      "note",
      "archived_at",
      "created_at",
      "updated_at",
    ],
    snapshots: [
      "id",
      "captured_at",
      "base_snapshot_id",
      "raw_input",
      "parser_model",
      "parser_schema_version",
      "total_cash_twd",
      "total_securities_twd",
      "total_asset_value_twd",
      "total_liabilities_twd",
      "total_credit_card_liabilities_twd",
      "total_credit_card_credits_twd",
      "net_worth_twd",
      "total_cost_twd",
      "unrealized_pnl_twd",
      "created_at",
      "updated_at",
    ],
    snapshot_accounts: [
      "id",
      "snapshot_id",
      "account_id",
      "name",
      "institution",
      "account_type",
      "account_reference",
      "default_currency",
      "sort_order",
    ],
    snapshot_fx_rates: [
      "id",
      "snapshot_id",
      "base_currency",
      "quote_currency",
      "rate",
      "rate_as_of",
      "source",
      "status",
      "overridden_by_user",
      "fetched_at",
    ],
    cash_balances: [
      "id",
      "snapshot_account_id",
      "currency",
      "amount",
      "fx_rate_id",
      "value_twd",
    ],
    snapshot_positions: [
      "id",
      "snapshot_account_id",
      "position_id",
      "security_id",
      "market",
      "symbol",
      "security_name",
      "security_type",
      "quote_currency",
      "quantity",
      "average_cost",
      "market_price",
      "quote_as_of",
      "quote_source",
      "quote_status",
      "quote_note",
      "fx_rate_id",
      "cost_value_quote",
      "market_value_quote",
      "cost_value_twd",
      "market_value_twd",
      "unrealized_pnl_twd",
      "unrealized_return_pct",
      "created_at",
      "updated_at",
    ],
    snapshot_loans: [
      "id",
      "snapshot_id",
      "snapshot_account_id",
      "loan_id",
      "name",
      "institution",
      "loan_type",
      "currency",
      "original_principal",
      "outstanding_principal",
      "annual_interest_rate",
      "rate_type",
      "monthly_payment",
      "payment_day_of_month",
      "next_payment_date",
      "start_date",
      "end_date",
      "note",
      "fx_rate_id",
      "value_twd",
      "sort_order",
      "created_at",
      "updated_at",
    ],
    snapshot_credit_card_accounts: [
      "id",
      "snapshot_id",
      "credit_card_account_id",
      "name",
      "issuer",
      "currency",
      "shared_credit_limit",
      "statement_day_of_month",
      "payment_day_of_month",
      "account_status",
      "note",
      "statement_period",
      "statement_date",
      "due_date",
      "statement_amount",
      "payment_amount",
      "payment_date",
      "remaining_installment_principal",
      "overpayment_balance",
      "statement_outstanding",
      "utilization_pct",
      "fx_rate_id",
      "statement_amount_twd",
      "liability_value_twd",
      "credit_asset_value_twd",
      "sort_order",
      "created_at",
      "updated_at",
    ],
    snapshot_cash_flows: [
      "id",
      "snapshot_id",
      "flow_type",
      "amount_twd",
      "note",
      "sort_order",
      "created_at",
    ],
    position_sales: [
      "id",
      "position_id",
      "result_snapshot_id",
      "sold_at",
      "quantity",
      "sale_price",
      "currency",
      "settlement_account_id",
      "fee",
      "tax",
      "gross_proceeds",
      "net_proceeds",
      "cost_basis",
      "realized_pnl",
      "fx_rate",
      "realized_pnl_twd",
      "note",
      "created_at",
    ],
    app_settings: ["key", "value_json", "updated_at"],
  };

const ownedBackupFrom: Record<(typeof backupTables)[number], string> = {
  accounts: "accounts item WHERE item.owner_key = ?",
  securities: `securities item WHERE EXISTS (
    SELECT 1 FROM account_positions position
    JOIN accounts account ON account.id = position.account_id
    WHERE position.security_id = item.id AND account.owner_key = ?
  )`,
  account_positions: `account_positions item JOIN accounts account ON account.id = item.account_id
    WHERE account.owner_key = ?`,
  loans: "loans item WHERE item.owner_key = ?",
  credit_card_accounts: "credit_card_accounts item WHERE item.owner_key = ?",
  credit_cards: `credit_cards item
    JOIN credit_card_accounts account ON account.id = item.credit_card_account_id
    WHERE account.owner_key = ?`,
  snapshots: "snapshots item WHERE item.owner_key = ?",
  snapshot_accounts: `snapshot_accounts item
    JOIN snapshots snapshot ON snapshot.id = item.snapshot_id
    WHERE snapshot.owner_key = ?`,
  snapshot_fx_rates: `snapshot_fx_rates item
    JOIN snapshots snapshot ON snapshot.id = item.snapshot_id
    WHERE snapshot.owner_key = ?`,
  cash_balances: `cash_balances item
    JOIN snapshot_accounts snapshot_account ON snapshot_account.id = item.snapshot_account_id
    JOIN snapshots snapshot ON snapshot.id = snapshot_account.snapshot_id
    WHERE snapshot.owner_key = ?`,
  snapshot_positions: `snapshot_positions item
    JOIN snapshot_accounts snapshot_account ON snapshot_account.id = item.snapshot_account_id
    JOIN snapshots snapshot ON snapshot.id = snapshot_account.snapshot_id
    WHERE snapshot.owner_key = ?`,
  snapshot_loans: `snapshot_loans item
    JOIN snapshots snapshot ON snapshot.id = item.snapshot_id
    WHERE snapshot.owner_key = ?`,
  snapshot_credit_card_accounts: `snapshot_credit_card_accounts item
    JOIN snapshots snapshot ON snapshot.id = item.snapshot_id
    WHERE snapshot.owner_key = ?`,
  snapshot_cash_flows: `snapshot_cash_flows item
    JOIN snapshots snapshot ON snapshot.id = item.snapshot_id
    WHERE snapshot.owner_key = ?`,
  position_sales: `position_sales item
    JOIN snapshots snapshot ON snapshot.id = item.result_snapshot_id
    WHERE snapshot.owner_key = ?`,
  app_settings: "app_settings item WHERE ? IS NOT NULL",
};

function ownedBackupQuery(table: (typeof backupTables)[number]) {
  const columns = backupColumns[table]
    .map((column) => `item.${column}`)
    .join(", ");
  return `SELECT ${columns} FROM ${ownedBackupFrom[table]} ORDER BY 1`;
}

const backupParents: Partial<
  Record<
    (typeof backupTables)[number],
    Array<
      [
        column: string,
        parent: (typeof backupTables)[number],
        nullable?: boolean,
      ]
    >
  >
> = {
  account_positions: [["account_id", "accounts"]],
  loans: [["account_id", "accounts", true]],
  credit_cards: [["credit_card_account_id", "credit_card_accounts"]],
  snapshots: [["base_snapshot_id", "snapshots", true]],
  snapshot_accounts: [
    ["snapshot_id", "snapshots"],
    ["account_id", "accounts"],
  ],
  snapshot_fx_rates: [["snapshot_id", "snapshots"]],
  cash_balances: [["snapshot_account_id", "snapshot_accounts"]],
  snapshot_positions: [
    ["snapshot_account_id", "snapshot_accounts"],
    ["position_id", "account_positions"],
  ],
  snapshot_loans: [
    ["snapshot_id", "snapshots"],
    ["snapshot_account_id", "snapshot_accounts", true],
    ["loan_id", "loans"],
  ],
  snapshot_credit_card_accounts: [
    ["snapshot_id", "snapshots"],
    ["credit_card_account_id", "credit_card_accounts"],
  ],
  snapshot_cash_flows: [["snapshot_id", "snapshots"]],
  position_sales: [
    ["position_id", "account_positions"],
    ["result_snapshot_id", "snapshots"],
    ["settlement_account_id", "accounts", true],
  ],
};

export async function exportBackup() {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  return {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(
      await Promise.all(
        backupTables.map(
          async (table) =>
            [
              table,
              await db.prepare(ownedBackupQuery(table)).all(ownerKey),
            ] as const,
        ),
      ),
    ),
  };
}

export async function importBackup(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("備份格式無效");
  const backup = payload as {
    schemaVersion?: number;
    data?: Record<string, Row[]>;
  };
  if (![1, 2].includes(backup.schemaVersion ?? 0) || !backup.data)
    throw new Error("不支援此備份版本");
  return withTransaction(async (db) => {
    const ownerKey = getDataOwner().key;
    let imported = 0;
    let skipped = 0;
    await db.prepare("PRAGMA defer_foreign_keys = ON").run();

    const allowedIds = new Map<string, Set<string>>();
    for (const table of backupTables) {
      const primaryColumn = backupColumns[table][0];
      const owned = await db.prepare(ownedBackupQuery(table)).all(ownerKey);
      allowedIds.set(
        table,
        new Set([
          ...owned.map((row) => String(row[primaryColumn])),
          ...(backup.data?.[table] ?? []).map((row) =>
            String(row[primaryColumn]),
          ),
        ]),
      );
    }
    for (const [table, parents] of Object.entries(backupParents)) {
      for (const row of backup.data?.[table] ?? []) {
        for (const [column, parent, nullable] of parents ?? []) {
          const value = row[column];
          if (
            (value === null || value === undefined || value === "") &&
            nullable
          )
            continue;
          if (!allowedIds.get(parent)?.has(String(value)))
            throw new Error(`${table}.${column} 不屬於目前登入郵箱`);
        }
      }
    }

    const ownerTables = new Set([
      "accounts",
      "loans",
      "credit_card_accounts",
      "snapshots",
    ]);
    for (const table of backupTables) {
      const rows = backup.data?.[table] ?? [];
      const primaryColumn = backupColumns[table][0];
      const existing = new Set(
        (await db.prepare(ownedBackupQuery(table)).all(ownerKey)).map((row) =>
          String(row[primaryColumn]),
        ),
      );
      for (const row of rows) {
        if (!row || typeof row !== "object" || Array.isArray(row))
          throw new Error(`${table} 備份列格式無效`);
        const columns = backupColumns[table].filter((column) =>
          Object.hasOwn(row, column),
        );
        if (columns.length === 0) continue;
        const primaryValue = String(row[primaryColumn]);
        if (existing.has(primaryValue)) {
          skipped += 1;
          continue;
        }
        const insertColumns = ownerTables.has(table)
          ? [...columns, "owner_key"]
          : columns;
        const values = ownerTables.has(table)
          ? [...columns.map((column) => row[column] as never), ownerKey]
          : columns.map((column) => row[column] as never);
        const placeholders = insertColumns.map(() => "?").join(", ");
        const result = await db
          .prepare(
            `INSERT OR IGNORE INTO ${table} (${insertColumns.join(", ")}) VALUES (${placeholders})`,
          )
          .run(...values);
        if (Number(result.changes) > 0) {
          imported += 1;
          existing.add(primaryValue);
        } else skipped += 1;
      }
    }
    await db
      .prepare(
        `UPDATE snapshots SET net_worth_twd = total_asset_value_twd
      WHERE total_liabilities_twd = '0' AND net_worth_twd = '0'
      AND total_asset_value_twd <> '0' AND owner_key = ?`,
      )
      .run(ownerKey);
    return { imported, skipped };
  });
}
