import { test, expect } from '@playwright/test';
test('KIS 포트폴리오에서 계획 요약과 상세 근거를 따로 확인한다', async ({ page }) => {
  const report = {
    id: 'fixture',
    day: '2026-11-16',
    createdAt: '2026-11-15T23:55:00Z',
    cutoff: '2026-11-15T23:55:00Z',
    cash: 1000000,
    equity: 1000000,
    holdings: [],
    conclusion: '가격과 거래량을 확인했어.',
    exposureComplete: true,
    universe: 3000,
    evaluated: 2000,
    watch: [],
    candidates: [
      {
        code: '005930',
        name: '삼성전자',
        held: 0,
        closes: [69000, 70000],
        asOf: '20261113',
        reference: 70000,
        exit: 65000,
        limit: 80000,
        relativeVolume: 1.4,
      },
    ],
    retainedCash: 920000,
    dailyLoss: 10000,
    news: [],
    gaps: [],
    indicators: [],
    approvedAt: null,
  };
  let approved = false;
  await page.route('**/api/morning', (route) =>
    route.fulfill({
      json: { report: { ...report, approvedAt: approved ? report.createdAt : null }, signals: [] },
    }),
  );
  await page.route('**/api/morning/approve', (route) => {
    approved = true;
    return route.fulfill({ json: { message: '승인됨' } });
  });
  await page.goto('/portfolio');
  const summary = page.getByText('근거와 종목별 매매 조건 보기');
  await expect(summary).toBeVisible();
  await expect(page.getByText('삼성전자 · 005930')).not.toBeVisible();
  await summary.click();
  await expect(page.getByText('삼성전자 · 005930')).toBeVisible();
  await page.getByRole('button', { name: '오늘 모의 운용 승인' }).click();
  await expect(page.getByText('오늘 계획 승인됨')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
