import { test, expect, type Page } from '@playwright/test';
import { snapshot } from '../snapshot';

const market = (code = '005930', price = 190300) => ({
  quote: { code, price, change: -3.3, upper: 255800, lower: 137800, tickSize: 100, stopped: false, volume: 15771834, receivedAt: new Date().toISOString() },
  bars: [{ date: '20261113', close: 206000 }, { date: '20261116', close: 196800 }, { date: '20261117', close: price }],
});
async function local(page: Page) {
  await page.route('**/api/state', async route => {
    const state = snapshot();
    state.status.staleAfterMs = 3_600_000;
    await route.fulfill({ json: state });
  });
}

test('trade defaults to actual KIS quote and dated bars without demo money or order transmission', async ({ page }) => {
  await local(page); const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.route('**/api/kis/market', route => route.fulfill({ json: market() }));
  await page.goto('/trade');
  await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  await expect(page.getByRole('img', { name: '005930 KIS 수정 일봉 종가 3개' })).toBeVisible();
  await expect(page.getByText('2026-11-17', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '실제 시세', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'KIS 모의 주문 화면' })).toHaveAttribute('href', '/paper?code=005930');
  await expect(page.getByLabel('주문 가격 (원)')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('72,800');
  await expect(page.locator('main')).not.toContainText('8,341,000');
  expect(posts).toEqual(['/api/kis/market']);
});

test('initial quote failure has no synthetic fallback and manual retry recovers', async ({ page }) => {
  await local(page); let fail = true;
  await page.route('**/api/kis/market', route => fail ? route.fulfill({ status: 503, body: 'private-upstream-detail' }) : route.fulfill({ json: market() }));
  await page.goto('/trade');
  await expect(page.getByRole('alert')).toContainText('현재가·일봉을 조회하지 못했습니다');
  await expect(page.getByLabel('실제 시세 상태')).toContainText('수신값 없음');
  await expect(page.getByLabel('실제 현재가')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('72,800');
  await expect(page.locator('main')).not.toContainText('private-upstream-detail');
  fail = false; await page.getByRole('button', { name: '시세 다시 조회' }).click();
  await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
});

test('polling updates the actual quote and a failed refresh preserves a visibly old value', async ({ page }) => {
  await page.clock.install(); await local(page); let price = 190300; let fail = false; let calls = 0;
  await page.route('**/api/kis/market', route => { calls++; return fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: market('005930', price) }); });
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  price = 191000; await page.clock.fastForward(16000);
  await expect(page.getByLabel('실제 현재가')).toHaveText('191,000원');
  fail = true; await page.clock.fastForward(16000);
  await expect(page.getByRole('alert')).toContainText('현재가·일봉을 조회하지 못했습니다');
  await expect(page.getByLabel('실제 현재가')).toHaveText('191,000원');
  await expect(page.getByLabel('실제 시세 상태')).toContainText('이전 수신값 · 최신 아님');
  const failedCalls = calls; await page.clock.fastForward(60000); expect(calls).toBe(failedCalls);
});

test('late response from a previous code cannot replace the selected stock', async ({ page }) => {
  await local(page); let release!: () => void; let oldFinished = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/kis/market', async route => {
    const { code } = route.request().postDataJSON();
    if (code === '005930') { await gate; await route.fulfill({ json: market() }).catch(() => {}); oldFinished = true; }
    else await route.fulfill({ json: market(code, 1080000) });
  });
  const first = page.waitForRequest('**/api/kis/market');
  await page.goto('/trade'); await first;
  await page.getByLabel('실제 시세 종목', { exact: true }).selectOption('000660');
  await expect(page.getByLabel('실제 현재가')).toHaveText('1,080,000원'); release();
  await expect.poll(() => oldFinished).toBe(true);
  await expect(page.getByRole('link', { name: 'KIS 모의 주문 화면' })).toHaveAttribute('href', '/paper?code=000660');
  await expect(page.getByLabel('실제 현재가')).toHaveText('1,080,000원');
});

for (const invalid of ['code', 'bars']) {
  test(`trade rejects mismatched ${invalid} data without showing demo prices`, async ({ page }) => {
    await local(page); const result = market();
    if (invalid === 'code') result.quote.code = '000660'; else result.bars[1].date = result.bars[0].date;
    await page.route('**/api/kis/market', route => route.fulfill({ json: result }));
    await page.goto('/trade');
    await expect(page.getByRole('alert')).toContainText('시세 응답의 종목·가격·일봉을 확인하지 못했습니다');
    await expect(page.getByLabel('실제 현재가')).toHaveCount(0);
  });
}

test('invalid code does not silently switch or call KIS and a direct valid code is preserved', async ({ page }) => {
  await local(page); const calls: string[] = [];
  await page.route('**/api/kis/market', route => { const { code } = route.request().postDataJSON(); calls.push(code); return route.fulfill({ json: market(code) }); });
  await page.goto('/trade?code=wrong');
  await expect(page.getByText('숫자 6자리 종목코드를 입력하세요.', { exact: true })).toBeVisible();
  expect(calls).toEqual([]);
  await page.getByLabel('실제 시세 종목코드').fill('012345');
  await page.getByRole('button', { name: '종목 조회', exact: true }).click();
  await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  expect(calls).toEqual(['012345']);
  await expect(page.getByRole('link', { name: 'KIS 모의 주문 화면' })).toHaveAttribute('href', '/paper?code=012345');
});

test('hidden page pauses price requests and re-entry fetches fresh data', async ({ page }) => {
  await page.clock.install(); await local(page); let calls = 0;
  await page.route('**/api/kis/market', route => { calls++; return route.fulfill({ json: market() }); });
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  const before = calls; await page.clock.fastForward(60000); expect(calls).toBe(before);
  await expect(page.getByLabel('실제 시세 상태')).toContainText('자동 조회 일시정지');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => calls).toBe(before + 1);
});

test('demo is explicit, keeps its environment on stock changes and never requests KIS', async ({ page }) => {
  await local(page); let calls = 0;
  await page.route('**/api/kis/market', route => { calls++; return route.fulfill({ json: market() }); });
  await page.goto('/trade?mode=demo');
  await expect(page.getByRole('button', { name: 'DEMO 연습', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('트레이딩 종목').selectOption('000660');
  await expect(page).toHaveURL(/mode=demo/);
  await expect(page.getByLabel('주문 가격 (원)')).toBeVisible(); expect(calls).toBe(0);
  await page.getByRole('button', { name: '실제 시세', exact: true }).click();
  await expect(page.getByLabel('주문 가격 (원)')).toHaveCount(0);
});

for (const width of [320, 1440]) {
  test(`actual trade fits ${width}px without horizontal overflow`, async ({ page }) => {
    await local(page); await page.route('**/api/kis/market', route => route.fulfill({ json: market() }));
    await page.setViewportSize({ width, height: 900 }); await page.goto('/trade');
    await expect(page.getByLabel('실제 현재가')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('trusted API client errors preserve rate-limit recovery instructions', async ({ page }) => {
  await local(page);
  await page.route('**/api/kis/market', route => route.fulfill({ status: 400, json: { error: '인증 재시도 대기 중입니다. 1분 후 다시 확인하세요.' } }));
  await page.goto('/trade');
  await expect(page.getByRole('alert')).toContainText('1분 후 다시 확인하세요.');
  await expect(page.getByLabel('실제 현재가')).toHaveCount(0);
});

test('local connection loss pauses quotes and recovery resumes without orders', async ({ page }) => {
  await page.clock.install(); let failed = false; let calls = 0;
  await page.route('**/api/state', route => failed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/market', route => { calls++; return route.fulfill({ json: market() }); });
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  failed = true; const response = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await response;
  await expect(page.getByLabel('실제 시세 상태')).toHaveText('로컬 서버 연결 대기');
  await expect(page.getByRole('button', { name: '시세 다시 조회' })).toBeDisabled(); expect(calls).toBe(1);
  failed = false; await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByLabel('실제 시세 상태')).toHaveText('수신 완료');
});

for (const offset of [-120_000, 120_000]) {
  test(`uses server time for fresh and aged KRX quotes with device offset ${offset}`, async ({ page }) => {
    const state = snapshot();
    // Keep common availability independent from the quote clock under test (#157).
    state.status.staleAfterMs = 3_600_000;
    const serverTime = Date.parse(state.status.observedAt!);
    await page.clock.install({ time: new Date(serverTime + offset) });
    await page.route('**/api/state', route => route.fulfill({ json: state }));
    const value = market();
    value.quote.receivedAt = new Date(serverTime - 26_000).toISOString();
    await page.route('**/api/kis/market', route => route.fulfill({ json: value }));
    await page.goto('/trade');
    await expect(page.getByLabel('실제 시세 상태')).toHaveText('수신 완료');
    await expect(page.locator('.trade-quote-time time')).toHaveAttribute('datetime', value.quote.receivedAt);
    await page.clock.fastForward(5500);
    await expect(page.getByLabel('실제 시세 상태')).toHaveText('이전 수신값 · 최신 아님');
    value.quote.receivedAt = new Date(serverTime - 45_000).toISOString();
    await page.getByRole('button', { name: '시세 다시 조회' }).click();
    await expect(page.locator('.trade-quote-time time')).toHaveAttribute('datetime', value.quote.receivedAt);
    await expect(page.getByLabel('실제 시세 상태')).toHaveText('이전 수신값 · 최신 아님');
  });
}

test('keyboard range preserves actual count, code and return URL without extra market reads', async ({ page }) => {
  await local(page);
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.route('**/api/kis/market', route => route.fulfill({ json: market(route.request().postDataJSON().code) }));
  await page.goto('/trade?code=000660&range=bad');
  const range = page.getByRole('group', { name: '일봉 범위' });
  await expect(range.getByRole('button', { name: '60일봉' })).toHaveAttribute('aria-pressed', 'true');
  await range.getByRole('button', { name: '60일봉' }).press('Enter');
  await expect(page).toHaveURL(/range=60/);
  for (const n of [20, 60, 100]) {
    const button = range.getByRole('button', { name: n + '일봉' });
    await button.focus(); await page.keyboard.press('Space');
    await expect(button).toBeFocused();
    await expect(page).toHaveURL(new RegExp('range=' + n));
    await expect(page.getByText(`KIS 수정 종가 · 3개 거래일 (선택 ${n}일) · 마지막 거래일 2026-11-17`)).toBeVisible();
  }
  expect(posts).toEqual(['/api/kis/market']);
  await page.reload();
  await expect(range.getByRole('button', { name: '100일봉' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'KIS 모의 주문 화면' }).press('Enter');
  await expect(page).toHaveURL(/\/paper\?code=000660$/);
  await page.goBack();
  await expect(range.getByRole('button', { name: '100일봉' })).toHaveAttribute('aria-pressed', 'true');
  expect(posts.every(path => path === '/api/kis/market')).toBe(true);
});

test('partial local state retains labeled previous quote and blocks retry', async ({ page }) => {
  const state = snapshot();
  await page.clock.install();
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/market', route => route.fulfill({ json: market() }));
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toBeVisible();
  state.status.phase = 'partial'; state.status.complete = false;
  const response = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await response;
  await expect(page.getByLabel('실제 시세 상태')).toHaveText('로컬 서버 연결 대기');
  await expect(page.locator('.quote').getByText('이전 수신값')).toBeVisible();
  await expect(page.getByRole('button', { name: '시세 다시 조회' })).toBeDisabled();
});
