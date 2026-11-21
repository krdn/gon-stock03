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
  await page.goto('/settings/trading/general');
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
  await page.getByText('매매 한도 적용 방식', { exact: true }).press('Enter');
  await expect(page.getByText('주문 1건의 지정가 × 수량', { exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '005930' })).toContainText('140,000');
  await expect(page.getByText('DEMO 시작 자산 − 현재 평가자산, 최솟값 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'KIS 모의 사용량', exact: true }).click();
  await expect(page.getByText('KIS 사용량 미확인', { exact: true })).toBeVisible();
  expect(brokerPosts).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: '매매 한도 변경' })).toBeVisible();
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
  await page.goto('/settings/trading/general'); const input = page.getByLabel('1회 주문 한도 (원)', { exact: true });
  await input.fill('700000'); await page.getByRole('button', { name: '한도 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('입력값을 확인하세요.');
  await expect(input).toHaveValue('700000'); await expect(page.getByText('저장하지 않은 변경이 있습니다.', { exact: true })).toBeVisible();
});

test('successful risk save followed by unavailable polling retains the submitted values', async ({ page }) => {
  const state = snapshot(); let fail = false;
  await page.route('**/api/state', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state }));
  await page.route('**/api/risk', route => { fail = true; return route.fulfill({ json: {} }); });
  await page.goto('/settings/trading/general'); const input = page.getByLabel('1회 주문 한도 (원)', { exact: true });
  await input.fill('700000'); await page.getByRole('button', { name: '한도 저장', exact: true }).click();
  await expect(input).toBeDisabled(); await expect(input).toHaveValue('700000');
});

test('risk environment survives keyboard navigation, refresh, history and saving a shared limit', async ({ page }) => {
  const state = snapshot();
  const posts: string[] = [];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/risk', route => {
    posts.push(route.request().url());
    Object.assign(state.risk, route.request().postDataJSON());
    state.revision++;
    return route.fulfill({ json: {} });
  });
  await page.goto('/risk');
  const demo = page.getByRole('button', { name: 'DEMO 사용량', exact: true });
  const kis = page.getByRole('button', { name: 'KIS 모의 사용량', exact: true });
  await expect(page.getByText('손실 사용량 / 한도')).toBeVisible();
  await demo.focus();
  await page.keyboard.press('Tab');
  await expect(kis).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/\/risk\?env=kis$/);
  await page.reload();
  await expect(kis).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(demo).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(kis).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: '매매 한도 변경' }).press('Enter');
  await expect(page).toHaveURL(/from=risk&env=kis$/);
  await page.getByLabel('1회 주문 한도 (원)', { exact: true }).fill('800000');
  await page.getByRole('button', { name: '한도 저장', exact: true }).click();
  await expect(page.getByText('저장하지 않은 변경이 있습니다.')).toHaveCount(0);
  await page.reload();
  await page.getByRole('link', { name: '위험관리로 돌아가기' }).press('Enter');
  await expect(kis).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('800,000원', { exact: true })).toBeVisible();
  expect(posts).toHaveLength(1);
});

test('risk return links allow only KIS or DEMO in general and fixed settings', async ({ page }) => {
  let fixed = false;
  await page.route('**/api/trading-settings', route => route.fulfill({ json: {
    active: fixed ? { kind: 'once', code: '005930', qty: 1, orderType: 'limit', maxQty: 1, maxAmount: 90000 } : null, plans: {},
  } }));
  for (fixed of [false, true]) {
    for (const [suffix, path] of [['', '/risk'], ['&env=other', '/risk'], ['&env=kis', '/risk?env=kis']]) {
      await page.goto('/settings/trading/general?from=risk' + suffix);
      await expect(page.getByRole('link', { name: '위험관리로 돌아가기' })).toHaveAttribute('href', path);
    }
  }
  await page.goto('/risk?env=other');
  await expect(page.getByRole('button', { name: 'DEMO 사용량' })).toHaveAttribute('aria-pressed', 'true');
});

test('risk separates an empty position list from partial balance, stale orders and missing ledger', async ({ page }) => {
  const state = snapshot();
  state.positions = [];
  state.risk.halted = true;
  state.connection.status.phase = 'partial';
  state.paperRisk = { day: '20261120', baselineEquity: null, unresolvedCount: 0,
    orders: { observedAt: new Date(Date.now() - 65000).toISOString(), rows: [] } };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/risk');
  await expect(page.getByText('보유·미체결 없음', { exact: true })).toBeVisible();
  await expect(page.getByText('위험관리 이벤트 없음', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'KIS 모의 사용량' }).click();
  await expect(page.getByText(/KIS 잔고 일부만 수신/)).toBeVisible();
  await expect(page.getByText(/주문 대조 후 60초 경과/)).toBeVisible();
  await expect(page.getByRole('link', { name: '연결·잔고 확인' })).toHaveAttribute('href', '/settings');
  await expect(page.getByRole('link', { name: 'KIS 주문 대조', exact: true })).toHaveAttribute('href', '/paper');
  await expect(page.getByText('보유·미체결 없음', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '신규 주문 허용' })).toBeEnabled();
  state.paperRisk = undefined;
  await page.reload();
  await expect(page.getByText(/주문 원장 상태 미확인 · 새로고침/)).toBeVisible();
  await expect(page.getByRole('button', { name: '신규 주문 허용' })).toBeDisabled();
});

test('risk hides synthetic initial values and disabled control reports an unavailable server', async ({ page }) => {
  await page.route('**/api/state', route => route.fulfill({ status: 503, json: {} }));
  await page.goto('/risk?env=kis');
  await expect(page.getByText('KIS 사용량 미확인', { exact: true })).toBeVisible();
  await expect(page.getByText('로컬 서버의 최신 상태를 확인하세요.')).toBeVisible();
  await expect(page.getByRole('button', { name: '신규 주문 상태 미확인' })).toBeDisabled();
  await expect(page.getByText('최신 이벤트 미확인')).toBeVisible();
  await expect(page.getByText('1,000,000원', { exact: true })).toHaveCount(0);
});

test('a KIS pending buy without a confirmed price never contributes a zero reservation', async ({ page }) => {
  const state = snapshot();
  const observedAt = state.status.observedAt!;
  state.connection = {
    ...state.connection,
    configured: true, connected: true, checkedAt: observedAt,
    message: '예시 계좌의 전체 잔고를 확인했습니다.',
    injection: { phase: 'present', missing: [] },
    authentication: { ...state.connection.authentication, phase: 'ready', lastSuccessAt: observedAt,
      validUntil: new Date(Date.parse(observedAt) + 3_600_000).toISOString() },
    status: { ...state.connection.status, phase: 'ready', complete: true, pages: 1, observedAt, lastSuccessAt: observedAt },
    balance: { cash: 100000, totalEquity: 100000, positions: [] },
  };
  state.paperRisk = { day: '20261120', baselineEquity: null, unresolvedCount: 0,
    orders: { observedAt, rows: [{ code: '005930', side: 'buy', price: 0, remaining: 1, cancelled: false }] } };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/risk?env=kis');
  const row = page.getByRole('row').filter({ hasText: '005930' });
  await expect(row.getByRole('cell', { name: '미확인', exact: true })).toBeVisible();
  await expect(row.getByText('예약액 미확인')).toBeVisible();
  await expect(row).toContainText('삼성전자');
});

test('resume explains its effect and keeps the loss block and server rejection visible', async ({ page }) => {
  const state = snapshot();
  state.risk.halted = true;
  state.cash -= state.risk.dailyLoss;
  state.paperRisk = { day: '20261120', baselineEquity: null, unresolvedCount: 0, orders: null };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/risk/halt', route => route.fulfill({ status: 400, json: { error: 'KIS 불명 주문을 대조하세요.' } }));
  await page.goto('/risk');
  const resume = page.getByRole('button', { name: '신규 주문 허용' });
  await expect(resume).toHaveAccessibleDescription(/재개하면 신규 주문.*손실 한도 검사/);
  await expect(page.getByText('긴급정지로 신규 주문 차단', { exact: true })).toBeVisible();
  await expect(page.getByText('손실 한도 도달 · 신규 매수·매도 차단', { exact: true })).toBeVisible();
  await resume.press('Enter');
  await expect(page.getByRole('alert')).toContainText('KIS 불명 주문을 대조하세요.');
  await expect(resume).toBeEnabled();
});

test('initial risk loading shows pending controls before a server failure is known', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', async route => {
    await pending;
    await route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/risk');
  await expect(page.getByRole('heading', { name: 'DEMO 사용량 확인 중' })).toBeVisible();
  await expect(page.getByRole('button', { name: '신규 주문 상태 확인 중' })).toBeDisabled();
  await expect(page.getByText('최신 이벤트 확인 중')).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'DEMO 사용량 미확인' })).toBeVisible();
});
