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
  await expect(page.getByRole('group', { name: '매도 가능 수량' }).locator('strong')).toHaveText('23주');
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

test('unknown instrument and empty snapshot never silently select Samsung', async ({ page }) => {
  const state = snapshot();
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/trade?code=999999');
  await expect(page.getByText('지원하지 않는 DEMO 종목입니다')).toBeVisible();
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '선택 종목 KIS 모의 매매' })).toHaveAttribute('href', '/paper?code=999999');
  state.instruments = []; state.revision++;
  await page.reload();
  await expect(page.getByText('DEMO 종목이 없습니다')).toBeVisible();
});

test('initial state failure does not present fixture cash or order inputs', async ({ page }) => {
  await page.route('**/api/state', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/trade');
  await expect(page.getByText('DEMO 상태를 확인하지 못했습니다')).toBeVisible();
  await expect(page.getByLabel('주문 가격 (원)')).toHaveCount(0);
});

for (const failure of ['corrupt', 'read', 'write', 'remove']) {
  test(`pending storage ${failure} failure blocks new orders without losing the page`, async ({ page }) => {
    const state = snapshot(); let posts = 0; const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/api/state', route => route.fulfill({ json: state }));
    await page.route('**/api/orders', route => { posts++; return route.fulfill({ json: { order: { status: 'pending' } } }); });
    await page.addInitScript(mode => {
      if (mode === 'corrupt') sessionStorage.setItem('demo-order-pending', '{broken');
      const method = mode === 'read' ? 'getItem' : mode === 'write' ? 'setItem' : mode === 'remove' ? 'removeItem' : null;
      if (method) {
        const original = Storage.prototype[method];
        Object.defineProperty(Storage.prototype, method, { value: function (this: Storage, key: string, ...args: string[]) {
          if (key === 'demo-order-pending') throw new DOMException('storage unavailable', 'SecurityError');
          return Reflect.apply(original, this, [key, ...args]);
        } });
      }
    }, failure);
    await page.goto('/trade');
    if (failure === 'write' || failure === 'remove') {
      await page.getByRole('button', { name: '매수 주문 확인' }).click();
      await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
    }
    await expect(page.getByRole('alert').filter({ hasText: '요청 보존 저장소' })).toBeVisible();
    await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
    expect(posts).toBe(failure === 'remove' ? 1 : 0); expect(errors).toEqual([]);
    if (failure === 'remove') {
      await expect(page.getByText('DEMO 요청 보존 확인 필요', { exact: true })).toBeVisible();
      await expect(page.getByText('저장소 문제를 해결하기 전에는 같은 요청 재시도도 차단합니다.', { exact: false })).toBeVisible();
      expect(await page.evaluate(() => sessionStorage.getItem('demo-order-pending'))).not.toBeNull();
      await page.reload();
      await expect(page.getByText('DEMO 주문 응답 미확인', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
      expect(posts).toBe(1);
    }
  });
}

test('order limits, fee-inclusive cash and reserved sells are explained before confirmation', async ({ page }) => {
  const state = snapshot(); state.startingEquity -= state.cash - 70000; state.cash = 70000;
  state.orders = [{ id: 'reserved', requestId: 'reserved', code: '005930', side: 'sell', qty: 29, price: 70000, status: 'pending', source: 'manual', fee: 0, createdAt: new Date().toISOString() }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/trade');
  await page.getByLabel('주문 가격 (원)').fill('70000');
  await expect(page.getByRole('status').filter({ hasText: '수수료를 포함한 주문 금액이 예약 제외 현금을 초과합니다' })).toBeVisible();
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
  await page.getByLabel('주문 수량 (주)').fill('100');
  await expect(page.getByRole('status').filter({ hasText: '1회 주문 한도를 초과합니다.' })).toBeVisible();
  await page.getByRole('button', { name: '매도', exact: true }).click();
  await page.getByLabel('주문 수량 (주)').fill('2');
  await expect(page.getByRole('status').filter({ hasText: '예약 제외 매도 가능 수량을 초과합니다.' })).toBeVisible();
  await page.getByLabel('주문 수량 (주)').fill('1');
  await expect(page.getByRole('button', { name: '매도 주문 확인' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '매도', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('limits refreshed while dialog is open block submission', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); let posts = 0;
  page.on('request', r => { if (r.method() === 'POST') posts++; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/trade'); await page.getByRole('button', { name: '매수 주문 확인' }).click();
  state.risk.maxOrder = 10000; state.revision++;
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByRole('dialog')).toContainText('1회 주문 한도를 초과합니다.');
  await expect(page.getByRole('button', { name: '데모 주문 접수', exact: true })).toBeDisabled();
  expect(posts).toBe(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`trade controls and confirmation fit a ${width}px viewport`, async ({ page }) => {
    const state = snapshot();
    await page.route('**/api/state', route => route.fulfill({ json: state }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/trade');
    await page.getByLabel('트레이딩 종목').selectOption('229200');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.getByRole('button', { name: '60봉', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '매수 주문 확인' }).click();
    const bounds = await page.getByRole('dialog').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: '돌아가기', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
}

for (const limit of ['position', 'loss']) {
  test(`trade explains the ${limit} risk limit before submission`, async ({ page }) => {
    const state = snapshot();
    if (limit === 'position') state.risk.maxPosition = 10000;
    else state.startingEquity += state.risk.dailyLoss;
    await page.route('**/api/state', route => route.fulfill({ json: state }));
    await page.goto('/trade');
    await expect(page.getByRole('status').filter({ hasText: limit === 'position' ? '종목별 최대 투자금을 초과합니다.' : '손실 한도를 초과했습니다.' })).toBeVisible();
    await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
  });
}
