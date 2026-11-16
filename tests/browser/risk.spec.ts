import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

test('risk save response preserves edits made while the request is pending', async ({ page }) => {
  const state = snapshot(); state.risk.maxOrder = 500000;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/risk', async route => {
    const data = route.request().postDataJSON(); await gate;
    Object.assign(state.risk, data); state.revision++;
    await route.fulfill({ json: {} });
  });
  await page.goto('/risk');
  const input = page.getByLabel('1회 주문 한도 (원)', { exact: true });
  await expect(input).toHaveValue('500000'); await input.fill('600000');
  const requested = page.waitForRequest('**/api/risk'); await page.getByRole('button', { name: '한도 저장', exact: true }).click(); await requested;
  await input.fill('700000');
  const refreshed = page.waitForResponse('**/api/state'); release(); await refreshed;
  await expect(input).toHaveValue('700000');
  await expect(page.getByText('저장하지 않은 변경이 있습니다.', { exact: true })).toBeVisible();
});

test('risk displays DEMO exposure and formulas without treating KIS missing data as zero', async ({ page }) => {
  const state = snapshot();
  state.orders = [{ id: 'pending', requestId: 'pending', code: '005930', side: 'buy', qty: 2, price: 70000, status: 'pending', createdAt: new Date().toISOString(), source: 'manual', fee: 0 }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let brokerPosts = 0;
  await page.route('**/api/kis/**', route => { if (route.request().method() === 'POST') brokerPosts++; return route.fulfill({ status: 503, json: {} }); });
  await page.goto('/risk');
  await expect(page.getByText('주문 1건의 지정가 × 수량', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '005930' })).toContainText('140,000');
  await expect(page.getByText('DEMO 시작 자산 − 현재 평가자산, 최솟값 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'KIS 모의 사용량', exact: true }).click();
  await expect(page.getByText('KIS 사용량 미확인', { exact: true })).toBeVisible();
  expect(brokerPosts).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '한도 저장', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('unknown ledger blocks resume and clears only with a newer reconciled snapshot', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); state.risk.halted = true;
  state.paperRisk = { day: '20261116', baselineEquity: null, unresolvedCount: 1, orders: null };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let posts = 0;
  await page.route('**/api/risk/halt', route => { posts++; state.risk.halted = false; state.revision++; return route.fulfill({ json: {} }); });
  await page.goto('/risk');
  await expect(page.getByText('KIS 불명·전송 중 1건 · 대조 전 재개 금지', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '신규 주문 허용', exact: true })).toBeDisabled();
  expect(posts).toBe(0);
  state.paperRisk.unresolvedCount = 0; state.revision++;
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await page.getByRole('button', { name: '신규 주문 허용', exact: true }).click();
  await expect(page.getByRole('button', { name: '신규 주문 긴급정지', exact: true })).toBeVisible(); expect(posts).toBe(1);
});

test('KIS risk separates its baseline and reservations, and expires without any broker call', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); const observedAt = state.status.lastSuccessAt!;
  state.connection.connected = true; state.connection.configured = true;
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt, lastSuccessAt: observedAt, pages: 1 };
  state.connection.balance = { cash: 800000, totalEquity: 900000, positions: [{ code: '005930', name: '삼성전자', qty: 2, price: 100000, average: 90000 }] };
  state.paperRisk = { day: '20261116', baselineEquity: 1000000, unresolvedCount: 0, orders: { observedAt, rows: [{ code: '005930', side: 'buy', price: 10000, remaining: 1, cancelled: false }, { code: '005930', side: 'sell', price: 100000, remaining: 1, cancelled: false }] } };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/risk'); await page.getByRole('button', { name: 'KIS 모의 사용량', exact: true }).click();
  await expect(page.getByText('100,000원 / 300,000원', { exact: true })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: '005930' });
  await expect(row).toContainText('210,000'); await expect(row).toContainText('1주 / 보유 2주');
  state.paperRisk.baselineEquity = null; state.revision++;
  let polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByText('기준 미설정', { exact: true })).toBeVisible();
  state.status.lastSuccessAt = new Date(Date.parse(observedAt) + 61000).toISOString(); state.status.observedAt = state.status.lastSuccessAt;
  polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(61000); await polled;
  await expect(page.getByText('KIS 사용량 미확인', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '005930' })).toHaveCount(0);
});

test('risk save failure keeps the draft and reports the server reason', async ({ page }) => {
  await page.route('**/api/risk', route => route.fulfill({ status: 400, json: { error: '입력값을 확인하세요.' } }));
  await page.goto('/risk'); const input = page.getByLabel('1회 주문 한도 (원)', { exact: true });
  await input.fill('700000'); await page.getByRole('button', { name: '한도 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('입력값을 확인하세요.');
  await expect(input).toHaveValue('700000'); await expect(page.getByText('저장하지 않은 변경이 있습니다.', { exact: true })).toBeVisible();
});

test('successful risk save followed by unavailable polling retains the submitted values', async ({ page }) => {
  const state = snapshot(); let fail = false;
  await page.route('**/api/state', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state }));
  await page.route('**/api/risk', route => { fail = true; return route.fulfill({ json: {} }); });
  await page.goto('/risk'); const input = page.getByLabel('1회 주문 한도 (원)', { exact: true });
  await input.fill('700000'); await page.getByRole('button', { name: '한도 저장', exact: true }).click();
  await expect(input).toBeDisabled(); await expect(input).toHaveValue('700000');
});
