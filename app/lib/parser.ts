import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { parserPatchSchema } from './validation';
import { getLatestSnapshot } from './repository';
import type { AccountStateInput, ParserPatch, SnapshotProposal } from './types';

const execFileAsync = promisify(execFile);

const systemPrompt = `你是 FinanceReview 的本機資料解析器。只輸出一個 JSON 物件，不要 Markdown。
必須嚴格使用以下結構與英文鍵名，不可改名：
{"unsupportedReason":null,"accountUpdates":[{"accountName":"富邦證券","institution":"富邦","accountType":"brokerage","currency":"TWD","balance":"120000"}],"positionUpdates":[{"accountName":"富邦證券","market":"TWSE","symbol":"0050","name":"元大台灣50","securityType":"etf","quantity":"3000","averageCost":"126.4"}],"sales":[],"warnings":[]}
只解析使用者明確提供的「目前」帳戶餘額、持倉數量與平均成本。不可推算買入、加碼或部分賣出後的數量；遇到這類句子，unsupportedReason 必須說明要使用者改填目前剩餘數量及平均成本。
只有明確「全部賣出／清倉」才可放入 sales，必須含帳戶、市場、代碼、日期；成交價與備註可為 null。
臺股張數需先換算為股數（1 張 = 1000 股）。金額與數量一律用不含逗號的非負十進位字串。市場只能 TWSE/TPEX/US，帳戶類型只能 bank/brokerage/cash，證券類型只能 stock/etf。不得猜測未提供的餘額或成本。`;

function findObject(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    if ('accountUpdates' in row && 'positionUpdates' in row && 'sales' in row) return row;
    for (const child of Object.values(row)) {
      const found = findObject(child);
      if (found) return found;
    }
  }
  if (Array.isArray(value)) for (const item of value) { const found = findObject(item); if (found) return found; }
  if (typeof value === 'string') {
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start >= 0 && end > start) try { return JSON.parse(value.slice(start, end + 1)); } catch { return null; }
  }
  return null;
}

const row = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown) => Array.isArray(value) ? value : [];
const string = (value: unknown, fallback = '') => value === null || value === undefined ? fallback : String(value);
const accountName = (value: Record<string, unknown>) => string(value.accountName ?? value.account_name ?? value.account ?? value.name);

function normalizePatch(value: unknown): unknown {
  const source = row(value);
  return {
    unsupportedReason: source.unsupportedReason ?? source.unsupported_reason ?? null,
    accountUpdates: array(source.accountUpdates ?? source.account_updates).map((item) => {
      const update = row(item);
      return {
        accountName: accountName(update),
        institution: update.institution ?? null,
        accountType: string(update.accountType ?? update.account_type, 'brokerage').toLowerCase(),
        currency: string(update.currency, 'TWD').toUpperCase(),
        balance: update.balance === undefined ? null : string(update.balance),
      };
    }),
    positionUpdates: array(source.positionUpdates ?? source.position_updates).map((item) => {
      const update = row(item);
      const type = string(update.securityType ?? update.security_type ?? update.type, 'stock').toLowerCase();
      return {
        accountName: accountName(update),
        market: string(update.market, 'TWSE').toUpperCase(),
        symbol: string(update.symbol ?? update.code).toUpperCase(),
        name: update.name === undefined ? null : string(update.name),
        securityType: type === 'etf' || type.includes('基金') ? 'etf' : 'stock',
        quantity: string(update.quantity),
        averageCost: string(update.averageCost ?? update.average_cost ?? update.cost),
      };
    }),
    sales: array(source.sales).map((item) => {
      const sale = row(item);
      return {
        accountName: accountName(sale), market: string(sale.market, 'TWSE').toUpperCase(),
        symbol: string(sale.symbol ?? sale.code).toUpperCase(), soldAt: string(sale.soldAt ?? sale.sold_at ?? sale.date),
        salePrice: sale.salePrice === undefined && sale.sale_price === undefined ? null : string(sale.salePrice ?? sale.sale_price),
        note: sale.note === undefined ? null : string(sale.note),
      };
    }),
    warnings: array(source.warnings).map((item) => string(item)),
  };
}

export async function parseNaturalLanguage(rawInput: string): Promise<ParserPatch> {
  const unsupportedReason = classifyUnsupportedInput(rawInput);
  if (unsupportedReason) return { unsupportedReason, accountUpdates: [], positionUpdates: [], sales: [], warnings: [] };
  const stateDir = await mkdtemp(path.join(tmpdir(), 'finance-review-openclaw-'));
  const messageFile = path.join(stateDir, 'request.txt');
  await writeFile(messageFile, `${systemPrompt}\n\n使用者輸入：\n${rawInput}`, 'utf8');
  try {
    const cliArgs = [
      'agent', '--local', '--model', 'ollama/gemma4:26b', '--message-file', messageFile,
      '--session-id', randomUUID(), '--json', '--timeout', '180',
    ];
    const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'openclaw';
    const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'openclaw.cmd', ...cliArgs] : cliArgs;
    const { stdout } = await execFileAsync(command, commandArgs, {
      timeout: 195_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, OPENCLAW_STATE_DIR: stateDir, OLLAMA_API_KEY: 'ollama-local' },
      windowsHide: true,
    });
    const decoded = JSON.parse(stdout) as unknown;
    const object = findObject(decoded);
    if (!object) throw new Error('OpenClaw 未回傳可識別的 JSON');
    return parserPatchSchema.parse(normalizePatch(object));
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤';
    throw new Error(`本機 OpenClaw 解析失敗：${message}`);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

export function classifyUnsupportedInput(rawInput: string): string | null {
  if (/(部分賣出|減碼|賣出\s*\d+(?:\.\d+)?\s*(?:股|張))/.test(rawInput) && !/(全部賣出|全數賣出|清倉)/.test(rawInput)) {
    return '部分賣出不進行交易推算，請改填目前剩餘數量與平均成本。';
  }
  if (/(買入|加碼|增持|新買)/.test(rawInput)) {
    return '買入或加碼不進行交易推算，請改填目前持有數量與平均成本。';
  }
  return null;
}

function cloneLatest(): AccountStateInput[] {
  const latest = getLatestSnapshot();
  return latest?.accounts.map((account) => ({
    accountId: account.accountId, name: account.name, institution: account.institution,
    accountType: account.accountType, accountReference: account.accountReference,
    defaultCurrency: account.defaultCurrency, cashBalances: account.cashBalances,
    positions: account.positions,
  })) ?? [];
}

export function buildProposal(rawInput: string, patch: ParserPatch): SnapshotProposal {
  const latest = getLatestSnapshot();
  const accounts = cloneLatest();
  for (const update of patch.accountUpdates) {
    let account = accounts.find((item) => item.name === update.accountName);
    if (!account) {
      account = { name: update.accountName, institution: update.institution, accountType: update.accountType, defaultCurrency: update.currency, cashBalances: [], positions: [] };
      accounts.push(account);
    }
    account.institution = update.institution ?? account.institution;
    account.accountType = update.accountType;
    if (update.balance !== null && update.balance !== undefined) {
      const balance = account.cashBalances.find((item) => item.currency === update.currency);
      if (balance) balance.amount = update.balance; else account.cashBalances.push({ currency: update.currency, amount: update.balance });
    }
  }
  for (const update of patch.positionUpdates) {
    let account = accounts.find((item) => item.name === update.accountName);
    if (!account) {
      account = { name: update.accountName, accountType: 'brokerage', defaultCurrency: update.market === 'US' ? 'USD' : 'TWD', cashBalances: [], positions: [] };
      accounts.push(account);
    }
    const existing = account.positions.find((item) => item.market === update.market && item.symbol === update.symbol);
    if (existing) { existing.quantity = update.quantity; existing.averageCost = update.averageCost; if (update.name) existing.name = update.name; }
    else account.positions.push({ market: update.market, symbol: update.symbol, name: update.name ?? update.symbol, securityType: update.securityType, quoteCurrency: update.market === 'US' ? 'USD' : 'TWD', quantity: update.quantity, averageCost: update.averageCost, marketPrice: update.averageCost || '1', quoteAsOf: new Date().toISOString(), quoteSource: 'MANUAL', quoteStatus: 'manual', quoteNote: '尚未更新行情' });
  }
  return { rawInput, baseSnapshotId: latest?.id ?? null, accounts, sales: patch.sales, warnings: patch.warnings, unsupportedReason: patch.unsupportedReason };
}
