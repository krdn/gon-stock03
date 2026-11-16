import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

function dashboardState() {
  const state = snapshot(); const at = state.status.lastSuccessAt!;
  state.cash = 1000; state.positions = [{ code: '005930', qty: 2, average: 100 }]; state.instruments[0].price = 150;
  state.connection = { ...state.connection, configured: true, connected: true, balance: { cash: 2000, totalEquity: 9999, positions: [{ code: '005930', name: '삼성전자', qty: 3, average: 100, price: 200 }] }, status: { ...state.connection.status, phase: 'ready', complete: true, observedAt: at, lastSuccessAt: at, pages: 1 } };
  state.paperRisk = { day: '20261116', baselineEquity: null, unresolvedCount: 1, orders: { observedAt: at, rows: [{ code: '005930', side: 'buy', price: 200, remaining: 2, cancelled: false }, { code: '005930', side: 'sell', price: 200, remaining: 1, cancelled: true }] } };
  state.events = [{ id: 'risk', time: at, title: '위험 경고', detail: '한도를 확인하세요', level: 'warning', read: false, target: 'risk', environment: 'shared' }];
  return state;
}

test('dashboard separates account arithmetic, reservations, pending orders and cause links without mutations', async ({ page }) => {
  const state = dashboardState(); const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/dashboard');
  const demo = page.getByRole('region', { name: 'DEMO 계좌 요약' });
  const kis = page.getByRole('region', { name: 'KIS 계좌 요약' });
  await expect(demo).toContainText('1,300원'); await expect(demo).toContainText('+100원');
  await expect(demo).toContainText('예약액은 현금에서 아직 차감되지 않음');
  await expect(kis).toContainText('2,600원'); await expect(kis).toContainText('+300원'); await expect(kis).not.toContainText('9,999원');
  await expect(kis).toContainText('미체결 1건'); await expect(kis).toContainText('불명·전송 중 1건');
  await expect(page.getByRole('link', { name: 'DEMO 주문 확인', exact: true })).toHaveAttribute('href', '/orders');
  await expect(page.getByRole('link', { name: 'KIS 주문 대조', exact: true })).toHaveAttribute('href', '/paper');
  await page.getByRole('link', { name: '위험 경고 · 원인 화면' }).click(); await expect(page).toHaveURL(/\/risk/);
  expect(posts).toEqual([]);
});

test('dashboard shows disconnected and failed account without inventing zero balances', async ({ page }) => {
  const state = snapshot(); await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/dashboard'); const kis = page.getByRole('region', { name: 'KIS 계좌 요약' });
  await expect(kis).toContainText('미연결'); await expect(kis).not.toContainText('0원'); await expect(kis).toContainText('미체결 미확인');
  state.connection.status.phase = 'error'; state.connection.status.error = '잔고 조회 실패'; state.revision++;
  await page.reload(); await expect(kis).toContainText('잔고 조회 실패'); await expect(kis).not.toContainText('0원');
});

test('dashboard preserves previous balance on partial failure and marks stale orders and halt', async ({ page }) => {
  const state = dashboardState(); state.connection.status.phase = 'partial'; state.connection.status.complete = false;
  state.connection.status.error = '2페이지 조회 실패'; state.risk.halted = true;
  state.paperRisk!.orders!.observedAt = new Date(Date.now() - 61000).toISOString();
  await page.route('**/api/state', route => route.fulfill({ json: state })); await page.goto('/dashboard');
  const kis = page.getByRole('region', { name: 'KIS 계좌 요약' });
  await expect(kis).toContainText('2,600원'); await expect(kis).toContainText('이전 전체 성공값 · 최신 아님');
  await expect(kis).toContainText('최종 전체 성공'); await expect(kis).toContainText('미체결 미확인');
  await expect(page.getByLabel('대시보드 거래 상태')).toContainText('신규 주문 정지');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('dashboard missing price is not zero and broker zero requires a known snapshot', async ({ page }) => {
  const state = dashboardState(); state.connection.balance!.positions[0].price = null; state.paperRisk!.unresolvedCount = 0; state.paperRisk!.orders!.rows = [];
  await page.route('**/api/state', route => route.fulfill({ json: state })); await page.goto('/dashboard');
  const kis = page.getByRole('region', { name: 'KIS 계좌 요약' }); await expect(kis).toContainText('평가 불가'); await expect(kis).toContainText('미체결 0건');
  state.connection.balance = { cash: 0, totalEquity: 0, positions: [] }; state.revision++;
  await page.reload(); await expect(kis).toContainText('0원'); await expect(kis).not.toContainText('평가 불가');
});

test('dashboard does not call preview ready when the local server is unavailable', async ({ page }) => {
  await page.route('**/api/state', route => route.abort()); await page.goto('/dashboard');
  await expect(page.getByLabel('대시보드 거래 상태')).toContainText('상태 미확인');
  await expect(page.getByRole('region', { name: 'DEMO 계좌 요약' })).toContainText('DEMO 미리보기 · 서버 미확인');
});

test('dashboard refreshes loading and recovered balances and expires order evidence without a broker call', async ({ page }) => {
  await page.clock.install(); const state = dashboardState();
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state })); await page.goto('/dashboard');
  const kis = page.getByRole('region', { name: 'KIS 계좌 요약' });
  await expect(kis).toContainText('미체결 1건');
  state.connection.status.phase = 'loading'; state.connection.status.complete = false;
  let polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(kis).toContainText('로딩'); await expect(kis).toContainText('이전 전체 성공값 · 최신 아님');
  state.connection.status.phase = 'ready'; state.connection.status.complete = true; state.connection.balance!.cash = 3000;
  polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(kis).toContainText('3,600원'); await expect(kis).not.toContainText('이전 전체 성공값');
  await page.screenshot({ path: 'docs/verification/assets/dashboard/kis-fixture-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await kis.screenshot({ path: 'docs/verification/assets/dashboard/kis-fixture-mobile.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  state.status.lastSuccessAt = new Date(Date.parse(state.status.lastSuccessAt!) + 65000).toISOString(); state.status.observedAt = state.status.lastSuccessAt;
  polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(61000); await polled;
  await expect(kis).toContainText('오래됨'); await expect(kis).toContainText('미체결 미확인');
  await page.getByRole('link', { name: 'KIS 주문 대조', exact: true }).click(); await expect(page).toHaveURL(/\/paper/);
  expect(posts).toEqual([]);
});
