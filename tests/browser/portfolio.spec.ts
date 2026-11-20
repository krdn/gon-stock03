import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

function portfolioState() {
  const state = snapshot(); const now = state.status.lastSuccessAt!;
  state.connection = { ...state.connection, configured: true, connected: true, balance: { cash: 1000, totalEquity: 9999, positions: [
    { code: '005930', name: '삼성전자', qty: 2, average: 100, price: 150 },
    { code: '000660', name: 'SK하이닉스', qty: 4, average: 200, price: 175 },
    { code: '069500', name: 'KODEX 200', qty: 0, average: 100, price: 150 },
  ] }, status: { ...state.connection.status, phase: 'ready', complete: true, pages: 2, observedAt: now, lastSuccessAt: now } };
  return state;
}

test('portfolio separates environments and shows totals, weights, PnL and read-only detail links', async ({ page }) => {
  const state = portfolioState(); let mutations = 0;
  page.on('request', req => { if (req.method() === 'POST') mutations++; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');
  await expect(page.getByRole('button', { name: 'KIS 모의', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const summary = page.getByRole('region', { name: '포트폴리오 요약' });
  await expect(summary).toContainText('2,000원'); await expect(summary).not.toContainText('9,999');
  const details = page.getByText('평가 기준과 자산 배분', { exact: true });
  await details.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText(/KIS 계좌 총평가액.*9,999원/)).toBeVisible();
  await expect(page.getByRole('img', { name: '현금과 투자 자산의 비중' })).toBeVisible();
  await page.keyboard.press('Space');
  const samsung = page.getByRole('row').filter({ has: page.getByRole('link', { name: /삼성전자/ }) });
  await expect(samsung).toContainText('300'); await expect(samsung).toContainText('+100'); await expect(samsung).toContainText('15.0%');
  await expect(page.getByRole('row').filter({ hasText: 'SK하이닉스' })).toContainText('-100');
  await expect(page.getByRole('table')).not.toContainText('KODEX 200');
  await expect(page.getByRole('link', { name: /삼성전자/ })).toHaveAttribute('href', '/paper?code=005930');
  await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
  await expect(summary).not.toContainText('2,000원');
  await expect(page.getByRole('table').getByRole('link', { name: /삼성전자/ })).toHaveAttribute('href', '/trade?mode=demo&code=005930');
  expect(mutations).toBe(0);
});

test('portfolio distinguishes disconnected, loading, partial, stale and recovered snapshots', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); let checks = 0;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let release!: () => void; let gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/kis/check', async route => { checks++; await gate; state.connection = portfolioState().connection; await route.fulfill({ json: { connection: state.connection, message: '잔고 전체 조회' } }); });
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { name: 'KIS 잔고를 조회해 주세요' })).toBeVisible();
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toHaveCount(0);
  await page.getByRole('button', { name: 'KIS 잔고 새로고침' }).click();
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('로딩');
  await expect(page.getByRole('button', { name: 'KIS 잔고 새로고침' })).toBeDisabled();
  release(); await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('2,000원');
  expect(checks).toBe(1);
  state.connection.status = { ...state.connection.status, phase: 'partial', complete: false, pages: 1, error: '다음 페이지 조회 실패' }; state.connection.connected = false;
  const updated = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await updated;
  await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: false })).toBeVisible();
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('부분실패');
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toHaveAttribute('href', '/settings');
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('2,000원');
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, pages: 2, error: null, lastSuccessAt: new Date(Date.now() - 120000).toISOString() };
  const stale = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await stale;
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('오래됨');
  gate = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'KIS 잔고 새로고침' }).click();
  await expect(page.locator('.portfolio-warning')).toContainText('KIS 잔고 새로고침 중');
  await expect(page.locator('.portfolio-warning')).toContainText('이전 전체 성공값');
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toHaveCount(0);
  release();
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('정상');
  await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: false })).toHaveCount(0);
  expect(checks).toBe(2);
});

test('portfolio missing price and zero-asset states never show invented money or NaN percentages', async ({ page }) => {
  await page.clock.install(); const state = portfolioState(); state.connection.balance!.positions[0].price = null;
  await page.route('**/api/state', route => route.fulfill({ json: state })); await page.goto('/portfolio');
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('평가 불가');
  await expect(page.getByText(/현재가 누락 1종목/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '삼성전자' })).toContainText('산출 불가');
  await expect(page.locator('body')).not.toContainText('NaN'); await expect(page.locator('body')).not.toContainText('Infinity');
  await page.getByRole('navigation').getByRole('link', { name: '연결·설정', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: '삼성전자' })).toContainText('평가 불가');
  state.connection.balance = { cash: 0, totalEquity: 0, positions: [] };
  await page.getByRole('navigation').getByRole('link', { name: '포트폴리오', exact: true }).click();
  const updated = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await updated;
  await expect(page.getByText('총자산 0원 · 비중을 산출하지 않습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '보유종목 없음' })).toBeVisible();
  await expect(page.locator('svg circle[stroke-dasharray]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('NaN');
  state.cash = 0; state.positions = []; state.revision++;
  const demo = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await demo;
  await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
  await expect(page.getByText('총자산 0원 · 비중을 산출하지 않습니다.', { exact: true })).toBeVisible();
});

test('portfolio detail navigation is environment-specific and layouts stay usable at mobile width', async ({ page }) => {
  const state = portfolioState(); const errors: string[] = []; let posts = 0;
  page.on('pageerror', error => errors.push(error.message)); page.on('request', req => { if (req.method() === 'POST') posts++; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');
  await expect(page.locator('.topbar')).toContainText('DEMO / KIS 모의');
  await page.getByRole('link', { name: /삼성전자/ }).click(); await expect(page).toHaveURL(/\/paper\?code=005930/);
  await expect(page.getByLabel('KIS 종목코드', { exact: true })).toHaveValue('005930'); expect(posts).toBe(0);
  await page.goto('/portfolio'); await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'KIS 잔고 새로고침' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/portfolio-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.screenshot({ path: 'test-results/portfolio-desktop.png', fullPage: true });
  expect(errors).toEqual([]); expect(posts).toBe(0);
});

test('portfolio keeps fractional average purchase prices visible so displayed PnL can be checked', async ({ page }) => {
  const state = portfolioState();
  state.connection.balance!.positions = [{ code: '005930', name: '삼성전자', qty: 2, average: 100.5, price: 150 }];
  await page.route('**/api/state', route => route.fulfill({ json: state })); await page.goto('/portfolio');
  const row = page.getByRole('row').filter({ hasText: '삼성전자' });
  await expect(row.getByRole('cell', { name: '150원', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '100.5원', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '+99원', exact: true })).toBeVisible();
});

test('DEMO selection, stock destination and history survive keyboard navigation and reload', async ({ page }) => {
  const state = portfolioState();
  const mutations: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') mutations.push(req.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portfolio?context=account');
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('2,000원');
  const demo = page.getByRole('button', { name: '로컬 DEMO', exact: true });
  await demo.focus(); await page.keyboard.press('Space');
  await expect(page).toHaveURL(/context=account&environment=demo/);
  await page.reload(); await expect(demo).toHaveAttribute('aria-pressed', 'true');
  const stock = page.getByRole('table').getByRole('link', { name: /삼성전자/ });
  await stock.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'DEMO 연습' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/mode=demo&code=005930/);
  await page.goBack(); await expect(demo).toHaveAttribute('aria-pressed', 'true');
  await page.goBack(); await expect(page.getByRole('button', { name: 'KIS 모의', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(mutations).toEqual([]);
});

test('DEMO first read failure withholds fixture money, later failure retains the confirmed balance', async ({ page }) => {
  const state = portfolioState();
  await page.clock.install();
  let fail = true;
  await page.route('**/api/state', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state }));
  await page.goto('/portfolio?environment=demo');
  const summary = page.getByRole('region', { name: '포트폴리오 요약' });
  await expect(page.getByRole('heading', { name: 'DEMO 계좌 미확인' })).toBeVisible();
  await expect(summary).toHaveCount(0);
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('로컬 확인 없음');
  await page.getByRole('button', { name: 'KIS 모의', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'KIS 계좌 미확인' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'KIS 잔고 새로고침' })).toBeDisabled();
  await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
  fail = false;
  await page.clock.fastForward(3500);
  await expect(summary).toContainText(state.cash.toLocaleString('ko-KR') + '원');
  fail = true;
  await page.clock.fastForward(3500);
  await expect(page.getByText('이전 DEMO 확인값 · 최신 아님', { exact: false })).toBeVisible();
  await expect(summary).toContainText(state.cash.toLocaleString('ko-KR') + '원');
});

for (const timezoneId of ['UTC', 'Asia/Seoul']) {
  test.describe('계좌 기준 시각 ' + timezoneId, () => {
    test.use({ timezoneId });
    test('balance timestamp is KST on both portfolio and dashboard', async ({ page }) => {
      const at = '2026-11-20T01:00:00Z';
      const state = portfolioState();
      await page.clock.setFixedTime(new Date(at));
      state.status.observedAt = state.status.lastSuccessAt = at;
      state.connection.status.lastSuccessAt = at;
      state.connection.status.observedAt = '2026-11-20T01:01:00Z';
      state.connection.status.phase = 'partial';
      state.connection.status.complete = false;
      await page.route('**/api/state', route => route.fulfill({ json: state }));
      await page.goto('/portfolio');
      const selected = page.getByLabel('포트폴리오 조회 상태', { exact: true });
      await expect(selected).toContainText('오전 10:00:00 KST');
      await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: false })).toBeVisible();
      await expect(page.locator('.portfolio-warning')).toContainText('오전 10:01:00 KST');
      const cause = page.getByRole('link', { name: '연결 원인 확인' });
      await cause.focus(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/settings$/); await page.goBack();
      await expect(selected).toContainText('부분실패');
      await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
      await expect(selected).toContainText('오전 10:00:00 KST');
      await page.goto('/dashboard');
      await expect(page.getByLabel('KIS 계좌 요약').getByText(/잔고 최종 전체 성공/)).toContainText('오전 10:00:00 KST');
    });
  });
}

test('partial first read has a cause and no money, and sub-won losses display neutral zero', async ({ page }) => {
  const state = portfolioState();
  const balance = state.connection.balance!;
  delete state.connection.balance;
  state.connection.status = { ...state.connection.status, phase: 'partial', complete: false, lastSuccessAt: null };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { name: 'KIS 잔고 전체 조회 미완료' })).toBeVisible();
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toBeVisible();
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toHaveCount(0);
  balance.positions = [{ code: '005930', name: '삼성전자', qty: 1200, price: 100, average: 100.0001 }];
  state.connection.balance = balance;
  state.connection.status = portfolioState().connection.status;
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: '삼성전자' });
  await expect(row).toContainText('1,200주');
  const pnl = row.getByRole('cell', { name: '0원', exact: true });
  await expect(pnl).toBeVisible();
  await expect(pnl).not.toHaveClass(/up|down/);
  await expect(page.getByRole('region', { name: '포트폴리오 요약' }).getByText('0원', { exact: true })).toBeVisible();
});
