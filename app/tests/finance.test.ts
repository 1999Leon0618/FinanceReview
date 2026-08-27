import { describe, expect, it } from 'vitest';
import { calculatePosition, toTaiwanShares } from '@/lib/finance';
import { classifyUnsupportedInput } from '@/lib/parser';

describe('財務計算', () => {
  it('用 Decimal 計算持倉與匯率', () => {
    expect(calculatePosition('10', '100.1', '120.2', '32')).toEqual({
      costValueQuote: '1001', marketValueQuote: '1202', costValueTwd: '32032',
      marketValueTwd: '38464', unrealizedPnlTwd: '6432', unrealizedReturnPct: '20.07992',
    });
  });

  it('臺股一張換算成 1000 股', () => expect(toTaiwanShares('2.5', 'lot')).toBe('2500'));

  it('拒絕部分賣出與買入推算', () => {
    expect(classifyUnsupportedInput('0050 賣出 1000 股')).toContain('剩餘數量');
    expect(classifyUnsupportedInput('今天加碼 AAPL 10 股')).toContain('持有數量');
    expect(classifyUnsupportedInput('0050 已全部賣出')).toBeNull();
  });
});
