import { getLatestSnapshot } from "./repository";
import { decimal } from "./finance";
import {
  accountNameKey,
  canonicalizeAccountName,
  canonicalizeInstitution,
  canonicalizeLoanName,
  institutionKey,
  loanNameKey,
  sameAccountIdentity,
} from "./account-identity";
import type {
  AccountStateInput,
  LoanInput,
  ParserPatch,
  SnapshotProposal,
} from "./types";

export function extractCashBalances(
  rawInput: string,
): ParserPatch["accountUpdates"] {
  const updates: ParserPatch["accountUpdates"] = [];
  const pattern =
    /([\p{Script=Han}A-Za-z0-9·・_-]{2,30}?(?:銀行|證券|帳戶))\s*([^\d，,；;。\n]{0,24}?)\s*([\d][\d,]*(?:\.\d+)?)\s*(萬)?\s*(TWD|NT\$|新臺幣|新台幣|臺幣|台幣|JPY|日幣|日圓|日元|円|USD|美元|美金|CNY|RMB|人民幣|HKD|港幣|EUR|歐元|GBP|英鎊|元)?/giu;
  for (const match of rawInput.matchAll(pattern)) {
    const account = canonicalizeAccountName(match[1].trim());
    const context = match[2].trim();
    const hasBalanceKeyword = /(現金|餘額|權益)/.test(context);
    const hasCurrency =
      currencyFromText(`${context} ${match[5] ?? ""}`) !== null;
    if (!account.endsWith("銀行") && !hasBalanceKeyword) continue;
    if (
      account.endsWith("銀行") &&
      context &&
      !hasBalanceKeyword &&
      !hasCurrency
    )
      continue;
    const rawBalance = match[3].replaceAll(",", "");
    const balance = match[4]
      ? decimal(rawBalance).mul(10_000).toFixed()
      : rawBalance;
    updates.push({
      accountName: account,
      institution: canonicalizeInstitution(
        account.replace(/(銀行|證券|帳戶)$/, "") || null,
      ),
      accountType: account.includes("銀行")
        ? "bank"
        : account.includes("證券") || account.includes("期貨")
          ? "brokerage"
          : "cash",
      currency: currencyFromText(`${context} ${match[5] ?? ""}`) ?? "TWD",
      balance,
    });
  }
  return updates;
}

export function extractFuturesPositions(
  rawInput: string,
): ParserPatch["positionUpdates"] {
  const account =
    rawInput.match(
      /([\p{Script=Han}A-Za-z0-9·・_-]{2,30}?(?:期貨帳戶|期貨))/u,
    )?.[1] ?? "期貨帳戶";
  const positions: ParserPatch["positionUpdates"] = [];
  const pattern =
    /(小型|微型)臺指期(?:貨)?\s*(\d{4})\s*[\/-]\s*(\d{1,2})[\s\S]*?(多單|空單)\s*(\d+(?:\.\d+)?)\s*口[\s\S]*?(?:均價|平均(?:進場)?價?)\s*([\d,]+(?:\.\d+)?)/giu;
  for (const match of rawInput.matchAll(pattern)) {
    const isMicro = match[1] === "微型";
    const productCode = isMicro ? "TMF" : "MTX";
    const multiplier = isMicro ? "10" : "50";
    const expiry = `${match[2]}${match[3].padStart(2, "0")}`;
    positions.push({
      accountName: account,
      market: "FUTURES",
      symbol: `${productCode}${expiry}`,
      name: `${match[1]}臺指期 ${match[2]}/${match[3].padStart(2, "0")}`,
      securityType: "future",
      positionSide: match[4] === "空單" ? "short" : "long",
      contractMultiplier: multiplier,
      contractExpiry: expiry,
      quantity: match[5],
      averageCost: match[6].replaceAll(",", ""),
    });
  }
  return positions;
}

const loanTypeMap = {
  房貸: "mortgage",
  房屋貸款: "mortgage",
  信貸: "personal",
  信用貸款: "personal",
  車貸: "auto",
  汽車貸款: "auto",
  學貸: "student",
  就學貸款: "student",
  信用卡循環: "credit",
  暫時借貸: "other",
  短期借貸: "other",
  借貸: "other",
  貸款: "other",
} as const;

const normalizedAmount = (amount: string, tenThousands?: string) => {
  const value = amount.replaceAll(",", "");
  return tenThousands ? decimal(value).mul(10_000).toFixed() : value;
};

const normalizedDate = (value?: string) => {
  if (!value) return null;
  const match = value.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  return match
    ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`
    : value;
};

export function extractLoans(rawInput: string): ParserPatch["loanUpdates"] {
  const match =
    rawInput.match(
      /([\p{Script=Han}A-Za-z0-9·・_\- ]{0,20}?)(房屋貸款|信用貸款|汽車貸款|就學貸款|信用卡循環|暫時借貸|短期借貸|房貸|信貸|車貸|學貸|借貸|貸款)\s*(?:目前)?\s*(?:還有|尚有|剩餘本金|未償本金|本金餘額|剩餘|餘額)\s*(?:NT\$)?\s*([\d][\d,]*(?:\.\d+)?)\s*(萬)?/iu,
    ) ??
    rawInput.match(
      /([\p{Script=Han}A-Za-z0-9·・_\- ]{0,20}?)(暫時借貸|短期借貸|借貸)\s*(?:目前)?\s*(?:NT\$)?\s*([\d][\d,]*(?:\.\d+)?)\s*(萬)?/iu,
    );
  if (!match) return [];
  const prefix = match[1]
    .replace(/^(?:我的|目前|有一筆)/, "")
    .replace(/有$/, "")
    .trim();
  const institution = canonicalizeInstitution(prefix);
  const label = match[2] as keyof typeof loanTypeMap;
  const original = rawInput.match(
    /(?:原始(?:貸款)?金額|原貸款(?:金額)?|貸款總額)\s*(?:NT\$)?\s*([\d][\d,]*(?:\.\d+)?)\s*(萬)?/iu,
  );
  const rate = rawInput.match(/(?:年利率|利率)\s*([\d]+(?:\.\d+)?)\s*%?/iu);
  const payment = rawInput.match(
    /(?:每月(?:要)?(?:還款|繳款|繳|付|還)|月付)\s*(?:NT\$)?\s*([\d][\d,]*(?:\.\d+)?)\s*(萬)?/iu,
  );
  const paymentDay = rawInput.match(/每月\s*(\d{1,2})\s*日(?:還款|繳款)?/u);
  const nextPayment = rawInput.match(
    /下次(?:還款|繳款)日?\s*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/iu,
  );
  const startDate = rawInput.match(
    /(?:開始日|貸款開始日)\s*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/iu,
  );
  const endDate = rawInput.match(
    /(?:結束日|到期日|預計結清日)\s*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/iu,
  );
  return [
    {
      name: `${institution ?? ""}${label}` || label,
      institution,
      loanType: loanTypeMap[label],
      currency: currencyFromText(rawInput) ?? "TWD",
      originalPrincipal: original
        ? normalizedAmount(original[1], original[2])
        : null,
      outstandingPrincipal: normalizedAmount(match[3], match[4]),
      annualInterestRate: rate?.[1] ?? null,
      rateType: /固定利率/.test(rawInput)
        ? "fixed"
        : /浮動利率/.test(rawInput)
          ? "floating"
          : null,
      monthlyPayment: payment ? normalizedAmount(payment[1], payment[2]) : null,
      paymentDayOfMonth: paymentDay ? Number(paymentDay[1]) : null,
      nextPaymentDate: normalizedDate(nextPayment?.[1]),
      startDate: normalizedDate(startDate?.[1]),
      endDate: normalizedDate(endDate?.[1]),
      note: null,
    },
  ];
}

export function extractSecurityPositions(
  rawInput: string,
  fallbackAccountName?: string | null,
): ParserPatch["positionUpdates"] {
  const explicitAccount = rawInput.match(
    /^\s*([A-Za-z][A-Za-z0-9._-]{1,30})\s*(?:有|持有)/iu,
  )?.[1];
  const accountName = canonicalizeAccountName(
    fallbackAccountName?.trim() || explicitAccount || "證券帳戶",
  );
  const positions: ParserPatch["positionUpdates"] = [];
  const pattern =
    /\b([A-Z]+(?:[.-][A-Z]+)?)\s*([\d][\d,]*(?:\.\d+)?)\s*股\s*(?:，|,)?\s*(?:均價|平均成本|平均(?:買入)?價)\s*(?:USD|US\$|\$|NT\$)?\s*([\d][\d,]*(?:\.\d+)?)/giu;
  for (const match of rawInput.matchAll(pattern)) {
    const symbol = match[1].toUpperCase();
    positions.push({
      accountName,
      market: "US",
      symbol,
      name: symbol,
      securityType: "stock",
      quantity: match[2].replaceAll(",", ""),
      averageCost: match[3].replaceAll(",", ""),
    });
  }
  return positions;
}

export function extractAccountReference(rawInput: string): string | null {
  return (
    rawInput.match(
      /(?:帳戶識別碼|帳戶代號|帳號末四碼|帳號後四碼)\s*(?:為|是|[:：])?\s*([A-Za-z0-9_-]{2,50})/iu,
    )?.[1] ?? null
  );
}

function currencyFromText(value: string): string | null {
  if (/(JPY|日幣|日圓|日元|円)/i.test(value)) return "JPY";
  if (/(USD|美元|美金)/i.test(value)) return "USD";
  if (/(CNY|RMB|人民幣)/i.test(value)) return "CNY";
  if (/(HKD|港幣)/i.test(value)) return "HKD";
  if (/(EUR|歐元)/i.test(value)) return "EUR";
  if (/(GBP|英鎊)/i.test(value)) return "GBP";
  if (/(TWD|NT\$|新臺幣|新台幣|臺幣|台幣|元)/i.test(value)) return "TWD";
  return null;
}

export function mergeDeterministicUpdates(
  rawInput: string,
  patch: ParserPatch,
): ParserPatch {
  const accountUpdates = [...patch.accountUpdates];
  const positionUpdates = [...patch.positionUpdates];
  const loanUpdates = [...patch.loanUpdates];
  for (const detected of extractCashBalances(rawInput)) {
    const existingIndex = accountUpdates.findIndex(
      (item) =>
        item.accountName === detected.accountName &&
        item.currency === detected.currency,
    );
    if (existingIndex >= 0) {
      accountUpdates[existingIndex] = {
        ...accountUpdates[existingIndex],
        ...detected,
      };
      continue;
    }
    const wrongCurrencyIndex = accountUpdates.findIndex(
      (item) =>
        item.accountName === detected.accountName &&
        item.balance === detected.balance,
    );
    if (wrongCurrencyIndex >= 0)
      accountUpdates.splice(wrongCurrencyIndex, 1, detected);
    else accountUpdates.push(detected);
  }
  for (const detected of extractFuturesPositions(rawInput)) {
    const existingIndex = positionUpdates.findIndex(
      (item) => item.market === "FUTURES" && item.symbol === detected.symbol,
    );
    if (existingIndex >= 0) positionUpdates[existingIndex] = detected;
    else positionUpdates.push(detected);
  }
  const detectedLoans = extractLoans(rawInput);
  for (const detected of extractSecurityPositions(
    rawInput,
    detectedLoans[0]?.institution,
  )) {
    const existingIndex = positionUpdates.findIndex(
      (item) =>
        item.accountName === detected.accountName &&
        item.market === detected.market &&
        item.symbol === detected.symbol,
    );
    if (existingIndex >= 0) positionUpdates[existingIndex] = detected;
    else positionUpdates.push(detected);
  }
  for (const detected of detectedLoans) {
    const existingIndex = loanUpdates.findIndex(
      (item) => item.name === detected.name,
    );
    if (existingIndex >= 0)
      loanUpdates[existingIndex] = {
        ...loanUpdates[existingIndex],
        ...detected,
      };
    else loanUpdates.push(detected);
  }
  const accountReference = extractAccountReference(rawInput);
  if (accountReference && positionUpdates.length > 0) {
    const targetName = positionUpdates[0].accountName;
    const existing = accountUpdates.find(
      (item) => accountNameKey(item.accountName) === accountNameKey(targetName),
    );
    if (existing) existing.accountReference = accountReference;
    else
      accountUpdates.push({
        accountName: targetName,
        institution: detectedLoans[0]?.institution ?? null,
        accountReference,
        accountType: "brokerage",
        currency: positionUpdates[0].market === "US" ? "USD" : "TWD",
        balance: null,
      });
  }
  const fundCodes = [
    ...rawInput.toUpperCase().matchAll(/\bT\d{4}[A-Z]\b/g),
  ].map((match) => match[0]);
  const fundUpdates = positionUpdates.filter(
    (item) => item.securityType === "fund",
  );
  if (fundCodes.length === 1 && fundUpdates.length === 1) {
    fundUpdates[0].providerSymbol = fundCodes[0];
  }
  const hasValidUpdate =
    accountUpdates.length > 0 ||
    positionUpdates.length > 0 ||
    loanUpdates.length > 0 ||
    patch.sales.length > 0;
  return {
    ...patch,
    accountUpdates,
    positionUpdates,
    loanUpdates,
    unsupportedReason: hasValidUpdate ? null : patch.unsupportedReason,
  };
}

export async function parseNaturalLanguage(
  rawInput: string,
): Promise<ParserPatch> {
  const unsupportedReason = classifyUnsupportedInput(rawInput);
  if (unsupportedReason)
    return {
      unsupportedReason,
      accountUpdates: [],
      positionUpdates: [],
      loanUpdates: [],
      sales: [],
      warnings: [],
    };
  const futures = extractFuturesPositions(rawInput);
  if (futures.length > 0) {
    return {
      unsupportedReason: null,
      accountUpdates: extractCashBalances(rawInput),
      positionUpdates: futures,
      loanUpdates: [],
      sales: [],
      warnings: [],
    };
  }
  const loans = extractLoans(rawInput);
  const securities = extractSecurityPositions(rawInput, loans[0]?.institution);
  const accountUpdates = extractCashBalances(rawInput);
  if (loans.length > 0 || securities.length > 0 || accountUpdates.length > 0) {
    const accountReference = extractAccountReference(rawInput);
    if (accountReference && securities.length > 0) {
      const targetName = securities[0].accountName;
      const existing = accountUpdates.find(
        (item) =>
          accountNameKey(item.accountName) === accountNameKey(targetName),
      );
      if (existing) existing.accountReference = accountReference;
      else
        accountUpdates.push({
          accountName: targetName,
          institution: loans[0]?.institution ?? null,
          accountReference,
          accountType: "brokerage",
          currency: securities[0].market === "US" ? "USD" : "TWD",
          balance: null,
        });
    }
    return {
      unsupportedReason: null,
      accountUpdates,
      positionUpdates: securities,
      loanUpdates: loans,
      sales: [],
      warnings: [],
    };
  }
  return {
    unsupportedReason:
      "無法以內建規則辨識這筆資料，請改用手動新增，或改填目前餘額、持有數量與平均成本。",
    accountUpdates: [],
    positionUpdates: [],
    loanUpdates: [],
    sales: [],
    warnings: [],
  };
}

export function classifyUnsupportedInput(rawInput: string): string | null {
  if (
    /(部分賣出|減碼|賣出\s*\d+(?:\.\d+)?\s*(?:股|張))/.test(rawInput) &&
    !/(全部賣出|全數賣出|清倉)/.test(rawInput)
  ) {
    return "部分賣出不進行交易推算，請改填目前剩餘數量與平均成本。";
  }
  if (/(買入|加碼|增持|新買)/.test(rawInput)) {
    return "買入或加碼不進行交易推算，請改填目前持有數量與平均成本。";
  }
  return null;
}

function cloneLatest(): AccountStateInput[] {
  const latest = getLatestSnapshot();
  return (
    latest?.accounts.map((account) => ({
      accountId: account.accountId,
      name: account.name,
      institution: account.institution,
      accountType: account.accountType,
      accountReference: account.accountReference,
      defaultCurrency: account.defaultCurrency,
      cashBalances: account.cashBalances,
      positions: account.positions,
    })) ?? []
  );
}

function cloneLatestLoans(): LoanInput[] {
  const latest = getLatestSnapshot();
  return (
    latest?.loans.map((loan) => ({
      loanId: loan.loanId,
      accountId: loan.accountId,
      accountName: loan.accountName,
      name: loan.name,
      institution: loan.institution,
      loanType: loan.loanType,
      currency: loan.currency,
      originalPrincipal: loan.originalPrincipal,
      outstandingPrincipal: loan.outstandingPrincipal,
      annualInterestRate: loan.annualInterestRate,
      rateType: loan.rateType,
      monthlyPayment: loan.monthlyPayment,
      paymentDayOfMonth: loan.paymentDayOfMonth,
      nextPaymentDate: loan.nextPaymentDate,
      startDate: loan.startDate,
      endDate: loan.endDate,
      note: loan.note,
      fxRate: loan.fxRate,
    })) ?? []
  );
}

function hasExplicitCashAmount(rawInput: string): boolean {
  if (extractCashBalances(rawInput).length > 0) return true;
  const hasAmount = /(?:\d[\d,.]*|[零〇一二兩三四五六七八九十百千萬億]+)/u.test(
    rawInput,
  );
  const hasCashContext =
    /(餘額|現金|權益|存款|TWD|NT\$|新臺幣|新台幣|臺幣|台幣|JPY|日幣|日圓|日元|円|USD|美元|美金|CNY|RMB|人民幣|HKD|港幣|EUR|歐元|GBP|英鎊)/iu.test(
      rawInput,
    );
  return hasAmount && hasCashContext;
}

export function buildProposal(
  rawInput: string,
  patch: ParserPatch,
): SnapshotProposal {
  const latest = getLatestSnapshot();
  const accounts = cloneLatest();
  const loans = cloneLatestLoans();
  const relevantAccounts = new Set<AccountStateInput>();
  const relevantLoans = new Set<LoanInput>();
  const warnings = [...patch.warnings];
  const canUpdateCash = hasExplicitCashAmount(rawInput);
  let identityIssue: string | null = null;
  for (const update of patch.accountUpdates) {
    const matchingNames = accounts.filter(
      (item) =>
        accountNameKey(item.name) === accountNameKey(update.accountName),
    );
    const candidates =
      matchingNames.length > 0
        ? matchingNames
        : accounts.filter((item) =>
            sameAccountIdentity(item, {
              name: update.accountName,
              institution: update.institution,
              accountReference: update.accountReference,
            }),
          );
    if (candidates.length > 1) {
      identityIssue = `${update.accountName} 符合多個既有帳戶，請重新輸入完整帳戶名稱與帳戶識別碼，或改用手動新增。`;
      continue;
    }
    let account = candidates[0];
    if (!account && update.institution && !update.accountReference) {
      const sameInstitution = accounts.filter(
        (item) =>
          institutionKey(item.institution) ===
          institutionKey(update.institution),
      );
      if (sameInstitution.length > 0) {
        identityIssue = `${update.institution} 已有帳戶（${sameInstitution.map((item) => item.name).join("、")}），請使用既有帳戶名稱，或填寫帳戶識別碼以建立不同帳戶。`;
        continue;
      }
    }
    if (!account) {
      account = {
        name: canonicalizeAccountName(update.accountName),
        institution: canonicalizeInstitution(update.institution),
        accountType: update.accountType,
        accountReference: update.accountReference,
        defaultCurrency: update.currency,
        cashBalances: [],
        positions: [],
      };
      accounts.push(account);
    }
    relevantAccounts.add(account);
    for (const loan of loans) {
      if (
        (loan.accountId && account.accountId === loan.accountId) ||
        (loan.accountName &&
          accountNameKey(account.name) === accountNameKey(loan.accountName))
      ) {
        relevantLoans.add(loan);
      }
    }
    account.accountReference =
      update.accountReference ?? account.accountReference;
    if (
      canUpdateCash &&
      (account.positions.length === 0 || update.accountType === "brokerage")
    ) {
      account.accountType = update.accountType;
    }
    if (
      canUpdateCash &&
      update.balance !== null &&
      update.balance !== undefined
    ) {
      const balance = account.cashBalances.find(
        (item) => item.currency === update.currency,
      );
      if (balance) balance.amount = update.balance;
      else
        account.cashBalances.push({
          currency: update.currency,
          amount: update.balance,
        });
    }
  }
  for (const update of patch.positionUpdates) {
    const candidates = accounts.filter((item) =>
      sameAccountIdentity(item, { name: update.accountName }),
    );
    if (candidates.length > 1) {
      identityIssue = `${update.accountName} 符合多個既有帳戶，請指定完整帳戶名稱或帳戶識別碼。`;
      continue;
    }
    let account = candidates[0];
    if (!account) {
      account = {
        name: canonicalizeAccountName(update.accountName),
        accountType: "brokerage",
        defaultCurrency: update.market === "US" ? "USD" : "TWD",
        cashBalances: [],
        positions: [],
      };
      accounts.push(account);
    }
    relevantAccounts.add(account);
    if (account.accountType === "cash") {
      warnings.push(
        `${account.name} 是現金帳戶，未加入 ${update.name ?? update.symbol}；請改用銀行或券商帳戶。`,
      );
      continue;
    }
    const existing = account.positions.find(
      (item) => item.market === update.market && item.symbol === update.symbol,
    );
    if (existing) {
      existing.quantity = update.quantity;
      existing.averageCost = update.averageCost;
      if (update.name) existing.name = update.name;
      if (update.providerSymbol)
        existing.providerSymbol = update.providerSymbol;
      existing.positionSide = update.positionSide;
      existing.contractMultiplier = update.contractMultiplier;
      existing.contractExpiry = update.contractExpiry;
    } else
      account.positions.push({
        market: update.market,
        symbol: update.symbol,
        providerSymbol: update.providerSymbol,
        name: update.name ?? update.symbol,
        securityType: update.securityType,
        positionSide: update.positionSide,
        contractMultiplier: update.contractMultiplier,
        contractExpiry: update.contractExpiry,
        quoteCurrency: update.market === "US" ? "USD" : "TWD",
        quantity: update.quantity,
        averageCost: update.averageCost,
        marketPrice: update.averageCost || "1",
        quoteAsOf: new Date().toISOString(),
        quoteSource: "MANUAL",
        quoteStatus: "manual",
        quoteNote: "尚未更新行情",
      });
  }
  for (const update of patch.loanUpdates) {
    const institution = canonicalizeInstitution(update.institution);
    const name = canonicalizeLoanName(update.name, institution);
    const requestedAccountName = update.accountName
      ? canonicalizeAccountName(update.accountName)
      : null;
    let accountCandidates = requestedAccountName
      ? accounts.filter(
          (account) =>
            accountNameKey(account.name) ===
            accountNameKey(requestedAccountName),
        )
      : [];
    if (accountCandidates.length === 0 && institution) {
      const loanInstitution = institutionKey(institution);
      accountCandidates = accounts.filter((account) => {
        const accountInstitution = institutionKey(account.institution);
        return (
          accountInstitution.length > 0 &&
          (loanInstitution.includes(accountInstitution) ||
            accountInstitution.includes(loanInstitution) ||
            accountNameKey(account.name).includes(loanInstitution))
        );
      });
    }
    const linkedAccount =
      accountCandidates.length === 1 ? accountCandidates[0] : undefined;
    if (accountCandidates.length > 1) {
      identityIssue = `${update.name} 可關聯多個帳戶，請指定完整的所屬帳戶名稱。`;
      continue;
    }
    const existing = loans.find((loan) => {
      const belongsToLinkedAccount = Boolean(
        linkedAccount &&
        ((linkedAccount.accountId &&
          loan.accountId === linkedAccount.accountId) ||
          (loan.accountName &&
            accountNameKey(loan.accountName) ===
              accountNameKey(linkedAccount.name))),
      );
      return (
        (!linkedAccount?.accountId ||
          !loan.accountId ||
          loan.accountId === linkedAccount.accountId) &&
        loanNameKey(loan.name, loan.institution) ===
          loanNameKey(name, institution) &&
        (belongsToLinkedAccount ||
          canonicalizeInstitution(loan.institution) === institution) &&
        loan.currency === update.currency
      );
    });
    if (existing) {
      Object.assign(existing, update, {
        name,
        institution,
        accountId: linkedAccount?.accountId ?? existing.accountId ?? null,
        accountName: linkedAccount?.name ?? existing.accountName ?? null,
      });
      relevantLoans.add(existing);
    } else {
      const created = {
        ...update,
        name,
        institution,
        accountId: linkedAccount?.accountId ?? null,
        accountName: linkedAccount?.name ?? requestedAccountName,
      };
      loans.push(created);
      relevantLoans.add(created);
    }
    if (linkedAccount) relevantAccounts.add(linkedAccount);
  }
  for (const sale of patch.sales) {
    const account = accounts.find(
      (item) => accountNameKey(item.name) === accountNameKey(sale.accountName),
    );
    if (account) relevantAccounts.add(account);
  }

  // An account query must always include every liability linked to that
  // account, regardless of how the rule parser represented the query.
  // account update, a position update, a loan update, or a sale.
  for (const account of relevantAccounts) {
    for (const loan of loans) {
      if (
        (loan.accountId && account.accountId === loan.accountId) ||
        (loan.accountName &&
          accountNameKey(account.name) === accountNameKey(loan.accountName))
      ) {
        relevantLoans.add(loan);
      }
    }
  }
  // Keep the relationship symmetrical when a loan is recognized: its owning
  // account must appear in the same confirmation form.
  for (const loan of relevantLoans) {
    const linkedAccount = accounts.find(
      (account) =>
        (loan.accountId && account.accountId === loan.accountId) ||
        (loan.accountName &&
          accountNameKey(account.name) === accountNameKey(loan.accountName)),
    );
    if (linkedAccount) relevantAccounts.add(linkedAccount);
  }
  return {
    rawInput,
    baseSnapshotId: latest?.id ?? null,
    accounts: accounts.filter((account) => relevantAccounts.has(account)),
    preservedAccounts: accounts.filter(
      (account) => !relevantAccounts.has(account),
    ),
    loans: loans.filter((loan) => relevantLoans.has(loan)),
    preservedLoans: loans.filter((loan) => !relevantLoans.has(loan)),
    sales: patch.sales,
    warnings,
    unsupportedReason: identityIssue ?? patch.unsupportedReason,
  };
}
