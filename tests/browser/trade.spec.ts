import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

test('changed quote requires explicit reconfirmation and halt blocks an open confirmation', async ({ page }) => {
  await page.clock.install(); const state = snapshot();
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/trade'); await page.getByLabel('주문 가격 (원)').fill('70000');
  await page.getByRole('button', { name: '매수 주문 확인' }).click();
  state.instruments[0].price += 1000; state.revision++;
  let polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByRole('button', { name: '데모 주문 접수', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('70,000원');
  await page.getByRole('button', { name: '변경된 시세 재확인' }).click();
  await expect(page.getByRole('button', { name: '데모 주문 접수', exact: true })).toBeEnabled();
  state.risk.halted = true; state.revision++;
  polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByRole('button', { name: '데모 주문 접수', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('신규 주문 정지');
});

test('trade shows reserved sells and preserves the code when moving to paper without broker POST', async ({ page }) => {
  const state = snapshot(); state.orders = [{ id: 'sell', requestId: 'sell', code: '005930', side: 'sell', qty: 7, price: 70000, status: 'pending', createdAt: new Date().toISOString(), source: 'manual', fee: 0 }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/trade?code=005930');
  await expect(page.getByLabel('매도 가능 수량')).toHaveText('23주');
  await page.getByLabel('트레이딩 종목').selectOption('000660');
  const link = page.getByRole('link', { name: '선택 종목 KIS 모의 매매' });
  await expect(link).toHaveAttribute('href', '/paper?code=000660');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await link.click(); await expect(page).toHaveURL(/\/paper\?code=000660/);
  expect(posts).toEqual([]);
});

test('lost DEMO response blocks new requests across reload and reconciles by request ID', async ({ page }) => {
  const state = snapshot(); let body: any; let posts = 0;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/orders', route => { body = route.request().postDataJSON(); posts++; return route.abort(); });
  await page.goto('/trade'); await page.getByRole('button', { name: '매수 주문 확인' }).click();
  await page.getByRole('button', { name: '데모 주문 접수', exact: true }).evaluate((b: HTMLButtonElement) => { b.click(); b.click(); });
  await expect(page.getByText('DEMO 주문 응답 미확인', { exact: true })).toBeVisible();
  expect(posts).toBe(1);
  await page.reload(); await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
  state.orders = [{ ...body, id: 'accepted', status: 'pending', source: 'manual', createdAt: new Date().toISOString(), fee: 0 }]; state.revision++;
  await page.getByRole('button', { name: 'DEMO 주문 대조' }).click();
  await expect(page.getByText('접수 · 미체결', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeEnabled();
  expect(posts).toBe(1);
});

test('definitive rejection keeps editable inputs and a lost response retries only the original DEMO request', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); const bodies: unknown[] = []; let mode = 'reject';
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/orders', route => {
    const body = route.request().postDataJSON(); bodies.push(body);
    if (mode === 'reject') return route.fulfill({ status: 400, json: { error: '매도 가능한 보유 수량이 부족합니다.' } });
    if (mode === 'lost') return route.abort();
    return route.fulfill({ json: { order: { ...body, status: 'pending' } } });
  });
  await page.goto('/trade'); await page.getByLabel('주문 가격 (원)').fill('70000');
  await page.getByRole('button', { name: '매수 주문 확인' }).click(); await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('보유 수량이 부족');
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeEnabled();
  await expect(page.getByLabel('주문 가격 (원)')).toHaveValue('70000');
  mode = 'lost';
  await page.getByRole('button', { name: '매수 주문 확인' }).click(); await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
  await expect(page.getByText('DEMO 주문 응답 미확인', { exact: true })).toBeVisible();
  await page.getByLabel('주문 가격 (원)').fill('80000'); mode = 'success';
  await expect(page.getByRole('button', { name: '같은 DEMO 요청 재시도' })).toBeDisabled();
  await page.getByRole('button', { name: '재시도 시세 확인' }).click();
  await expect(page.getByRole('button', { name: '같은 DEMO 요청 재시도' })).toBeEnabled();
  state.instruments[0].price += 1000; state.revision++;
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByRole('button', { name: '같은 DEMO 요청 재시도' })).toBeDisabled();
  await page.getByRole('button', { name: '재시도 시세 확인' }).click();
  await page.getByRole('button', { name: '같은 DEMO 요청 재시도' }).click();
  await expect(page.getByText('접수 · 미체결', { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(3); expect(bodies[2]).toEqual(bodies[1]);
});

test('connection loss blocks confirmation until fresh state and edited price is reviewed again', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); let fail = false;
  await page.route('**/api/state', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state }));
  await page.goto('/trade'); await page.getByRole('button', { name: '매수 주문 확인' }).click();
  fail = true; const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByRole('button', { name: '데모 주문 접수', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('최신 로컬 상태 확인');
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  fail = false; const fresh = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await fresh;
  await page.getByLabel('주문 가격 (원)').fill('65000'); await page.getByLabel('주문 수량 (주)').fill('2');
  await page.getByRole('button', { name: '매수 주문 확인' }).click();
  await expect(page.getByRole('dialog')).toContainText('2주 × 65,000원');
});


test('freshness expiry between render and submit is a definitive local refusal without a pending request', async ({ page }) => {
  const state = snapshot(); await page.clock.install({ time: new Date(state.status.observedAt!) });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let posts = 0; page.on('request', r => { if (r.method() === 'POST') posts++; });
  await page.goto('/trade'); await page.getByRole('button', { name: '매수 주문 확인' }).click();
  await page.clock.setSystemTime(new Date(Date.parse(state.status.observedAt!) + state.status.staleAfterMs + 1));
  await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('최신 로컬 상태');
  await expect(page.getByText('DEMO 주문 응답 미확인', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('demo-order-pending'))).toBeNull(); expect(posts).toBe(0);
});

test('a locally blocked retry retains the original unknown request across reload', async ({ page }) => {
  const state = snapshot(); await page.clock.install({ time: new Date(state.status.observedAt!) });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let posts = 0; await page.route('**/api/orders', route => { posts++; return route.abort(); });
  await page.goto('/trade'); await page.getByRole('button', { name: '매수 주문 확인' }).click();
  await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
  await expect(page.getByText('DEMO 주문 응답 미확인', { exact: true })).toBeVisible();
  const pending = await page.evaluate(() => sessionStorage.getItem('demo-order-pending'));
  await page.getByRole('button', { name: '재시도 시세 확인' }).click();
  await page.clock.setSystemTime(new Date(Date.parse(state.status.observedAt!) + state.status.staleAfterMs + 1));
  await page.getByRole('button', { name: '같은 DEMO 요청 재시도' }).click();
  await expect(page.getByRole('alert')).toContainText('최신 로컬 상태');
  await expect(page.getByText('DEMO 주문 응답 미확인', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('demo-order-pending'))).toBe(pending);
  await page.reload(); await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled(); expect(posts).toBe(1);
});
