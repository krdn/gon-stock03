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
  await page.getByLabel('상태 필터').selectOption('filled');
  await expect(page.getByText('검색 조건에 맞는 주문이 없습니다')).toBeVisible();
  await page.getByLabel('주문 종목 검색').fill('000660');
  await expect(page.getByRole('table')).toContainText('101,000');
  await page.locator('tbody summary').click(); await expect(page.getByText('16원', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByRole('button', { name: '취소', exact: true })).toHaveCount(0);
});

test('KIS ledger is read-only, separates status and dates and links without any POST', async ({ page }) => {
  const state = snapshot(); const posts: string[] = []; let reads = 0;
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/ledger', route => { reads++; return route.fulfill({ json: { orders: [paper, { ...paper, requestId: '22222222-2222-4222-8222-222222222222', status: 'unknown', brokerId: undefined, filled: 0, remaining: 3 }] } }); });
  await page.goto('/orders'); await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('부분체결');
  await page.locator('tbody summary').first().click();
  await expect(page.getByText('20261115', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('table')).toContainText('00001234');
  await page.locator('summary').filter({ hasText: '원장 정보' }).click();
  await expect(page.getByText('평균 체결가·수수료는 현재 원장에 미제공')).toBeVisible();
  await expect(page.getByText('로컬 원장 읽기 완료', { exact: false })).toBeVisible();
  await expect(page.getByRole('table')).not.toContainText('not for display');
  await page.getByLabel('상태 필터').selectOption('unknown');
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('table').getByRole('button', {name: /취소|전송|정정/})).toHaveCount(0);
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
  mode = 'fail'; await page.getByRole('button', { name: '원장 다시 읽기' }).click();
  await expect(page.getByRole('alert')).toContainText('원장을 읽지 못했습니다');
  await expect(page.getByText('이전에 읽은 범위는 0건입니다. 현재 건수는 미확인입니다.')).toBeVisible();
  await expect(page.getByText('저장된 KIS 주문이 없습니다')).toHaveCount(0);
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

test('past runs show a separate read-only list and stored check time, including partial archive failure', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [] } }));
  await page.route('**/api/kis/history', route => route.fulfill({ json: { sourceCount: 1, unavailable: ['옛 실행'],
    orders: [{ ...paper, sourceLabel: '테스트 실행', sourceId: '0', lastMatchedAt: '2026-11-15T01:05:20.000Z' }] } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orders'); await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  const historyLink = page.getByRole('button', { name: '지난 실행 기록 보기' });
  await expect(historyLink).toBeVisible();
  expect(await historyLink.evaluate(el => el.getBoundingClientRect().bottom + window.scrollY)).toBeLessThanOrEqual(844);
  await historyLink.click();
  const list = page.getByRole('list', { name: '지난 주문 목록' });
  await expect(list.getByText('테스트 실행')).toBeHidden();
  await expect(list.locator('time')).toContainText('10:05:20');
  await expect(page.getByRole('alert')).toContainText('옛 실행');
  await list.locator('summary').click();
  await expect(list.getByText('테스트 실행')).toBeVisible();
  await expect(list.getByRole('link')).toHaveCount(0);
  await expect(list.getByRole('button', { name: /취소|전송|복구/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(page.getByText('저장된 KIS 주문이 없습니다')).toBeVisible();
  await expect(page.getByText('테스트 실행')).toHaveCount(0); expect(posts).toEqual([]);
});

test('history restores navigation, supports private identifier search and shows the first order without scrolling', async ({ page, context }) => {
  const writes: string[] = [];
  page.on('request', r => { if (r.method() !== 'GET') writes.push(r.method()); });
  await page.route('**/api/state', r => r.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/history', r => r.fulfill({ json: { sourceCount: 1, unavailable: [],
    orders: [{ ...paper, code: '069500', qty: 2, price: 77755, filled: 2, remaining: 0, status: 'filled', tradeDate: '20261120',
      createdAt: '2026-11-20T01:20:00Z', sourceLabel: '예시 원장', sourceId: '0', lastMatchedAt: '2026-11-20T01:20:55Z' },
      { ...paper, requestId: 'other-request', sourceId: '0', tradeDate: '20261114', status: 'unknown', brokerId: undefined }] } }));
  await page.goto('/orders?view=history');
  const list = page.getByRole('list', { name: '지난 주문 목록' }), first = list.getByRole('listitem').first();
  await expect(first.locator('time')).toHaveText(/10:20:55/);
  await expect(first).toContainText('지정가 77,755원');
  await expect(first).toContainText('체결 2주');
  await expect(first).toContainText('전량 체결');
  await expect(first).toContainText('잔량 0주');
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    expect(await first.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await expect(first.getByText(paper.requestId)).toBeHidden();
  const detailsToggle = first.locator('summary');
  await detailsToggle.focus(); await page.keyboard.press('Enter');
  await expect(first.getByText(paper.requestId)).toBeVisible();
  await page.keyboard.press('Space'); await expect(first.getByText(paper.requestId)).toBeHidden();
  const search = page.getByRole('searchbox');
  for (const q of ['KODEX 200','069500','2026-11-20',paper.brokerId,paper.requestId]) {
    await search.fill(q);
    await expect(first.locator('time')).toHaveText(/10:20:55/);
    expect(page.url()).not.toContain(q);
  }
  await expect(first.getByText(paper.requestId)).toBeVisible();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await first.getByRole('button', { name: '앱 요청 ID 복사' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(paper.requestId);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await first.getByRole('button', { name: '앱 요청 ID 복사' }).click();
  await expect(first.getByRole('status')).toContainText('복사 실패');
  await search.fill(''); await expect(first.getByText(paper.requestId)).toBeHidden();
  await page.getByLabel('상태 필터').selectOption('unknown');
  await expect(list.getByText('미확인', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('상태 필터')).toHaveValue('unknown');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'DEMO 주문', exact: true }).click();
  await page.goBack(); await expect(page.getByLabel('상태 필터')).toHaveValue('unknown');
  await search.fill('없는주문'); await page.getByRole('button', { name: '조건 지우기' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(search).toHaveValue(''); expect(page.url()).not.toContain('status=');
  await page.goto('/orders?view=bad&status=bad');
  await expect(page.getByRole('button', { name:'DEMO 주문', exact:true })).toHaveAttribute('aria-pressed','true');
  expect(writes).toEqual([]);
});

test('history keeps health failures, active halt and stale rows visible outside the order details', async ({ page }) => {
  const s = snapshot();
  s.risk.halted = true;
  s.connection.status = { ...s.connection.status, phase: 'error', error: '모의 조회 실패' };
  await page.route('**/api/state', route => route.fulfill({ json: s }));
  let fail = false;
  await page.route('**/api/kis/history', route => fail ? route.fulfill({ status: 503, json: {} })
    : route.fulfill({ json: { sourceCount: 1, unavailable: [], orders: [paper] } }));
  await page.goto('/orders?view=history');
  await expect(page.getByLabel('긴급정지 상태', { exact: true })).toBeVisible();
  await expect(page.getByText('모의 조회 실패', { exact: true })).toBeVisible();
  const row=page.getByRole('listitem').filter({hasText:'005930'});
  await expect(row.locator('.history-unknown')).toHaveText('미확인');
  fail = true; await page.getByRole('button',{name:'원장 다시 읽기'}).click();
  await expect(page.getByText('이전에 읽은 원장')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('원장을 읽지 못했습니다');
  await expect(row).toBeVisible();
  await expect(page.getByText('등록된 지난 실행에 저장된 주문이 없습니다')).toHaveCount(0);
  await page.getByRole('searchbox').fill('없는종목');
  await expect(page.getByText('이전에 읽은 원장')).toBeVisible();
  await page.getByRole('button', {name: '조건 지우기'}).click();
  await expect(row).toBeVisible(); await expect(page.getByRole('searchbox')).toBeFocused();
});

test('a current-session reconciliation refreshes current orders but leaves the archive snapshot alone', async ({ page }) => {
  const s = snapshot();
  s.realtime = { phase: 'ready', required: false, ordersAllowed: false, message: '', code: null,
    lastQuoteAt: null, lastNoticeAt: null, reconciledAt: null, price: null, fresh: false };
  let historyReads = 0, currentReads = 0;
  await page.clock.install();
  await page.route('**/api/state', r => r.fulfill({ json: s }));
  await page.route('**/api/kis/history', r => { historyReads++; return r.fulfill({ json: { orders: [paper], sourceCount: 1, unavailable: [] } }); });
  await page.route('**/api/kis/ledger', r => { currentReads++; return r.fulfill({ json: { orders: [paper] } }); });
  await page.goto('/orders');
  await expect(page.locator('.connection-link')).toHaveText('로컬 서버 연결');
  await page.getByRole('button', {name:'지난 KIS 실행 기록',exact:true}).click();
  await expect(page.getByRole('list', {name: '지난 주문 목록'})).toBeVisible();
  const loaded = historyReads;
  s.risk.halted = true; s.realtime.reconciledAt = '2026-11-15T01:00:00Z';
  await page.clock.fastForward(3100);
  await expect(page.getByLabel('긴급정지 상태', {exact:true})).toContainText('긴급정지 켜짐');
  expect(historyReads).toBe(loaded);
  await page.getByRole('button',{name:'KIS 모의 원장',exact:true}).click(); await expect(page.getByRole('table')).toBeVisible();
  const initial = currentReads; s.realtime.reconciledAt = '2026-11-15T01:00:03Z';
  await page.clock.fastForward(3100);
  await expect.poll(() => currentReads).toBeGreaterThan(initial);
});

test('DEMO distinguishes first-read failure, confirmed empty and stale orders, and blocks stale cancellation', async ({ page }) => {
  const state = snapshot();
  let online = false;
  const writes: string[] = [];
  page.on('request', r => { if (r.method() !== 'GET') writes.push(r.method()); });
  let release!: () => void;
  const firstResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', async r => {
    await firstResponse;
    return online ? r.fulfill({ json: state }) : r.fulfill({ status: 503, json: {} });
  });
  await page.goto('/orders?status=pending');
  await expect(page.getByText('DEMO 주문 확인 중…')).toBeVisible();
  await expect(page.getByText(/DEMO 주문 내역 미확인/)).toHaveCount(0);
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  release();
  await expect(page.getByText(/DEMO 주문 내역 미확인/)).toBeVisible();
  await expect(page.getByText('아직 주문이 없습니다')).toHaveCount(0);
  await expect(page.getByText(/전체 0건/)).toHaveCount(0);
  online = true;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByLabel('상태 필터')).toHaveValue('pending');
  await page.getByLabel('상태 필터').selectOption('all');
  await expect(page.getByText('아직 주문이 없습니다')).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  state.orders = [{ id: 'demo-fixture', requestId: 'demo-request', code: '005930', side: 'buy', qty: 2,
    price: 70000, status: 'pending', createdAt: paper.createdAt, source: 'manual', fee: 0 }];
  await page.reload();
  const cancel = page.getByRole('table').getByRole('button', { name: '취소', exact: true });
  await expect(cancel).toBeEnabled();
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const pos = await cancel.boundingBox();
    expect(pos!.x + pos!.width).toBeLessThanOrEqual(width);
    expect(pos!.y + pos!.height).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  online = false;
  await expect(page.getByText(/이전에 확인한 DEMO 주문/)).toBeVisible({ timeout: 8000 });
  await expect(cancel).toBeDisabled();
  await expect(page.getByRole('button', { name: '다음 데모 봉 재생' })).toBeDisabled();
  expect(writes).toEqual([]);
});

test('current order actions, keyboard details and read time stay separate from the saved KIS match', async ({ page }) => {
  const matched = '2026-11-15T01:05:20Z';
  const demo = snapshot(); const requests: string[] = [];
  let reads = 0;
  await page.clock.install();
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(route.request().method() + ' ' + path);
    if (path === '/api/state') return route.fulfill({ json: demo });
    if (path === '/api/kis/ledger') {
      reads++;
      return route.fulfill({ json: { orders: [{ ...paper, lastMatchedAt: matched }] } });
    }
    return route.abort();
  });
  await page.goto('/orders');
  await expect(page.getByText('아직 주문이 없습니다')).toBeVisible();
  const view = page.getByRole('button', { name: 'KIS 모의 원장', exact: true });
  await view.focus(); await page.keyboard.press('Enter');
  const table = page.getByRole('table', { name: '현재 KIS 주문 목록' });
  const time = table.locator('time'), toggle = table.locator('summary');
  await expect(time).toHaveAttribute('datetime', matched);
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const el of [time, table.getByRole('link'), toggle]) {
      const rect = await el.boundingBox();
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(height);
    }
  }
  await expect(table.getByText(paper.requestId)).toBeHidden();
  const closedPosition = await toggle.boundingBox();
  await toggle.focus(); await page.keyboard.press('Space'); await expect(table.getByText(paper.requestId)).toBeVisible();
  expect(await toggle.boundingBox()).toEqual(closedPosition);
  await page.keyboard.press('Enter'); await expect(table.getByText(paper.requestId)).toBeHidden();
  const filter = page.getByLabel('상태 필터');
  await filter.focus(); await filter.press('Home'); await filter.press('ArrowDown');
  await expect(page).toHaveURL(/status=sending/);
  await filter.selectOption('partial');
  await page.reload(); await expect(filter).toHaveValue('partial');
  await page.getByRole('button', { name: 'DEMO 주문', exact: true }).click(); await page.goBack();
  await expect(filter).toHaveValue('partial'); await expect(time).toHaveAttribute('datetime', matched);
  const beforeReads = reads, readStatus = page.getByRole('status').filter({ hasText: '로컬 원장 읽기 완료' });
  const previous = await readStatus.textContent();
  await page.clock.fastForward(1200);
  await page.getByRole('button', { name: '원장 다시 읽기' }).click();
  await expect(readStatus).not.toHaveText(previous!);
  expect(reads).toBe(beforeReads + 1);
  await expect(time).toHaveAttribute('datetime', matched);
  await page.setViewportSize({ width: 320, height: 844 });
  await table.locator('*').evaluateAll(elements => {
    const sizes = elements.map(el => parseFloat(getComputedStyle(el).fontSize));
    elements.forEach((el, i) => (el as HTMLElement).style.fontSize = sizes[i] * 2 + 'px');
  });
  const recovery = await table.getByRole('link').boundingBox();
  expect(recovery!.x + recovery!.width).toBeLessThanOrEqual((await toggle.boundingBox())!.x);
  await toggle.focus(); await page.keyboard.press('Enter');
  const detail = await table.locator('dl').boundingBox();
  expect(detail!.x).toBeGreaterThanOrEqual(0);
  expect(detail!.x + detail!.width).toBeLessThanOrEqual(320);
  expect([...new Set(requests)].sort()).toEqual(['GET /api/kis/ledger','GET /api/state']);
});

test('orders 4-tab WAI-ARIA help supports keyboard navigation, restores focus and stays open across environment tabs', async ({ page }) => {
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [paper] } }));
  await page.route('**/api/kis/history', route => route.fulfill({ json: { sourceCount: 1, unavailable: [], orders: [paper] } }));
  await page.goto('/orders');

  const toggle = page.getByRole('button', { name: '사용방법 도움말' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: '주문·체결 사용방법 도움말' })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const help = page.getByRole('region', { name: '주문·체결 사용방법 도움말' });
  await expect(help).toBeVisible();

  const tab1 = help.getByRole('tab', { name: '처음부터 따라하기' });
  const tab2 = help.getByRole('tab', { name: '상태·수량·체결 사전' });
  const tab3 = help.getByRole('tab', { name: '원장 대조·안전장치 사전' });
  const tab4 = help.getByRole('tab', { name: '환경별 차이·FAQ' });
  await expect(tab1).toHaveAttribute('aria-selected', 'true');

  await tab1.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab2).toBeFocused();
  await expect(tab2).toHaveAttribute('aria-selected', 'true');
  await expect(help.getByRole('tabpanel')).toContainText('filled + remaining <= qty');

  await page.keyboard.press('End');
  await expect(tab4).toBeFocused();
  await expect(tab4).toHaveAttribute('aria-selected', 'true');
  await expect(help.getByRole('tabpanel')).toContainText('demo-order-pending');

  await page.keyboard.press('ArrowLeft');
  await expect(tab3).toBeFocused();
  await expect(tab3).toHaveAttribute('aria-selected', 'true');
  await expect(help.getByRole('tabpanel')).toContainText('Zero-Mutation Read');

  await page.keyboard.press('Home');
  await expect(tab1).toBeFocused();
  await expect(tab1).toHaveAttribute('aria-selected', 'true');

  // 환경 탭 전환 시 도움말 열림 상태 유지
  await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  await expect(help).toBeVisible();
  await page.getByRole('button', { name: '지난 KIS 실행 기록', exact: true }).click();
  await expect(help).toBeVisible();

  // 닫기 클릭 시 토글 버튼으로 포커스 복귀
  await help.getByRole('button', { name: '닫기' }).click();
  await expect(help).toHaveCount(0);
  await expect(page.getByRole('button', { name: '사용방법 도움말' })).toBeFocused();
  await expect(page.getByRole('button', { name: '사용방법 도움말' })).toHaveAttribute('aria-expanded', 'false');
});

test('DEMO supports side/source sub-filters, pagination over 20 rows, pending request reconciliation and 3-card hub', async ({ page }) => {
  const matchedReqId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const missingReqId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const state = snapshot();
  state.cash = 10_000_000;
  state.strategies = [
    { id: 'strat-1', name: '골든크로스', code: '005930', fast: 5, slow: 20, qty: 1, active: true, lastSignal: 'hold', lastTick: 1, environment: 'demo' },
  ];
  state.orders = [
    { id: 'demo-1', requestId: matchedReqId, code: '005930', side: 'buy', qty: 2, price: 70000, status: 'pending', createdAt: '2026-11-15T01:00:00Z', source: 'manual', fee: 0 },
    { id: 'demo-2', requestId: 'req-filled-buy', code: '005930', side: 'buy', qty: 2, price: 71000, filledPrice: 70000, status: 'filled', createdAt: '2026-11-15T01:01:00Z', filledAt: '2026-11-15T01:02:00Z', source: 'strat-1', fee: 21 },
    { id: 'demo-3', requestId: 'req-pending-sell', code: '000660', side: 'sell', qty: 3, price: 120000, status: 'pending', createdAt: '2026-11-15T01:03:00Z', source: 'strat-1', fee: 0 },
    ...Array.from({ length: 22 }, (_, i) => ({
      id: `demo-extra-${i + 1}`,
      requestId: `req-extra-${i + 1}`,
      code: i % 2 === 0 ? '005930' : '000660',
      side: (i % 2 === 0 ? 'buy' : 'sell') as 'buy' | 'sell',
      qty: 1,
      price: 70000,
      status: 'cancelled' as const,
      createdAt: '2026-11-15T01:04:00Z',
      source: i % 3 === 0 ? 'strat-1' : 'manual',
      fee: 0,
    })),
  ];

  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.addInitScript(input => {
    if (sessionStorage.getItem('demo-order-pending') === null) {
      sessionStorage.setItem('demo-order-pending', JSON.stringify(input));
    }
  }, {
    code: '005930', side: 'buy', qty: 2, price: 70000, requestId: matchedReqId,
  });
  await page.goto('/orders');

  // 페이지네이션: 기본 20건씩 (thead 1 + tbody 20 = 21 rows)
  const table = page.getByRole('table', { name: 'DEMO 주문 목록' });
  await expect(table.getByRole('row')).toHaveCount(21);
  const subToolbar = page.getByRole('region', { name: '주문 세부 필터 및 표시 제어' });
  await expect(subToolbar).toContainText('1–20 / 총 25건');

  await subToolbar.getByRole('button', { name: '다음 페이지' }).click();
  await expect(table.getByRole('row')).toHaveCount(6);
  await expect(subToolbar).toContainText('21–25 / 총 25건');

  await subToolbar.getByLabel('페이지당 표시 건수').selectOption('all');
  await expect(table.getByRole('row')).toHaveCount(26);
  await expect(subToolbar).toContainText('1–25 / 총 25건');

  // 상세 <dl> 검증 (체결 금액 · 지정가 대비 체결 차액 · 앱 요청 ID)
  const filledRow = table.getByRole('row').filter({ hasText: 'demo-2' });
  await filledRow.locator('summary').click();
  await expect(filledRow).toContainText('req-filled-buy');
  await expect(filledRow).toContainText('140,000원');
  await expect(filledRow).toContainText('+2,000원 유리 (주당 1,000원)');

  // 세부 필터 (매매 방향 + 주문 출처) 및 조건 지우기 통합 초기화
  await subToolbar.getByRole('group', { name: '매매 방향 필터' }).getByRole('button', { name: '매도' }).click();
  await subToolbar.getByRole('group', { name: '주문 출처 필터' }).getByRole('button', { name: '전략 주문' }).click();
  await expect(table).toContainText('demo-3');
  await expect(table).not.toContainText('demo-1');
  await expect(table).not.toContainText('demo-2');
  await page.getByRole('button', { name: '조건 지우기' }).click();
  await expect(subToolbar.getByRole('group', { name: '매매 방향 필터' }).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  await expect(subToolbar.getByRole('group', { name: '주문 출처 필터' }).getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');

  // 보존된 DEMO 요청 자동 원장 대조 (일치 케이스)
  const pendingBanner = page.getByRole('region', { name: '보존된 DEMO 요청 원장 대조' });
  await expect(pendingBanner).toContainText(matchedReqId);
  await expect(pendingBanner).toContainText('원장 접수 확인됨 · 상태: 접수 · 미체결');

  // DEMO 3카드 인텔리전스 허브
  const hub = page.getByRole('region', { name: '주문·체결 분석 및 원장 진단 허브' });
  await expect(hub).toContainText('총 주문 25건');
  await expect(hub).toContainText('140,021원');
  await expect(hub).toContainText('예약 제외 가용 현금 9,859,979원');
  await expect(hub).toContainText('누적 수수료 21원 · 지정가 대비 유리 차액 +2,000원');
  await expect(hub).toContainText('활성 DEMO 전략 1개');

  // 미접수 케이스 검증
  await page.evaluate(input => sessionStorage.setItem('demo-order-pending', JSON.stringify(input)), {
    code: '000660', side: 'sell', qty: 1, price: 110000, requestId: missingReqId,
  });
  await page.reload();
  await expect(page.getByRole('region', { name: '보존된 DEMO 요청 원장 대조' })).toContainText('원장 미접수 확인 · 트레이딩 화면에서 재시도 가능');
});

test('KIS current ledger and archive restore priceCeiling/strategy/minimumRun, guard paperRisk and keep zero POSTs', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });

  const state = snapshot();
  let includePaperRisk = false;
  await page.route('**/api/state', route => route.fulfill({
    json: includePaperRisk
      ? { ...state, paperRisk: { day: '20261120', baselineEquity: 10000000, unresolvedCount: 2, orders: null } }
      : state,
  }));

  const cappedStrategyOrder = {
    ...paper,
    requestId: '33333333-3333-4333-8333-333333333333',
    price: 70500,
    priceCeiling: 71000,
    status: 'accepted',
    filled: 0,
    remaining: 3,
    lastMatchedAt: '2026-11-15T01:10:00Z',
    strategy: { id: 'ma-cross', revision: 2, event: 'signal-1', signalBarDate: '20261114', signal: 'buy' },
  };
  const marketOrder = {
    ...paper,
    requestId: '44444444-4444-4444-8444-444444444444',
    code: '000660',
    side: 'sell',
    qty: 1,
    price: 0,
    orderType: 'market',
    status: 'filled',
    filled: 1,
    remaining: 0,
    lastMatchedAt: '2026-11-15T01:15:00Z',
  };

  await page.route('**/api/kis/ledger', route => route.fulfill({
    json: {
      minimumRun: { active: true, requestId: '55555555-5555-4555-8555-555555555555', code: '005930', maxQty: 2 },
      orders: [cappedStrategyOrder, marketOrder],
    },
  }));
  await page.route('**/api/kis/history', route => route.fulfill({
    json: {
      sourceCount: 2,
      unavailable: [],
      orders: [
        { ...cappedStrategyOrder, sourceId: 'run-a', sourceLabel: '비밀 아카이브 라벨', tradeDate: '20261115' },
        { ...marketOrder, sourceId: 'run-b', sourceLabel: '다른 아카이브 라벨', tradeDate: '20261120' },
      ],
    },
  }));

  await page.goto('/orders?view=kis');
  const table = page.getByRole('table', { name: '현재 KIS 주문 목록' });
  await expect(table).toContainText('상한 캡 71,000원');
  await expect(table).toContainText('전략 ma-cross');

  const strategyRow = table.getByRole('row').filter({ hasText: cappedStrategyOrder.requestId });
  await strategyRow.locator('summary').click();
  await expect(strategyRow).toContainText('상한 지정가 캡');
  await expect(strategyRow).toContainText('71,000원');
  await expect(strategyRow).toContainText('주문 기준 금액');
  await expect(strategyRow).toContainText('211,500원');
  await expect(strategyRow).toContainText('전략 ma-cross (rev.2 · 매수 신호 · 기준일 20261114)');

  const marketRow = table.getByRole('row').filter({ hasText: marketOrder.requestId });
  await marketRow.locator('summary').click();
  await expect(marketRow).toContainText('시장가');
  await expect(marketRow).not.toContainText('0원');

  const kisHub = page.getByRole('region', { name: '주문·체결 분석 및 원장 진단 허브' });
  await expect(kisHub).toContainText('불명·전송 중 미확인');
  await expect(kisHub).toContainText('활성 (005930 · 상한 2주)');
  await expect(kisHub.getByRole('link', { name: 'KIS 모의 매매·복구 이동' })).toBeVisible();

  // paperRisk 제공 시 건수 표시 확인
  includePaperRisk = true;
  await page.reload();
  await expect(page.getByRole('region', { name: '주문·체결 분석 및 원장 진단 허브' })).toContainText('불명·전송 중 2건');

  // 지난 KIS 실행 기록 검증 (아카이브 sourceLabel 비노출 + 3카드 허브 + priceCeiling/strategy)
  await page.getByRole('button', { name: '지난 KIS 실행 기록', exact: true }).click();
  const historyList = page.getByRole('list', { name: '지난 주문 목록' });
  await expect(historyList).toContainText('상한 캡 71,000원');
  await expect(page.getByText('비밀 아카이브 라벨')).toBeHidden();
  await expect(page.getByText('다른 아카이브 라벨')).toBeHidden();

  const historyHub = page.getByRole('region', { name: '주문·체결 분석 및 원장 진단 허브' });
  await expect(historyHub).toContainText('2026-11-15 ~ 2026-11-20 (2거래일)');
  await expect(historyHub).toContainText('지정가 1건 (상한 캡 1건) · 시장가 1건');
  await expect(historyHub).toContainText('2개 실행 세션 아카이브');
  await expect(historyHub).not.toContainText('비밀 아카이브 라벨');

  await historyList.locator('summary').first().click();
  await expect(historyList).toContainText('ma-cross · rev.2 · 매수 (20261114)');
  expect(posts).toEqual([]);
});

test('orders page has zero horizontal overflow across 1440, 768, 390 and 320 viewports', async ({ page }) => {
  const state = snapshot();
  state.orders = [
    { id: 'ov-1', requestId: 'req-ov-1', code: '005930', side: 'buy', qty: 2, price: 70000, filledPrice: 69500, status: 'filled', createdAt: '2026-11-15T01:00:00Z', filledAt: '2026-11-15T01:05:00Z', source: 'manual', fee: 21 },
  ];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [paper] } }));
  await page.route('**/api/kis/history', route => route.fulfill({ json: { sourceCount: 1, unavailable: [], orders: [paper] } }));

  await page.goto('/orders');
  await page.getByRole('button', { name: '사용방법 도움말' }).click();

  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
