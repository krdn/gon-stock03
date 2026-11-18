import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

const accepted = ['accepted', 0, 1, '접수 · 미체결'] as const;
const scenarios = [
  { name: '11/16 취소 응답 후 REST 확정 재생', date: '20261116', qty: 1, price: 195800,
    states: [accepted, ['unknown', 0, 1, '응답 불명 · 대조 필요'], ['cancelled', 0, 0, '취소']] },
  { name: '11/18 시장가 접수 후 체결 재생', date: '20261118', qty: 1, price: 0,
    states: [accepted, ['filled', 1, 0, '체결']] },
  { name: '합성 부분체결 후 잔량 취소', date: '20261118', qty: 3, price: 70000,
    states: [['partial', 1, 2, '부분체결'], ['unknown', 1, 2, '응답 불명 · 대조 필요'], ['cancelled', 1, 0, '취소']] },
] as const;

for (const width of [1440, 390]) {
  for (const scenario of scenarios) {
    test(`${width}px 저장 원장 · ${scenario.name}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
      let step = 0;
      const unexpected: string[] = [];
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (route.request().method() === 'GET') {
          if (path === '/api/state') return route.fulfill({ json: snapshot() });
          if (path === '/api/kis/ledger') {
            const [status, filled, remaining] = scenario.states[step];
            return route.fulfill({ json: { orders: [{
              requestId: 'masked-replay', code: '005930', tradeDate: scenario.date,
              createdAt: scenario.date === '20261116' ? '2026-11-16T06:28:43Z' : '2026-11-18T01:03:14Z',
              side: 'buy', qty: scenario.qty, price: scenario.price, orderType: scenario.price ? undefined : 'market',
              status, filled, remaining, message: '',
            }] } });
          }
        }
        unexpected.push(route.request().method() + ' ' + path);
        return route.abort();
      });
      await page.goto('/orders');
      await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
      const row = page.getByRole('row').filter({ hasText: 'masked-replay' });
      for (const [index, [, filled, remaining, label]] of scenario.states.entries()) {
        if (index > 0) {
          step = index;
          await page.getByRole('button', { name: '원장 다시 읽기' }).click();
        }
        await expect(row.getByRole('cell', { name: label, exact: true })).toBeVisible();
        await expect(row).toContainText(`${scenario.qty} / ${filled} / ${remaining}주`);
      }
      expect(unexpected).toEqual([]);
    });
  }
}
