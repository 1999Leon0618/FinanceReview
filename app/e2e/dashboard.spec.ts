import { expect, test } from '@playwright/test';

test('建立快照後可從介面完成全部賣出', async ({ page, request }) => {
  const created = await request.post('/api/snapshots', { data: {
    rawInput: '富邦證券現金十萬，0050 3000 股，平均成本 100',
    capturedAt: '2026-08-27T08:00:00.000Z',
    accounts: [{
      name: '富邦證券', institution: '富邦', accountType: 'brokerage', defaultCurrency: 'TWD',
      cashBalances: [{ currency: 'TWD', amount: '100000' }],
      positions: [{ market: 'TWSE', symbol: '0050', name: '元大台灣50', securityType: 'etf', quoteCurrency: 'TWD', quantity: '3000', averageCost: '100', marketPrice: '150', quoteAsOf: '2026-08-27T00:00:00.000Z', quoteSource: 'MANUAL', quoteStatus: 'manual' }],
    }],
  } });
  expect(created.ok()).toBeTruthy();

  await page.goto('/');
  await expect(page.getByText('NT$550,000').first()).toBeVisible();
  await page.getByRole('button', { name: '全部賣出' }).click();
  await expect(page.getByRole('heading', { name: '確認全部賣出' })).toBeVisible();
  await page.getByRole('button', { name: '確認全部賣出' }).last().click();
  await expect(page.getByText('NT$100,000').first()).toBeVisible();
  await expect(page.locator('#sold')).toContainText('0050');
});
