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

test('risk 4-tab WAI-ARIA help supports keyboard navigation and preserves environment tab order', async ({ page }) => {
  const state = snapshot();
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/risk');

  const demoBtn = page.getByRole('button', { name: 'DEMO 사용량', exact: true });
  const kisBtn = page.getByRole('button', { name: 'KIS 모의 사용량', exact: true });
  const helpToggle = page.getByRole('button', { name: '사용방법 도움말', exact: true });

  // 닫힘 상태에서 기존 DEMO → Tab → KIS 포커스 순서 100% 보존
  await demoBtn.focus();
  await page.keyboard.press('Tab');
  await expect(kisBtn).toBeFocused();

  // 도움말 열기 및 토글 버튼 직후 Tab 1회로 도움말 내부 진입
  await expect(helpToggle).toHaveAttribute('aria-expanded', 'false');
  await helpToggle.click();
  await expect(helpToggle).toHaveAttribute('aria-expanded', 'true');
  const helpRegion = page.getByRole('region', { name: '위험관리 사용방법 도움말' });
  await expect(helpRegion).toBeVisible();
  await page.keyboard.press('Tab');
  expect(await helpRegion.evaluate(el => el.contains(document.activeElement))).toBe(true);

  // 4개 탭 키보드 순환 탐색 (ArrowRight / ArrowLeft / Home / End)
  const tabWorkflow = helpRegion.getByRole('tab', { name: '처음부터 따라하기' });
  const tabLimits = helpRegion.getByRole('tab', { name: '3대 한도·손실·노출 산식 사전' });
  const tabHalt = helpRegion.getByRole('tab', { name: '긴급정지·재개 조건·차단 게이트 사전' });
  const tabFaq = helpRegion.getByRole('tab', { name: '환경별 차이·전략 연동·FAQ' });

  await tabWorkflow.focus();
  await expect(tabWorkflow).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tabLimits).toBeFocused();
  await expect(tabLimits).toHaveAttribute('aria-selected', 'true');
  await expect(helpRegion).toContainText('quote.upper');
  await expect(helpRegion).toContainText('Math.min(risk.dailyLoss, morning.report.dailyLoss)');

  await page.keyboard.press('ArrowRight');
  await expect(tabHalt).toBeFocused();
  await expect(helpRegion).toContainText('unresolvedCount');

  await page.keyboard.press('End');
  await expect(tabFaq).toBeFocused();
  await expect(helpRegion).toContainText('advanceTick');

  // 끝에서 ArrowRight 순환 → 첫 탭, 첫 탭에서 ArrowLeft 순환 → 마지막 탭, Home → 첫 탭
  await page.keyboard.press('ArrowRight');
  await expect(tabWorkflow).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tabFaq).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tabWorkflow).toBeFocused();

  // 닫기 시 토글 버튼 포커스 복귀 및 기존 환경 Tab 순서 재확인
  await helpRegion.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(helpRegion).toHaveCount(0);
  await expect(helpToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(helpToggle).toBeFocused();

  await demoBtn.focus();
  await page.keyboard.press('Tab');
  await expect(kisBtn).toBeFocused();
});

test('risk loss gauge and 3-card diagnostic hub reflect DEMO boundaries, KIS states, and 503 masking', async ({ page }) => {
  const state = snapshot();
  const observedAt = state.status.lastSuccessAt!;
  state.positions = [];
  state.orders = [];
  state.risk.dailyLoss = 300000;
  state.risk.maxOrder = 500000;
  state.risk.maxPosition = 800000;
  // 1) DEMO 정상 (손실 100,000 / 300,000 = 33%, 안전 범위)
  state.cash = state.startingEquity - 100000;
  let mode: 'ok' | '503' = 'ok';
  await page.route('**/api/state', route =>
    mode === '503' ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state }),
  );
  await page.goto('/risk');

  const gauge = page.getByRole('region', { name: '손실 한도 소진율 게이지' });
  const hub = page.getByRole('region', { name: '위험관리 및 주문 게이트 종합 진단 허브' });
  const card1 = hub.locator('.risk-hub-card').nth(0);
  const card3 = hub.locator('.risk-hub-card').nth(2);
  await expect(gauge).toContainText('소진율 33%');
  await expect(gauge).toContainText('잔여 허용 200,000원');
  await expect(gauge).toContainText('안전 범위');
  await expect(card1).toContainText('정상 감시 중 (한도 내 허용)');
  await expect(card3).toContainText('정상 허용 (긴급정지 꺼짐 · 한도 내 주문 가능)');
  await expect(hub).toContainText('보유·미체결 종목 없음 (0종목)');
  await expect(hub).toContainText('신규 종목 기준 1회 가능 500,000원');
  await expect(hub.getByRole('link', { name: '매매 한도 설정 허브' })).toHaveAttribute('href', '/settings/trading/general?from=risk');
  await expect(hub.getByRole('link', { name: '포트폴리오 자산 확인' })).toHaveAttribute('href', '/portfolio?environment=demo');
  await expect(hub.getByRole('link', { name: '전략 스튜디오 확인' })).toHaveAttribute('href', '/strategies?environment=demo');
  await expect(hub.getByRole('link', { name: '전체 알림·이벤트' })).toHaveAttribute('href', '/alerts');

  // 2) DEMO 정확 경계값 도달 (loss === dailyLoss = 300,000, halted: false → 한도 도달 차단)
  state.cash = state.startingEquity - state.risk.dailyLoss;
  state.revision++;
  await page.reload();
  await expect(gauge).toContainText('소진율 100%');
  await expect(gauge).toContainText('잔여 허용 0원');
  await expect(gauge).toContainText('한도 도달 차단');
  await expect(card1).toContainText('일일 손실 한도 도달 (신규 주문 차단)');
  await expect(card3).toContainText('손실 한도 도달 · 신규 매수·매도 차단 (긴급정지 꺼짐)');

  // 3) KIS 모의: 기준 미설정 → 정상(80% 주의) → 불명 주문으로 재개 차단
  state.connection = {
    ...state.connection,
    configured: true,
    connected: true,
    checkedAt: observedAt,
    status: { ...state.connection.status, phase: 'ready', complete: true, observedAt, lastSuccessAt: observedAt, pages: 1 },
    balance: { cash: 750000, totalEquity: 750000, positions: [] },
  };
  state.paperRisk = {
    day: '20261128',
    baselineEquity: null,
    unresolvedCount: 0,
    orders: { observedAt, rows: [] },
  };
  state.revision++;
  await page.goto('/risk?env=kis');
  await expect(gauge).toContainText('첫 주문 검증 전 (손실 기준 미설정)');
  const card1LossDd = card1.locator('div', { has: page.locator('dt', { hasText: '손실 소진율 · 잔여 여유' }) }).locator('dd');
  await expect(card1LossDd).toHaveText('기준 미설정 (첫 주문 검증 전 산출 대기)');
  await expect(card1).not.toContainText('0%');
  await expect(card1).not.toContainText('한도 여유');
  await expect(card1).toContainText('첫 주문 전 기준 미설정 (정상 감시 대기)');
  await expect(card3).toContainText('정상 허용 (긴급정지 꺼짐 · 첫 주문 시 손실 기준 설정)');
  await expect(hub.getByRole('link', { name: '포트폴리오 자산 확인' })).toHaveAttribute('href', '/portfolio');
  await expect(hub.getByRole('link', { name: '전략 스튜디오 확인' })).toHaveAttribute('href', '/strategies?environment=kis-paper');

  // KIS 83% 주의 (loss 250,000 / 300,000)
  state.paperRisk.baselineEquity = 1000000;
  state.revision++;
  await page.reload();
  await expect(gauge).toContainText('소진율 83%');
  await expect(gauge).toContainText('주의 (80% 이상)');
  await expect(card1).toContainText('83% 소진 · 잔여 여유 50,000원');

  // KIS 긴급정지 + 불명 주문 2건 → 재개 차단 진단
  state.risk.halted = true;
  state.paperRisk.unresolvedCount = 2;
  state.revision++;
  await page.reload();
  await expect(card3).toContainText('긴급정지 중 · 재개 차단 (불명·전송 중 2건)');
  await expect(card3).toContainText('불명·전송 중 2건');

  // 4) 서버 503 (!available) 시 초기 fixture 3대 한도 금액 전체 마스킹 검증
  mode = '503';
  await page.goto('/risk?env=kis');
  await expect(hub).toContainText('로컬 상태 미확인');
  await expect(hub).toContainText('주문 가능 상한 미확인');
  await expect(page.getByText('1,000,000원', { exact: true })).toHaveCount(0);
  await expect(page.getByText('4,000,000원', { exact: true })).toHaveCount(0);
  await expect(page.getByText('300,000원', { exact: true })).toHaveCount(0);
  await expect(hub).not.toContainText('1,000,000원');
  await expect(hub).not.toContainText('4,000,000원');
  await expect(hub).not.toContainText('300,000원');
});

test('risk exposure table supports exposure rate column, stock links, search, 4 risk filters, and 5 sorts with nulls last', async ({ page }) => {
  const state = snapshot();
  const observedAt = state.status.lastSuccessAt!;
  state.risk.maxPosition = 1000000;
  state.risk.maxOrder = 600000;
  // DEMO 3종목:
  // - 005930 삼성전자: held 700,000 + pendingBuy 350,000 = 1,050,000 (105%, 한도 도달, room 0)
  // - 000660 SK하이닉스: held 850,000 + pendingBuy 0 = 850,000 (85%, 주의, room 150,000)
  // - 035420 NAVER: held 200,000 + pendingBuy 100,000 = 300,000 (30%, 여유, room 700,000)
  state.instruments[0].price = 70000; // 005930 삼성전자
  state.instruments[1].price = 170000; // 000660 SK하이닉스
  state.instruments[2].price = 200000; // 035420 NAVER
  state.positions = [
    { code: '035420', qty: 1, average: 190000 },
    { code: '005930', qty: 10, average: 68000 },
    { code: '000660', qty: 5, average: 165000 },
  ];
  state.orders = [
    { id: 'b1', requestId: 'b1', code: '005930', side: 'buy', qty: 5, price: 70000, status: 'pending', createdAt: observedAt, source: 'manual', fee: 0 },
    { id: 'b2', requestId: 'b2', code: '035420', side: 'buy', qty: 1, price: 100000, status: 'pending', createdAt: observedAt, source: 'manual', fee: 0 },
  ];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/risk');

  const table = page.getByRole('region', { name: '종목별 한도 사용량' });
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(3);

  // 종목 링크 및 노출률·잔여 한도 셀 검증
  const samsungRow = rows.filter({ hasText: '005930' });
  await expect(samsungRow.getByRole('link')).toHaveAttribute('href', '/trade?mode=demo&code=005930');
  await expect(samsungRow).toContainText('105% · 한도 도달 (여유 0원)');
  await expect(rows.filter({ hasText: '000660' })).toContainText('85% (주의) · 여유 150,000원');
  await expect(rows.filter({ hasText: '035420' })).toContainText('30% · 여유 700,000원');

  // 진단 허브 상호 배타적 분포 & 1회 주문 병목 검증
  const hub = page.getByRole('region', { name: '위험관리 및 주문 게이트 종합 진단 허브' });
  await expect(hub).toContainText('총 3종목 (한도 도달 1 · 주의 1 · 여유 1)');
  await expect(hub).toContainText('삼성전자 005930 1,050,000원 (105%) · 잔여 0원');
  await expect(hub).toContainText('최소 잔여 종목 기준 1회 가능 0원');

  // 위험 상태 필터 4종 검증
  const filterGroup = page.getByRole('group', { name: '위험 상태 필터' });
  await filterGroup.getByRole('button', { name: '주의·한도 도달', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.getByText('표시 2종목 / 전체 3종목')).toBeVisible();

  await filterGroup.getByRole('button', { name: '매수 예약 있음', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: '005930' })).toHaveCount(1);
  await expect(rows.filter({ hasText: '035420' })).toHaveCount(1);

  await filterGroup.getByRole('button', { name: '여유', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('035420');

  await filterGroup.getByRole('button', { name: '전체', exact: true }).click();
  await expect(rows).toHaveCount(3);

  // 다기준 정렬 5종 검증
  const sortSelect = page.getByLabel('종목별 사용량 정렬');
  await sortSelect.selectOption('used-desc');
  await expect(rows.nth(0)).toContainText('005930');
  await expect(rows.nth(1)).toContainText('000660');
  await expect(rows.nth(2)).toContainText('035420');

  await sortSelect.selectOption('room-asc');
  await expect(rows.nth(0)).toContainText('005930');
  await expect(rows.nth(1)).toContainText('000660');
  await expect(rows.nth(2)).toContainText('035420');

  await sortSelect.selectOption('held-desc');
  await expect(rows.nth(0)).toContainText('000660');
  await expect(rows.nth(1)).toContainText('005930');
  await expect(rows.nth(2)).toContainText('035420');

  await sortSelect.selectOption('pending-desc');
  await expect(rows.nth(0)).toContainText('005930');
  await expect(rows.nth(1)).toContainText('035420');
  await expect(rows.nth(2)).toContainText('000660');

  // 검색 및 결과 없음 → 조건 지우기 포커스 복귀
  const search = page.getByRole('searchbox', { name: '종목별 사용량 검색' });
  await search.fill('하이닉스');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('000660');

  await search.fill('존재하지않는종목');
  await expect(page.getByText('조건에 맞는 종목이 없습니다')).toBeVisible();
  await page.locator('.risk-exposure .empty').getByRole('button', { name: '조건 지우기' }).click();
  await expect(search).toBeFocused();
  await expect(rows).toHaveCount(3);

  // KIS 모드에서 used === null ('산출 불가' + 기존 '미확인' 공존) 행이 기본 순서 첫 번째(000660)일 때
  // 정렬 시 항상 마지막 행(last)으로 이동함을 검증
  state.connection = {
    ...state.connection,
    configured: true,
    connected: true,
    checkedAt: observedAt,
    status: { ...state.connection.status, phase: 'ready', complete: true, observedAt, lastSuccessAt: observedAt, pages: 1 },
    balance: {
      cash: 500000,
      totalEquity: 900000,
      positions: [],
    },
  };
  state.paperRisk = {
    day: '20261128',
    baselineEquity: 1000000,
    unresolvedCount: 0,
    orders: {
      observedAt,
      rows: [
        { code: '000660', side: 'buy', price: 0, remaining: 2, cancelled: false },
        { code: '005930', side: 'buy', price: 70000, remaining: 4, cancelled: false },
      ],
    },
  };
  state.revision++;
  await page.goto('/risk?env=kis');

  const kisRows = page.getByRole('region', { name: '종목별 한도 사용량' }).locator('tbody tr');
  await expect(kisRows).toHaveCount(2);
  // 기본 순서에서 null 행(000660)이 첫 번째, 확정 행(005930)이 두 번째
  await expect(kisRows.nth(0)).toContainText('000660');
  await expect(kisRows.nth(1)).toContainText('005930');
  const unknownRow = kisRows.filter({ hasText: '000660' });
  await expect(unknownRow.getByRole('link')).toHaveAttribute('href', '/paper?code=000660');
  await expect(unknownRow.getByRole('cell', { name: '미확인', exact: true })).toBeVisible();
  await expect(unknownRow.getByRole('cell', { name: '산출 불가', exact: true })).toBeVisible();
  await expect(hub).toContainText('일부 종목 노출 미확인');
  await expect(hub).toContainText('일부 종목 잔여 한도 미확인');

  // 사용량 높은 순 / 추가 매수 여유 적은 순 / 매수 예약액 높은 순 모두 null 항목(000660)이 마지막 행으로 이동
  const kisSort = page.getByLabel('종목별 사용량 정렬');
  for (const option of ['used-desc', 'room-asc', 'pending-desc'] as const) {
    await kisSort.selectOption(option);
    await expect(kisRows.first()).toContainText('005930');
    await expect(kisRows.last()).toContainText('000660');
  }
});

test('risk recent events support up to 10 items, 4 category filters, severity/environment badges, and /alerts link', async ({ page }) => {
  const state = snapshot();
  const baseTime = Date.parse(state.status.lastSuccessAt!);
  state.events = [
    { id: 'e1', time: new Date(baseTime - 1000).toISOString(), level: 'warning', title: '신규 주문 긴급정지', detail: '긴급정지 1', read: false, environment: 'shared' },
    { id: 'e2', time: new Date(baseTime - 2000).toISOString(), level: 'info', title: '신규 주문 허용', detail: '재개 1', read: false, environment: 'shared' },
    { id: 'e3', time: new Date(baseTime - 3000).toISOString(), level: 'error', title: 'KIS 주문 요청 차단', detail: 'KIS 한도 초과', read: false, environment: 'kis-paper' },
    { id: 'e4', time: new Date(baseTime - 4000).toISOString(), level: 'warning', title: '전략 주문 차단', detail: 'DEMO 전략 차단', read: false, environment: 'demo' },
    { id: 'e5', time: new Date(baseTime - 5000).toISOString(), level: 'info', title: '위험 한도 변경', detail: '한도 변경 1', read: false, environment: 'shared' },
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `extra-${i}`,
      time: new Date(baseTime - (i + 6) * 1000).toISOString(),
      level: 'warning' as const,
      title: '위험관리 요청 차단',
      detail: `추가 차단 ${i + 1}`,
      read: false,
      environment: 'demo' as const,
    })),
  ];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/risk');

  const eventsPanel = page.locator('.risk-events');
  await expect(eventsPanel.getByRole('link', { name: '전체 이벤트 보기' })).toHaveAttribute('href', '/alerts');
  // 12건 중 최근 최대 10건 표시 및 실제 서버 'KIS 주문 요청 차단' 포함 확인
  await expect(eventsPanel.locator('article.event')).toHaveCount(10);
  await expect(eventsPanel).toContainText('표시 10건 / 최근 10건');
  await expect(eventsPanel).toContainText('KIS 주문 요청 차단');
  await expect(eventsPanel.locator('.risk-event-level', { hasText: '오류' }).first()).toBeVisible();
  await expect(eventsPanel.locator('.risk-event-env', { hasText: 'KIS 모의' }).first()).toBeVisible();
  await expect(eventsPanel.locator('.risk-event-env', { hasText: 'DEMO' }).first()).toBeVisible();
  await expect(eventsPanel.locator('.risk-event-env', { hasText: '공통 위험' }).first()).toBeVisible();

  const catGroup = eventsPanel.getByRole('group', { name: '위험관리 이벤트 분류' });
  await catGroup.getByRole('button', { name: '정지·재개', exact: true }).click();
  await expect(eventsPanel.locator('article.event')).toHaveCount(2);

  await catGroup.getByRole('button', { name: '한도 변경', exact: true }).click();
  await expect(eventsPanel.locator('article.event')).toHaveCount(1);

  await catGroup.getByRole('button', { name: '주문·전략 차단', exact: true }).click();
  await expect(eventsPanel.locator('article.event')).toHaveCount(7);
  await expect(eventsPanel).toContainText('KIS 주문 요청 차단');

  // 특정 분류가 0건일 때 빈 상태 안내 및 전체 보기 복귀
  state.events = state.events.filter(e => e.title !== '위험 한도 변경');
  state.revision++;
  await page.reload();
  await catGroup.getByRole('button', { name: '한도 변경', exact: true }).click();
  await expect(eventsPanel.getByText('선택한 분류의 위험관리 이벤트가 없습니다')).toBeVisible();
  await eventsPanel.getByRole('button', { name: '전체 보기', exact: true }).click();
  await expect(eventsPanel.locator('article.event')).toHaveCount(10);
});

test('risk stays overflow-free across 320/390/768/1440px viewports with zero POST requests on read-only interactions', async ({ page }) => {
  const state = snapshot();
  const observedAt = state.status.lastSuccessAt!;
  state.orders = [
    { id: 'p1', requestId: 'p1', code: '005930', side: 'buy', qty: 2, price: 70000, status: 'pending', createdAt: observedAt, source: 'manual', fee: 0 },
  ];
  state.events = [
    { id: 'ev1', time: observedAt, level: 'warning', title: '신규 주문 긴급정지', detail: '점검용 정지 이벤트', read: false, environment: 'shared' },
  ];
  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(req.url());
  });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/risk');

  // 읽기 전용 상호작용 (도움말·탭·검색·필터·정렬·이벤트 필터·환경 전환)
  await page.getByRole('button', { name: '사용방법 도움말', exact: true }).click();
  await page.getByRole('tab', { name: '3대 한도·손실·노출 산식 사전' }).click();
  await page.getByRole('searchbox', { name: '종목별 사용량 검색' }).fill('005930');
  await page.getByRole('group', { name: '위험 상태 필터' }).getByRole('button', { name: '매수 예약 있음' }).click();
  await page.getByLabel('종목별 사용량 정렬').selectOption('used-desc');
  await page.getByRole('group', { name: '위험관리 이벤트 분류' }).getByRole('button', { name: '정지·재개' }).click();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    const fitsWithHelp = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fitsWithHelp, `overflow with help open at ${viewport.width}px`).toBe(true);
  }

  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: 'KIS 모의 사용량', exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 740 });
    const fitsKis = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fitsKis, `overflow on KIS at ${width}px`).toBe(true);
  }

  expect(posts).toEqual([]);
});

test('risk enforces percentage boundary floors, consistent KIS card-3 gates, and morning effective daily loss', async ({ page }) => {
  const state = snapshot();
  const observedAt = state.status.lastSuccessAt!;
  const seoulDay = new Date(Date.parse(observedAt) + 9 * 3_600_000).toISOString().slice(0, 10);
  const seoulCompact = seoulDay.replaceAll('-', '');

  // 1) 손실 및 종목 노출 경계값: 79.9% → 79%, 80.0% → 80% (주의), 99.9% → 99% (주의), 100.0% → 100% 한도 도달
  state.risk.dailyLoss = 100000;
  state.risk.maxPosition = 1000000;
  const [i0, i1, i2, i3] = state.instruments;
  i0.price = 1000;
  i1.price = 1000;
  i2.price = 1000;
  i3.price = 1000;
  state.positions = [
    { code: i0.code, qty: 799, average: 1000 }, // 79.9%
    { code: i1.code, qty: 800, average: 1000 }, // 80.0%
    { code: i2.code, qty: 999, average: 1000 }, // 99.9%
    { code: i3.code, qty: 1000, average: 1000 }, // 100.0%
  ];
  state.orders = [];
  const positionsEquity = (799 + 800 + 999 + 1000) * 1000;
  // 손실 79,900 / 100,000 = 79.9% → 79% 안전 범위
  state.cash = state.startingEquity - positionsEquity - 79900;

  let morningPayload: {
    report: { id: string; day: string; dailyLoss: number; equity: number | null; approvedAt: string | null } | null;
    run?: { armed: boolean; buyId: string | null };
    signals?: { at: string; code: string; side: string; price: number; outcome: string }[];
  } = { report: null, run: { armed: false, buyId: null }, signals: [] };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/morning', route => route.fulfill({ json: morningPayload }));

  await page.goto('/risk');
  const gauge = page.getByRole('region', { name: '손실 한도 소진율 게이지' });
  const hub = page.getByRole('region', { name: '위험관리 및 주문 게이트 종합 진단 허브' });
  const card1 = hub.locator('.risk-hub-card').nth(0);
  const card3 = hub.locator('.risk-hub-card').nth(2);
  const tableRows = page.getByRole('region', { name: '종목별 한도 사용량' }).locator('tbody tr');

  await expect(gauge).toContainText('소진율 79%');
  await expect(gauge).toContainText('안전 범위');
  await expect(tableRows.filter({ hasText: i0.code })).toContainText('79% · 여유 201,000원');
  await expect(tableRows.filter({ hasText: i1.code })).toContainText('80% (주의) · 여유 200,000원');
  await expect(tableRows.filter({ hasText: i2.code })).toContainText('99% (주의) · 여유 1,000원');
  await expect(tableRows.filter({ hasText: i3.code })).toContainText('100% · 한도 도달 (여유 0원)');

  // 손실 80,000 / 100,000 = 80.0% → 80% 주의 (80% 이상)
  state.cash = state.startingEquity - positionsEquity - 80000;
  state.revision++;
  await page.reload();
  await expect(gauge).toContainText('소진율 80%');
  await expect(gauge).toContainText('주의 (80% 이상)');

  // 손실 99,900 / 100,000 = 99.9% → 99% 주의 (80% 이상), 한도 도달 아님
  state.cash = state.startingEquity - positionsEquity - 99900;
  state.revision++;
  await page.reload();
  await expect(gauge).toContainText('소진율 99%');
  await expect(gauge).toContainText('주의 (80% 이상)');
  await expect(card1).toContainText('99% 소진 · 잔여 여유 100원');

  // 2) KIS halted: false 상태에서 불명 주문 1건 / 주문 대조 60초 경과 시 카드 3 차단·미확인 판정
  state.risk.halted = false;
  state.risk.dailyLoss = 300000;
  state.connection = {
    ...state.connection,
    configured: true,
    connected: true,
    checkedAt: observedAt,
    status: { ...state.connection.status, phase: 'ready', complete: true, observedAt, lastSuccessAt: observedAt, pages: 1 },
    balance: { cash: 850000, totalEquity: 850000, positions: [] },
  };
  state.paperRisk = {
    day: seoulCompact,
    baselineEquity: 1000000,
    unresolvedCount: 1,
    orders: { observedAt, rows: [] },
  };
  state.revision++;
  await page.goto('/risk?env=kis');
  await expect(card3).toContainText('긴급정지 꺼짐 · 불명·전송 중 1건 (대조 전 신규 주문 차단)');

  state.paperRisk = {
    day: seoulCompact,
    baselineEquity: 1000000,
    unresolvedCount: 0,
    orders: { observedAt: new Date(Date.parse(observedAt) - 65000).toISOString(), rows: [] },
  };
  state.revision++;
  await page.reload();
  await expect(card3).toContainText('긴급정지 꺼짐 · 사용량 미확인 (잔고·주문 대조 필요)');

  // 3) KIS /api/morning 장전 운용 계획(승인·무장·당일 일치, dailyLoss: 150,000) 활성 시 손실 150,000원(공통 300,000원 미만)에서 장전 매수 차단
  state.paperRisk = {
    day: seoulCompact,
    baselineEquity: 1000000,
    unresolvedCount: 0,
    orders: { observedAt, rows: [] },
  };
  morningPayload = {
    report: {
      id: 'morning-rep-1',
      day: seoulDay,
      dailyLoss: 150000,
      equity: 1000000,
      approvedAt: observedAt,
    },
    run: {
      armed: true,
      buyId: 'morning-rep-1',
    },
    signals: [],
  };
  state.revision++;
  await page.reload();
  await expect(gauge).toContainText('한도 도달 차단 (장전 매수)');
  await expect(gauge).toContainText('실효 한도 150,000원 · 공통 300,000원 / 장전 계획 150,000원');
  await expect(card1).toContainText('장전 손실 한도 도달 (장전 신규 매수 차단 · 장전 매도는 매도가능수량 내 허용 · 공통 한도 내)');
  await expect(card3).toContainText('장전 손실 한도 도달 · 장전 신규 매수 차단 (긴급정지 꺼짐 · 장전 매도는 매도가능수량 내 허용)');
});

test('risk verifies KIS morning activation gates, refresh sync, 503 failure, stop latch, sell exception, and standalone baseline', async ({ page }) => {
  await page.clock.install();
  const state = snapshot();
  const observedAt = state.status.lastSuccessAt!;
  const seoulDay = new Date(Date.parse(observedAt) + 9 * 3_600_000).toISOString().slice(0, 10);
  const seoulCompact = seoulDay.replaceAll('-', '');
  const prevDay = new Date(Date.parse(observedAt) + 9 * 3_600_000 - 86_400_000).toISOString().slice(0, 10);

  const posts: string[] = [];
  page.on('request', req => {
    if (req.method() === 'POST') posts.push(req.url());
  });

  state.risk.halted = false;
  state.risk.dailyLoss = 300000;
  state.connection = {
    ...state.connection,
    configured: true,
    connected: true,
    checkedAt: observedAt,
    status: { ...state.connection.status, phase: 'ready', complete: true, observedAt, lastSuccessAt: observedAt, pages: 1 },
    balance: { cash: 850000, totalEquity: 850000, positions: [] },
  };
  state.paperRisk = {
    day: seoulCompact,
    baselineEquity: 1000000,
    unresolvedCount: 0,
    orders: { observedAt, rows: [] },
  };

  let morningStatusCode = 200;
  let morningGate: Promise<void> | null = null;
  let morningPayload: {
    report: { id: string; day: string; dailyLoss: number; equity: number | null; approvedAt: string | null } | null;
    run: { armed: boolean; buyId: string | null };
    signals: { at: string; code: string; side: string; price: number; outcome: string }[];
  } = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 1000000, approvedAt: null },
    run: { armed: true, buyId: 'rep-1' },
    signals: [],
  };

  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/morning', async route => {
    if (morningGate) await morningGate;
    if (morningStatusCode !== 200) {
      await route.fulfill({ status: morningStatusCode, json: { error: 'morning unavailable' } });
      return;
    }
    await route.fulfill({ json: morningPayload });
  });

  await page.goto('/risk?env=kis');
  const gauge = page.getByRole('region', { name: '손실 한도 소진율 게이지' });
  const hub = page.getByRole('region', { name: '위험관리 및 주문 게이트 종합 진단 허브' });
  const card1 = hub.locator('.risk-hub-card').nth(0);
  const card3 = hub.locator('.risk-hub-card').nth(2);

  // 1-a) 미승인 보고서(approvedAt: null) → 로딩 완료 후 장전 비활성 유지 (공통 150k / 300k = 50% 안전 범위)
  await expect(hub).not.toContainText('장전 상태 확인 중');
  await expect(gauge).toContainText('소진율 50%');
  await expect(gauge).toContainText('안전 범위');
  await expect(card3).toContainText('정상 허용 (긴급정지 꺼짐 · 한도 내 주문 가능)');

  // 1-b) 비무장(run.armed: false) → 로딩 완료 후 장전 비활성 유지
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 1000000, approvedAt: observedAt },
    run: { armed: false, buyId: 'rep-1' },
    signals: [],
  };
  await page.reload();
  await expect(hub).not.toContainText('장전 상태 확인 중');
  await expect(gauge).toContainText('소진율 50%');
  await expect(card1).not.toContainText('장전 운용 계획 병행');

  // 1-c) buyId 불일치 → 로딩 완료 후 장전 비활성 유지
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 1000000, approvedAt: observedAt },
    run: { armed: true, buyId: 'rep-other' },
    signals: [],
  };
  await page.reload();
  await expect(hub).not.toContainText('장전 상태 확인 중');
  await expect(gauge).toContainText('소진율 50%');
  await expect(card1).not.toContainText('장전 운용 계획 병행');

  // 1-d) 전일 보고서(day !== currentSeoulDay) → 로딩 완료 후 장전 비활성 유지
  morningPayload = {
    report: { id: 'rep-prev', day: prevDay, dailyLoss: 150000, equity: 1000000, approvedAt: observedAt },
    run: { armed: true, buyId: 'rep-prev' },
    signals: [],
  };
  await page.reload();
  await expect(hub).not.toContainText('장전 상태 확인 중');
  await expect(gauge).toContainText('소진율 50%');
  await expect(card1).not.toContainText('장전 운용 계획 병행');

  // 2) 같은 날 승인·무장 후 상태 갱신(status.observedAt 변경) 시 재조회 중 '장전 상태 확인 중' 전환 후 장전 활성 반영
  const nextAt = new Date(Date.parse(observedAt) + 3500).toISOString();
  state.status.observedAt = nextAt;
  state.status.lastSuccessAt = nextAt;
  state.revision++;
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 1000000, approvedAt: nextAt },
    run: { armed: true, buyId: 'rep-1' },
    signals: [],
  };
  let releaseMorning!: () => void;
  morningGate = new Promise<void>(resolve => { releaseMorning = resolve; });
  const morningRequested = page.waitForRequest('**/api/morning');
  const morningRefreshed = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await morningRequested;
  await expect(card1).toContainText('장전 상태 확인 중');
  await expect(card3).toContainText('장전 상태 확인 중');
  await expect(card3).not.toContainText('정상 허용');
  morningGate = null;
  releaseMorning();
  await morningRefreshed;
  await expect(hub).not.toContainText('장전 상태 확인 중');
  await expect(gauge).toContainText('한도 도달 차단 (장전 매수)');
  await expect(card1).toContainText('장전 운용 계획 병행');

  // 3) /api/morning 503 조회 실패 → 비활성(정상 허용)으로 둔갑 금지, '장전 상태 미확인' 명시
  morningStatusCode = 503;
  const at3 = new Date(Date.parse(nextAt) + 3500).toISOString();
  state.status.observedAt = at3;
  state.status.lastSuccessAt = at3;
  state.revision++;
  const morningFailed = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await morningFailed;
  await expect(card1).toContainText('장전 상태 미확인 (조회 실패)');
  await expect(card3).toContainText('장전 상태 미확인 (조회 실패)');
  await expect(card3).not.toContainText('정상 허용');

  // 4) 당일 정지 신호 기록 후 평가액 회복(손실 20,000원 < 150,000원) → 장전 당일 손실 정지 래치 유지
  morningStatusCode = 200;
  state.connection.balance!.totalEquity = 980000;
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 1000000, approvedAt: observedAt },
    run: { armed: true, buyId: 'rep-1' },
    signals: [
      { at: at3, code: '005930', side: 'buy', price: 70000, outcome: '오늘은 손실 한도로 새 매수를 중단했습니다.' },
    ],
  };
  const at4 = new Date(Date.parse(at3) + 3500).toISOString();
  state.status.observedAt = at4;
  state.status.lastSuccessAt = at4;
  state.revision++;
  const latchRefreshed = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await latchRefreshed;
  await expect(gauge).toContainText('장전 당일 손실 정지 유지 (신규 매수 차단)');
  await expect(card1).toContainText('장전 당일 손실 정지 유지 (신규 매수 차단');
  await expect(card3).toContainText('장전 당일 손실 정지 유지 (신규 매수 차단');

  // 5-a) 공통 한도 도달(loss 300k >= 300k) + 장전 활성 & 장전 손실 한도 미만(equity 750k → 장전 손실 50k < 150k)
  state.connection.balance!.totalEquity = 700000;
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 750000, approvedAt: observedAt },
    run: { armed: true, buyId: 'rep-1' },
    signals: [],
  };
  const at5a = new Date(Date.parse(at4) + 3500).toISOString();
  state.status.observedAt = at5a;
  state.status.lastSuccessAt = at5a;
  state.revision++;
  const commonWithinMorning = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await commonWithinMorning;
  for (const card of [card1, card3]) {
    await expect(card).toContainText('장전 매수는 실효 한도 내 (장전 당일 정지 이력 확인 필요) · 장전 매도는 매도가능수량 내 허용');
  }
  await expect(card1).toContainText('일반 주문 신규 매수·매도 차단');
  await expect(card3).toContainText('손실 한도 도달 · 신규 매수·매도 차단 (긴급정지 꺼짐)');
  await expect(card3).toContainText('일반 주문 차단');

  // 5-b) 공통 한도 도달 + 당일 장전 정지 신호 있음(morningLatchedStop) → 카드1·카드3 모두 장전 매수 차단 + 매도 예외
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 750000, approvedAt: observedAt },
    run: { armed: true, buyId: 'rep-1' },
    signals: [
      { at: at5a, code: '005930', side: 'buy', price: 70000, outcome: '오늘은 손실 한도로 새 매수를 중단했습니다.' },
    ],
  };
  const at5b = new Date(Date.parse(at5a) + 3500).toISOString();
  state.status.observedAt = at5b;
  state.status.lastSuccessAt = at5b;
  state.revision++;
  const commonWithLatch = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await commonWithLatch;
  for (const card of [card1, card3]) {
    await expect(card).toContainText('장전 신규 매수 차단 (당일 손실 정지 유지) · 장전 매도는 매도가능수량 내 허용');
  }

  // 5-c) 공통 한도 도달 + /api/morning 503 실패 → 카드1·카드3 모두 '장전 상태 미확인' 표시 및 장전 매도 허용 미단정
  morningStatusCode = 503;
  const at5c = new Date(Date.parse(at5b) + 3500).toISOString();
  state.status.observedAt = at5c;
  state.status.lastSuccessAt = at5c;
  state.revision++;
  const commonWith503 = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await commonWith503;
  for (const card of [card1, card3]) {
    await expect(card).toContainText('장전 상태 미확인 (조회 실패)');
    await expect(card).not.toContainText('장전 매도는 매도가능수량 내 허용');
  }

  // 6-a) 공통 baseline(1,000,000)과 장전 report.equity(1,100,000)가 다른 사례
  morningStatusCode = 200;
  state.connection.balance!.totalEquity = 950000; // 공통 손실 50k (<300k), 장전 손실 150k (>=150k)
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 1100000, approvedAt: observedAt },
    run: { armed: true, buyId: 'rep-1' },
    signals: [],
  };
  const at6 = new Date(Date.parse(at5c) + 3500).toISOString();
  state.status.observedAt = at6;
  state.status.lastSuccessAt = at6;
  state.revision++;
  const diffBaseRefreshed = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await diffBaseRefreshed;
  await expect(card1).toContainText('공통 기준 1,000,000원 · 장전 기준 1,100,000원');
  await expect(gauge).toContainText('한도 도달 차단 (장전 매수)');

  // 6-b) 공통 baseline === null, 장전 report.equity만 유효한 장전 단독 기준 사례
  state.paperRisk.baselineEquity = null;
  state.connection.balance!.totalEquity = 950000; // 장전 손실 50k / 150k = 33%
  morningPayload = {
    report: { id: 'rep-1', day: seoulDay, dailyLoss: 150000, equity: 1000000, approvedAt: observedAt },
    run: { armed: true, buyId: 'rep-1' },
    signals: [],
  };
  const at7 = new Date(Date.parse(at6) + 3500).toISOString();
  state.status.observedAt = at7;
  state.status.lastSuccessAt = at7;
  state.revision++;
  const standaloneRefreshed = page.waitForResponse('**/api/morning');
  await page.clock.fastForward(3500);
  await standaloneRefreshed;
  await expect(gauge).toContainText('장전 기준');
  await expect(gauge).toContainText('일반 주문 기준은 첫 주문 전 대기');
  await expect(card1).toContainText('장전 기준 1,000,000원');
  await expect(card1).toContainText('일반 주문 기준은 첫 주문 전 대기');
  await expect(card3).toContainText('장전 당일 정지 이력 확인 필요');
  await expect(card3).toContainText('장전 매도는 매도가능수량 내 허용');

  expect(posts).toEqual([]);
});
