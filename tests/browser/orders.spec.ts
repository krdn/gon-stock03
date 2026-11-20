import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

const paper = { requestId: '11111111-1111-4111-8111-111111111111', code: '005930', side: 'buy', qty: 3, price: 70000, createdAt: '2026-11-15T01:00:00.000Z', tradeDate: '20261115', status: 'partial', brokerId: '00001234', filled: 1, remaining: 2, message: 'not for display' };

test('orders searches DEMO name/code together with status and displays fills and reservations separately', async ({ page }) => {
  const state = snapshot(); state.orders = [
    { id: 'pending-id', requestId: 'pending-request', code: '005930', side: 'buy', qty: 2, price: 70000, status: 'pending', createdAt: '2026-11-15T01:00:00Z', source: 'manual', fee: 0 },
    { id: 'filled-id', requestId: 'filled-request', code: '000660', side: 'sell', qty: 1, price: 100000, filledPrice: 101000, status: 'filled', createdAt: '2026-11-15T01:00:00Z', filledAt: '2026-11-15T01:01:00Z', source: 'manual', fee: 16 },
  ];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/orders');
  await page.getByLabel('주문 종목 검색').fill('삼성');
  await expect(page.getByRole('table')).toContainText('pending-id'); await expect(page.getByRole('table')).not.toContainText('filled-id');
  await expect(page.getByRole('table')).toContainText('접수 · 미체결');
  await page.getByRole('button', { name: '체결', exact: true }).click();
  await expect(page.getByText('검색 조건에 맞는 주문이 없습니다')).toBeVisible();
  await page.getByLabel('주문 종목 검색').fill('000660');
  await expect(page.getByRole('table')).toContainText('101,000'); await expect(page.getByRole('table')).toContainText('16원');
  await expect(page.getByRole('table').getByRole('button', { name: '취소', exact: true })).toHaveCount(0);
});

test('KIS ledger is read-only, separates status and dates and links without any POST', async ({ page }) => {
  const state = snapshot(); const posts: string[] = []; let reads = 0;
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/ledger', route => { reads++; return route.fulfill({ json: { orders: [paper, { ...paper, requestId: '22222222-2222-4222-8222-222222222222', status: 'unknown', brokerId: undefined, filled: 0, remaining: 3 }] } }); });
  await page.goto('/orders'); await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('부분체결');
  await expect(page.getByRole('table')).toContainText('20261115');
  await expect(page.getByRole('table')).toContainText('00001234');
  await expect(page.getByText('평균 체결가·수수료는 현재 원장에 미제공')).toBeVisible();
  await expect(page.getByText('로컬 원장 읽기 완료', { exact: false })).toBeVisible();
  await expect(page.getByRole('table')).not.toContainText('not for display');
  await page.getByRole('button', { name: '불명', exact: true }).click();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('table').getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: '원장 다시 읽기' }).click(); expect(reads).toBeGreaterThanOrEqual(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'KIS 원장·복구 화면' }).click();
  await expect(page).toHaveURL(/\/paper\?code=005930/); expect(posts).toEqual([]);
});

test('ledger errors and malformed responses keep last rows without claiming empty or live confirmation', async ({ page }) => {
  let mode = 'ok';
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/ledger', route => mode === 'fail' ? route.fulfill({ status: 500, json: { error: 'private-server-text' } }) : route.fulfill({ json: mode === 'bad' ? { orders: [{ ...paper, remaining: -1 }] } : mode === 'empty' ? { orders: [] } : { orders: [paper] } }));
  await page.goto('/orders'); await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('00001234');
  for (const next of ['fail', 'bad']) {
    mode = next; await page.getByRole('button', { name: '원장 다시 읽기' }).click();
    await expect(page.getByRole('alert')).toContainText('원장을 읽지 못했습니다');
    await expect(page.getByRole('table')).toContainText('00001234');
    await expect(page.getByText('이전에 읽은 원장')).toBeVisible();
    await expect(page.getByText('저장된 KIS 주문이 없습니다')).toHaveCount(0);
    await expect(page.getByText('private-server-text')).toHaveCount(0);
  }
  mode = 'empty'; await page.getByRole('button', { name: '원장 다시 읽기' }).click();
  await expect(page.getByText('저장된 KIS 주문이 없습니다')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('duplicate DEMO cancel sends once and a fill racing ahead is shown after the server refuses cancellation', async ({ page }) => {
  const state = snapshot(); state.orders = [{ id: 'race-order', requestId: 'race-request', code: '005930', side: 'buy', qty: 1, price: 80000, status: 'pending', createdAt: new Date().toISOString(), source: 'manual', fee: 0 }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let posts = 0; let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/orders/cancel', async route => { posts++; await pending; await route.fulfill({ status: 400, json: { error: '미체결 주문만 취소할 수 있습니다.' } }); });
  await page.goto('/orders');
  await page.getByRole('table').getByRole('button', { name: '취소', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect.poll(() => posts).toBe(1);
  state.orders[0].status = 'filled'; state.orders[0].filledPrice = 75000; state.orders[0].fee = 12; state.revision++;
  release();
  await expect(page.getByRole('alert')).toContainText('미체결 주문만');
  await expect(page.getByRole('table')).toContainText('75,000');
  await expect(page.getByRole('table').getByRole('button', { name: '취소', exact: true })).toHaveCount(0);
  expect(posts).toBe(1);
});

test('switching environments discards an older ledger response and first-read failure never looks empty', async ({ page }) => {
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  let reads = 0; let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/kis/ledger', async route => {
    reads++;
    if (reads === 1) { await route.fulfill({ status: 503, json: {} }); return; }
    if (reads === 2) { await pending; await route.fulfill({ json: { orders: [paper] } }); return; }
    await route.fulfill({ json: { orders: [{ ...paper, brokerId: '00005678', status: 'filled', filled: 3, remaining: 0 }] } });
  });
  await page.goto('/orders'); await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('원장을 읽지 못했습니다');
  await expect(page.getByText('저장된 KIS 주문이 없습니다')).toHaveCount(0);
  await page.getByRole('button', { name: '원장 다시 읽기' }).click(); await expect.poll(() => reads).toBe(2);
  await page.getByRole('button', { name: 'DEMO 주문', exact: true }).click();
  await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('00005678'); release();
  await expect(page.getByRole('table')).not.toContainText('00001234');
  await expect(page.getByRole('table')).toContainText('00005678');
});

test('past runs show a separate read-only table and stored check time, including partial archive failure', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [] } }));
  await page.route('**/api/kis/history', route => route.fulfill({ json: { sourceCount: 1, unavailable: ['옛 실행'],
    orders: [{ ...paper, sourceLabel: '테스트 실행', sourceId: '0', lastMatchedAt: '2026-11-15T01:05:20.000Z' }] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orders'); await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await page.getByRole('button', { name: '지난 실행 기록 보기' }).click();
  const table = page.getByRole('table');
  await expect(table).toContainText('테스트 실행'); await expect(table).toContainText('10:05:20');
  await expect(page.getByRole('alert')).toContainText('옛 실행');
  await expect(table.getByRole('link')).toHaveCount(0); await expect(table.getByRole('button')).toHaveCount(0);
  await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(page.getByText('저장된 KIS 주문이 없습니다')).toBeVisible();
  await expect(page.getByText('테스트 실행')).toHaveCount(0); expect(posts).toEqual([]);
});
