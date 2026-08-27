import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabaseForTests } from '@/lib/db';
import { createSnapshot, exportBackup, getLatestSnapshot, listSales, sellPosition } from '@/lib/repository';
import { buildProposal } from '@/lib/parser';

const temp = mkdtempSync(path.join(tmpdir(), 'finance-review-test-'));
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, 'test.db');

const baseAccount = {
  name: '富邦證券', institution: '富邦', accountType: 'brokerage' as const,
  defaultCurrency: 'TWD', cashBalances: [{ currency: 'TWD', amount: '100000' }],
  positions: [{
    market: 'TWSE' as const, symbol: '0050', name: '元大台灣50', securityType: 'etf' as const,
    quoteCurrency: 'TWD', quantity: '3000', averageCost: '100', marketPrice: '150',
    quoteAsOf: '2026-08-27T00:00:00.000Z', quoteSource: 'TWSE' as const, quoteStatus: 'fresh' as const,
  }],
};

beforeAll(() => closeDatabaseForTests());
afterAll(() => { closeDatabaseForTests(); rmSync(temp, { recursive: true, force: true }); });

describe('快照與全部賣出', () => {
  it('伺服器重算總額', () => {
    const snapshot = createSnapshot({ rawInput: '初始狀態', capturedAt: '2026-08-27T08:00:00.000Z', accounts: [baseAccount] });
    expect(snapshot.totalCashTwd).toBe('100000');
    expect(snapshot.totalSecuritiesTwd).toBe('450000');
    expect(snapshot.totalAssetValueTwd).toBe('550000');
    expect(snapshot.unrealizedPnlTwd).toBe('150000');
  });

  it('原子性建立事件、關閉持倉與移除市值，但不改現金', () => {
    const position = getLatestSnapshot()!.accounts[0].positions[0];
    const result = sellPosition(position.positionId!, { soldAt: '2026-08-28T00:00:00.000Z', salePrice: '151', currency: 'TWD', note: '全部出清' });
    expect(result.totalCashTwd).toBe('100000');
    expect(result.totalSecuritiesTwd).toBe('0');
    expect(result.totalAssetValueTwd).toBe('100000');
    expect(result.accounts[0].positions).toHaveLength(0);
    expect(listSales()).toMatchObject([{ positionId: position.positionId, quantity: '3000', salePrice: '151' }]);
    expect(() => sellPosition(position.positionId!, { soldAt: '2026-08-28T00:00:00.000Z', currency: 'TWD' })).toThrow('已售出');
  });

  it('重新持有同一證券會建立新的持倉週期', () => {
    const soldId = listSales()[0].positionId;
    const previous = getLatestSnapshot()!;
    const next = createSnapshot({ rawInput: '重新持有', baseSnapshotId: previous.id, capturedAt: '2026-09-01T08:00:00.000Z', accounts: [{ ...baseAccount, accountId: previous.accounts[0].accountId, positions: [{ ...baseAccount.positions[0], quantity: '1000', averageCost: '145' }] }] });
    expect(next.accounts[0].positions[0].positionId).not.toBe(soldId);
    expect(listSales()).toHaveLength(1);
  });

  it('分次記錄同一帳戶時保留既有幣別', () => {
    const first = createSnapshot({
      rawInput: '永豐銀行30652',
      capturedAt: '2026-09-02T08:00:00.000Z',
      accounts: [{
        name: '永豐銀行', institution: '永豐', accountType: 'bank',
        defaultCurrency: 'TWD', cashBalances: [{ currency: 'TWD', amount: '30652' }], positions: [],
      }],
    });
    const proposal = buildProposal('永豐銀行日幣60000', {
      unsupportedReason: null,
      accountUpdates: [{
        accountName: '永豐銀行', institution: '永豐', accountType: 'bank',
        currency: 'JPY', balance: '60000',
      }],
      positionUpdates: [], sales: [], warnings: [],
    });

    expect(proposal.baseSnapshotId).toBe(first.id);
    expect(proposal.accounts).toHaveLength(1);
    expect(proposal.accounts[0].cashBalances).toEqual([
      { currency: 'TWD', amount: '30652' },
      { currency: 'JPY', amount: '60000' },
    ]);
  });

  it('JSON 備份包含賣出紀錄但不含行情快取', () => {
    const backup = exportBackup();
    expect(backup.data.position_sales).toHaveLength(1);
    expect(backup.data).not.toHaveProperty('quote_cache');
  });
});
