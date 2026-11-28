import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';
import type { ConnectionFailure } from '../../shared/model';

test('settings shows missing injection separately from unverified authentication and balance', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '모의 계좌 설정이 필요합니다' })).toBeVisible();
  await expect(page.getByLabel('서버 필수 설정 상태', { exact: true })).toContainText('미주입');
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('미확인');
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('미조회');
  await page.getByRole('button', { name: '연결 설정 방법', exact: true }).click();
  await expect(page.getByText('KIS_APP_KEY', { exact: false }).first()).toBeVisible();
  await expect(page.locator('input[type=password], input[name*=key]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeDisabled();
  await expect(page.getByLabel('연결 복구 안내')).toContainText('Infisical');
  await expect(page.getByRole('heading', { name: '모의 잔고를 확인했습니다' })).toHaveCount(0);
});

test('settings keeps token and complete balance responses separate, suppresses old success while checking, and recovers', async ({ page }) => {
  await page.clock.install(); const state = snapshot();
  state.connection.configured = true; state.connection.injection = { phase: 'present', missing: [] };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/check', async route => {
    await gate;
    const now = new Date().toISOString();
    state.connection.checkStartedAt = now;
    state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now, pages: 2 };
    state.connection.connected = true; state.connection.balance = { cash: 123456, totalEquity: 123456, positions: [] };
    await route.fulfill({ json: { connection: state.connection, message: '전체 조회 확인' } });
  });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '모의 잔고를 조회하세요' })).toBeVisible();
  await expect(page.getByLabel('서버 필수 설정 상태', { exact: true })).toContainText('필수 값 있음');
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('미확인');
  await page.getByRole('button', { name: '모의 잔고 조회' }).click();
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeDisabled();
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('조회 중');
  state.connection.authentication = { phase: 'ready', lastSuccessAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86_340_000).toISOString(), retryAt: null, failure: null };
  state.connection.status = { ...state.connection.status, phase: 'loading', pages: 1 };
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('토큰 발급됨');
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('조회 중');
  await expect(page.getByRole('heading', { name: '모의 잔고를 확인했습니다' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '모의 계좌 잔고' })).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: '모의 잔고를 확인했습니다' })).toBeVisible();
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('전체 조회 확인');
  await expect(page.getByText('123,456원', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('보유 종목 없음', { exact: true })).toBeVisible();

  let releaseAgain!: () => void; const again = new Promise<void>(resolve => { releaseAgain = resolve; });
  await page.route('**/api/kis/check', async route => { await again; state.connection.status = { ...state.connection.status, phase: 'error', complete: false, error: '네트워크 실패' }; state.connection.failure = { kind: 'network', message: '네트워크 실패' }; await route.fulfill({ status: 400, json: { error: '네트워크 실패' } }); });
  await page.getByRole('button', { name: '모의 잔고 조회' }).click();
  await expect(page.locator('.settings-progress')).toHaveText('서버의 조회 진행 상태를 기다리고 있습니다.');
  const oldSnapshot = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await oldSnapshot;
  await expect(page.getByRole('heading', { name: '모의 잔고를 확인했습니다' })).toHaveCount(0);
  await expect(page.getByText('이전 조회 잔고', { exact: true })).toBeVisible();
  releaseAgain();
  await expect(page.getByLabel('연결 복구 안내')).toContainText('네트워크');
  await expect(page.getByText('123,456원', { exact: true }).first()).toBeVisible();
});

const failures: [ConnectionFailure['kind'], string, string][] = [
  ['missing', '미주입', 'Infisical'], ['invalid', '설정 형식 오류', '8자리'],
  ['expired', '만료·갱신 필요', '다시 조회'], ['permission', '인증·권한 거부', '서비스 신청'],
  ['rate-limit', '호출 제한', '기다린 뒤'], ['network', '네트워크 오류', '네트워크'],
  ['upstream', 'KIS 서비스 오류', '서비스 상태'], ['contract', '응답 확인 불가', '전체 잔고'],
  ['rejected', '요청 거부', '모의 계좌'],
];
for (const [kind, label, guidance] of failures) test(`settings explains ${kind} recovery without inventing a zero balance`, async ({ page }) => {
  const state = snapshot(); state.connection.failure = { kind, message: '안전한 오류 메시지' };
  state.connection.status.phase = 'error'; state.connection.status.error = state.connection.failure.message;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  await expect(page.getByLabel('연결 복구 안내')).toContainText(label);
  await expect(page.getByLabel('연결 복구 안내')).toContainText(guidance);
  await expect(page.getByText('보유 종목 없음', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '모의 잔고를 확인했습니다' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('fixture-secret');
});

test('settings expires token evidence locally and hides positive stages when the local server is unavailable', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); let offline = false;
  state.connection.configured = true; state.connection.injection = { phase: 'present', missing: [] };
  state.connection.authentication = { phase: 'ready', lastSuccessAt: new Date().toISOString(), validUntil: new Date(Date.now() + 1000).toISOString(), retryAt: null, failure: null };
  await page.route('**/api/state', route => offline ? route.abort() : route.fulfill({ json: state }));
  await page.goto('/settings'); await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('토큰 발급됨');
  await page.clock.fastForward(2000);
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('만료·갱신 필요');
  offline = true; await page.clock.fastForward(3500);
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('서버 상태 확인 필요');
  await expect(page.getByLabel('서버 필수 설정 상태', { exact: true })).toContainText('서버 상태 확인 필요');
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeDisabled();
});

test('settings keeps GET recovery open during a hung check and bounds browser waiting without resending', async ({ page }) => {
  await page.clock.install();
  const state = snapshot(); let posts = 0, offline = false;
  let serverTime = Date.now() + 180_000;
  await page.route('**/api/state', route => {
    const now = new Date(++serverTime).toISOString();
    state.status.observedAt = now; state.status.lastSuccessAt = now;
    return offline ? route.abort() : route.fulfill({ json: state });
  });
  await page.route('**/api/kis/check', () => { posts++; });
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeEnabled();
  await page.getByRole('button', { name: '모의 잔고 조회' }).click();
  await expect(page.getByRole('button', { name: '서버 상태 새로고침' })).toBeEnabled();
  await page.getByRole('button', { name: '서버 상태 새로고침' }).click();
  await expect(page.getByText('외부 KIS 호출 없음', { exact: false })).toBeVisible();
  serverTime += 125_001;
  await page.clock.fastForward(125_001);
  await expect(page.getByRole('alert')).toContainText('응답 확인 지연');
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeEnabled();
  expect(posts).toBe(1);
  offline = true; await page.getByRole('button', { name: '서버 상태 새로고침' }).click();
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeDisabled();
  offline = false; await page.getByRole('button', { name: '서버 상태 새로고침' }).click();
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeEnabled();
});

test('settings uses server time for cooldown and shows server identity', async ({ page }) => {
  const start = Date.now(); await page.clock.install({ time: start });
  const state = snapshot();
  state.connection.authentication.retryAt = new Date(start + 3600_000 + 60_000).toISOString();
  state.status.observedAt = new Date(start + 3600_000).toISOString();
  state.status.lastSuccessAt = state.status.observedAt;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  await page.getByText('서버·인증 상세 정보', { exact: true }).click();
  await expect(page.getByLabel('실행 서버 식별')).toContainText('fixture-');
  await expect(page.getByRole('heading', { name: '인증 갱신을 기다리고 있습니다' })).toBeVisible();
  await expect(page.locator('#settings-retry')).toContainText('60초');
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeDisabled();
  state.status.observedAt = new Date(start + 3600_000 + 60_001).toISOString();
  state.status.lastSuccessAt = state.status.observedAt;
  await page.clock.fastForward(60_001);
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeEnabled();
});

test('authentication failure keeps its recovery action visible throughout the retry cooldown', async ({ page }) => {
  const start = Date.now();
  await page.clock.install({ time: start });
  const state = snapshot();
  let observed = start;
  state.connection.configured = true;
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.authentication = {
    phase: 'error', lastSuccessAt: null, validUntil: null, retryAt: new Date(start + 60_000).toISOString(),
    failure: { kind: 'permission', message: '모의 인증 권한이 없습니다.' },
  };
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await page.route('**/api/state', route => {
    state.status.observedAt = state.status.lastSuccessAt = new Date(observed).toISOString();
    return route.fulfill({ json: state });
  });
  await page.goto('/settings');
  const recovery = page.getByLabel('연결 복구 안내');
  const check = page.getByRole('button', { name: '모의 잔고 조회' });
  await expect(recovery.getByRole('heading', { name: '인증·권한 거부' })).toBeVisible();
  await expect(recovery).toContainText('서비스 신청');
  await expect(page.locator('#settings-retry')).toContainText('60초');
  await expect(check).toBeDisabled();
  await page.getByRole('button', { name: '서버 상태 새로고침' }).click();
  await expect(page.getByLabel('새로고침 결과')).toContainText('외부 KIS 호출 없음');
  await page.clock.fastForward(5001);
  await expect(page.getByLabel('새로고침 결과')).toBeEmpty();
  await expect(recovery).toContainText('서비스 신청');
  observed += 60_001;
  await page.clock.fastForward(60_001);
  await expect(check).toBeEnabled();
  await expect(recovery).toContainText('서비스 신청');
  expect(posts).toEqual([]);
});

test('settings identifies a restarted server, shows progress and expires complete money after 60 seconds', async ({ page }) => {
  const start = Date.now(); await page.clock.install({ time: start });
  const state = snapshot(); let serverTime = start;
  state.connection.status.phase = 'loading'; state.connection.status.pages = 2;
  state.connection.checkStartedAt = new Date(start - 15_000).toISOString();
  await page.route('**/api/state', route => {
    state.status.observedAt = new Date(serverTime).toISOString(); state.status.lastSuccessAt = state.status.observedAt;
    return route.fulfill({ json: state });
  });
  await page.goto('/settings');
  await expect(page.locator('.settings-progress')).toContainText('경과 15초');
  await expect(page.locator('.settings-progress')).toContainText('확인한 페이지: 2');
  await expect(page.getByRole('button', { name: '서버 상태 새로고침' })).toBeEnabled();
  state.instanceId = 'restarted-server'; state.startedAt = new Date(start + 1000).toISOString();
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, lastSuccessAt: new Date(start).toISOString(), observedAt: new Date(start).toISOString() };
  state.connection.connected = true; state.connection.balance = { cash: 9876, totalEquity: 9876, positions: [] };
  await page.getByRole('button', { name: '서버 상태 새로고침' }).click();
  await page.getByText('서버·인증 상세 정보', { exact: true }).click();
  await expect(page.getByLabel('실행 서버 식별')).toContainText('restarte');
  await expect(page.getByRole('alert')).toContainText('서버가 다시 시작');
  await expect(page.getByText('조회 완료', { exact: true })).toBeVisible();
  serverTime += 60_001; await page.clock.fastForward(60_001);
  await expect(page.getByText('이전 조회 잔고', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '잔고를 다시 조회하세요' })).toBeVisible();
  await expect(page.getByText('9,876원', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '모의 잔고를 확인했습니다' })).toHaveCount(0);
});


test('settings puts the recovery action in the mobile viewport and supports keyboard disclosure', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const state = snapshot();
  state.connection.injection = { phase: 'invalid', missing: [] };
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  const guide = page.getByRole('button', { name: '연결 설정 방법' });
  const check = page.getByRole('button', { name: '모의 잔고 조회' });
  await expect(page.locator('.top-actions')).toContainText('KIS 모의 계좌');
  await expect(page.getByLabel('연결 복구 안내')).toContainText('8자리');
  await expect(check).toBeDisabled();
  await expect(guide).toBeInViewport({ ratio: 1 });
  await guide.focus();
  await page.keyboard.press('Enter');
  await expect(guide).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { name: '모의 계좌 연결 방법' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.keyboard.press('Space');
  await expect(guide).toBeFocused();
  await expect(page.getByRole('heading', { name: '모의 계좌 연결 방법' })).toBeHidden();

  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.configured = true;
  await page.getByRole('button', { name: '서버 상태 새로고침' }).click();
  await expect(page.getByLabel('새로고침 결과')).toContainText('외부 KIS 호출 없음');
  await expect(check).toBeEnabled();
  expect(posts).toEqual([]);
});

test('a stale balance keeps authentication and dated holdings legible on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const state = snapshot();
  const lastSuccessAt = new Date(Date.now() - 120_000).toISOString();
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.authentication = { phase: 'ready', lastSuccessAt, validUntil: new Date(Date.now() + 3600_000).toISOString(), retryAt: null, failure: null };
  state.connection.status = { ...state.connection.status, phase: 'stale', complete: true, lastSuccessAt };
  state.connection.balance = { cash: 22000, totalEquity: 22000, positions: [{ code: '000001', name: '테스트 종목', qty: 2, average: 1800, price: null }] };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '잔고를 다시 조회하세요' })).toBeVisible();
  await expect(page.getByRole('button', { name: '모의 잔고 조회' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('토큰 발급됨');
  const account = page.locator('.settings-balance');
  await expect(account.locator('time')).toHaveAttribute('datetime', lastSuccessAt);
  await expect(account).toContainText('이전 조회 잔고');
  await expect(account).toContainText('2주');
  await expect(account).toContainText('평가 불가');
  const detail = page.getByText('서버·인증 상세 정보', { exact: true });
  await expect(page.getByLabel('실행 서버 식별')).toBeHidden();
  await detail.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('실행 서버 식별')).toBeVisible();
  await expect(page.locator('.settings-technical')).toContainText('주입 출처 미확인');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('실행 서버 식별')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('settings keeps the guide and local refresh together when returning from trading settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = snapshot();
  state.connection.injection = { phase: 'missing', missing: ['KIS_CANO'] };
  const writes: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET') writes.push(req.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  const guide = page.getByRole('button', { name: '연결 설정 방법' });
  const refresh = page.getByRole('button', { name: '로컬 서버 상태 새로고침' });
  await expect(page.getByLabel('연결 복구 안내')).toContainText('필수 값 1개');
  const historyLength = await page.evaluate(() => history.length);
  await guide.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/settings\?guide=setup$/);
  await expect(page.locator('#connection-guide h3')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#connection-guide')).toContainText('KIS_CANO');
  await expect(page.locator('#connection-guide')).not.toContainText('KIS_APP_SECRET');
  await expect(refresh).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toBeInViewport({ ratio: 1 });
  await refresh.focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('새로고침 결과')).toContainText('외부 KIS 호출 없음');
  await page.reload();
  await expect(guide).toHaveAttribute('aria-expanded', 'true');
  await page.locator('main').getByRole('link', { name: '매매 설정', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/trading$/);
  await page.goBack();
  await expect(guide).toHaveAttribute('aria-expanded', 'true');
  await guide.focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/\/settings$/);
  await expect(guide).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  expect(writes).toEqual([]);
});

test('partial balance explains the recovery action and identifies the previous full balance', async ({ page }) => {
  const state = snapshot();
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.status = { ...state.connection.status, phase: 'partial', pages: 1 };
  state.connection.failure = { kind: 'network', message: '예시 네트워크 오류' };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  const recovery = page.getByLabel('연결 복구 안내');
  await expect(recovery).toContainText('잔고 일부 수신 · 네트워크 오류');
  await expect(recovery).toContainText('다시 조회하세요');
  await expect(recovery).toContainText('아직 전체 조회 잔고가 없습니다');
  await expect(page.locator('.settings-balance')).toHaveCount(0);

  const previousTime = new Date(Date.now() - 120_000).toISOString();
  state.connection.status.lastSuccessAt = previousTime;
  state.connection.balance = { cash: 22000, totalEquity: 22000, positions: [] };
  await page.getByRole('button', { name: '로컬 서버 상태 새로고침' }).click();
  await expect(recovery).toContainText('표시 금액은 이전 전체 조회 기준');
  await expect(page.locator('.settings-balance')).toContainText('22,000원');
  await expect(page.locator('.settings-balance time')).toHaveAttribute('datetime', previousTime);
  await expect(page.getByRole('button', { name: 'KIS 모의 잔고 조회' })).toBeEnabled();
});

test('local refresh feedback stays accurate when the next poll loses the server', async ({ page }) => {
  await page.clock.install();
  const state = snapshot();
  let offline = false;
  await page.route('**/api/state', route => offline ? route.abort() : route.fulfill({ json: state }));
  await page.goto('/settings');
  const refresh = page.getByRole('button', { name: '로컬 서버 상태 새로고침' });
  await expect(page.getByRole('heading', { name: '모의 잔고를 조회하세요' })).toBeVisible();
  await refresh.click();
  const feedback = page.getByLabel('새로고침 결과');
  await expect(feedback).toContainText('로컬 서버 상태를 확인했습니다.');
  offline = true;
  await page.clock.fastForward(3001);
  await expect(page.getByRole('heading', { name: '로컬 서버 연결을 확인하세요' })).toBeVisible();
  await expect(feedback).toBeEmpty();
  await refresh.click();
  await expect(feedback).toContainText('로컬 서버 상태를 확인하지 못했습니다.');
  await expect(page.getByRole('button', { name: 'KIS 모의 잔고 조회' })).toBeDisabled();
});

test('emergency halt remains usable while a balance check is pending without unlocking busy early', async ({ page }) => {
  const state = snapshot();
  state.connection.configured = true;
  state.connection.injection = { phase: 'present', missing: [] };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/check', async route => {
    await gate;
    const now = new Date().toISOString();
    state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now, pages: 1 };
    state.connection.connected = true;
    await route.fulfill({ json: { connection: state.connection, message: '전체 조회 확인' } });
  });
  await page.route('**/api/risk/halt', route => {
    state.risk.halted = true;
    state.revision++;
    return route.fulfill({ json: {} });
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'KIS 모의 잔고 조회' }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 잔고 조회' })).toBeDisabled();
  await page.getByRole('navigation').getByRole('link', { name: '위험관리', exact: true }).click();
  const haltButton = page.getByRole('button', { name: '신규 주문 긴급정지', exact: true });
  await expect(haltButton).toBeEnabled();
  await haltButton.click();
  await expect(page.getByRole('button', { name: '신규 주문 허용', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: '연결·설정', exact: true }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 잔고 조회' })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: 'KIS 모의 잔고 조회' })).toBeEnabled();
});

test('valid balance with naturally expired token avoids stale-balance contradiction and cooldown wording', async ({ page }) => {
  const state = snapshot();
  const now = new Date().toISOString();
  state.connection.configured = true;
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.connected = true;
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now, pages: 1 };
  state.connection.balance = { cash: 50000, totalEquity: 50000, positions: [] };
  state.connection.authentication = { phase: 'expired', lastSuccessAt: now, validUntil: now, retryAt: null, failure: { kind: 'expired', message: '만료' } };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  const recovery = page.getByLabel('연결 복구 안내');
  await expect(recovery).toContainText('아래 잔고는 최근 전체 조회 기준입니다.');
  await expect(recovery).toContainText('다시 조회');
  await expect(recovery).not.toContainText('이전 전체 조회 기준');
  await expect(recovery).not.toContainText('대기 시각');
  await expect(page.getByText('조회 완료', { exact: true })).toBeVisible();
});

test('starting kis check clears prior page count and preserves server restart alert', async ({ page }) => {
  const state = snapshot();
  const now = new Date().toISOString();
  state.connection.configured = true;
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.connected = true;
  state.connection.checkStartedAt = now;
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now, pages: 3 };
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/check', async route => {
    await gate;
    state.instanceId = 'restarted-after-check';
    state.revision = 1;
    await route.fulfill({ json: { connection: state.connection, message: 'KIS 모의 잔고 조회를 확인했습니다.' } });
  });
  await page.goto('/settings');
  const accountStrip = page.getByRole('group', { name: 'KIS 계좌 상태', exact: true });
  await expect(accountStrip).toContainText('3페이지');
  await page.getByRole('button', { name: 'KIS 모의 잔고 조회' }).click();
  await expect(accountStrip).toContainText('0페이지');
  release();
  await expect(page.getByRole('alert')).toContainText('서버가 다시 시작');
});

test('settings preserves decimal average prices, renders balance evaluation summary, per-holding metrics, and links', async ({ page }) => {
  const state = snapshot();
  const now = new Date().toISOString();
  state.connection.configured = true;
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.connected = true;
  state.connection.authentication = { phase: 'ready', lastSuccessAt: now, validUntil: new Date(Date.now() + 3_600_000).toISOString(), retryAt: null, failure: null };
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now, pages: 1 };
  state.connection.balance = {
    cash: 1_000_000,
    totalEquity: 2_390_000,
    positions: [
      { code: '069500', name: 'KODEX 200', qty: 10, sellable: 8, average: 77732.5, price: 80_000 },
      { code: '005930', name: '삼성전자', qty: 3, sellable: 0, average: 193_530, price: 190_000 },
      { code: '000660', name: 'SK하이닉스', qty: 1, average: 100_000.2, price: 100_000 },
    ],
  };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');

  const summary = page.getByLabel('모의 계좌 평가 요약', { exact: true });
  await expect(summary).toContainText('총 평가자산');
  await expect(summary).toContainText('2,470,000원');
  await expect(summary).toContainText('주식·ETF 평가액');
  await expect(summary).toContainText('1,470,000원');
  await expect(summary).toContainText('보유 평가손익');
  await expect(summary.locator('dd.up')).toHaveText('+12,085원');
  await expect(summary).toContainText('KIS 총평가액 (참고)');
  await expect(summary).toContainText('2,390,000원');

  const holdings = page.locator('.settings-holdings li');
  await expect(holdings).toHaveCount(3);

  const kodex = holdings.nth(0);
  await expect(kodex).toContainText('77,732.5원');
  await expect(kodex).not.toContainText('77,733원');
  await expect(kodex).toContainText('800,000원');
  await expect(kodex.locator('dd.up')).toHaveText('+22,675원');
  await expect(kodex).toContainText('주문가능 수량');
  await expect(kodex.locator('dl > div', { hasText: '주문가능 수량' }).locator('dd')).toHaveText('8주');
  await expect(kodex.getByRole('link', { name: '모의 매매 ↗' })).toHaveAttribute('href', '/paper?code=069500');

  const samsung = holdings.nth(1);
  await expect(samsung).toContainText('193,530원');
  await expect(samsung).toContainText('570,000원');
  await expect(samsung.locator('dd.down')).toHaveText('-10,590원');
  await expect(samsung).toContainText('주문가능 수량');
  await expect(samsung.locator('dl > div', { hasText: '주문가능 수량' }).locator('dd')).toHaveText('0주');
  await expect(samsung.getByRole('link', { name: '모의 매매 ↗' })).toHaveAttribute('href', '/paper?code=005930');

  const hynix = holdings.nth(2);
  const hynixPnl = hynix.locator('dl > div', { hasText: '평가손익' }).locator('dd');
  await expect(hynixPnl).toHaveText('0원');
  await expect(hynixPnl).not.toHaveClass(/up|down/);
  await expect(hynix.locator('dl > div', { hasText: '주문가능 수량' })).toHaveCount(0);

  const balanceLinks = page.locator('.settings-balance-links');
  await expect(balanceLinks.getByRole('link', { name: '포트폴리오 상세 ↗' })).toHaveAttribute('href', '/portfolio');
  await expect(balanceLinks.getByRole('link', { name: 'KIS 주문 대조 ↗' })).toHaveAttribute('href', '/paper');

  // Unpriced holding renders '평가 불가' across summary and holding evaluation fields.
  state.connection.balance = {
    cash: 500_000,
    totalEquity: 500_000,
    positions: [{ code: '069500', name: 'KODEX 200', qty: 2, average: 77732.5, price: null }],
  };
  await page.getByRole('button', { name: '로컬 서버 상태 새로고침' }).click();
  await expect(summary.locator('div', { hasText: '총 평가자산' }).locator('dd')).toHaveText('평가 불가');
  await expect(summary.locator('div', { hasText: '주식·ETF 평가액' }).locator('dd')).toHaveText('평가 불가');
  await expect(summary.locator('div', { hasText: '보유 평가손익' }).locator('dd')).toHaveText('평가 불가');
  await expect(summary.locator('div', { hasText: 'KIS 총평가액 (참고)' }).locator('dd')).toContainText('500,000원');
  const unpricedRow = page.locator('.settings-holdings li').first();
  await expect(unpricedRow).toContainText('77,732.5원');
  await expect(unpricedRow.locator('dl > div', { hasText: '평가액' }).locator('dd')).toHaveText('평가 불가');
  await expect(unpricedRow.locator('dl > div', { hasText: '평가손익' }).locator('dd')).toHaveText('평가 불가');
});

test('settings renders workspace diagnostic hub cards, navigation links, and offline fallback', async ({ page }) => {
  const state = snapshot();
  const now = new Date().toISOString();
  let offline = false;
  state.connection.configured = true;
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.authentication = { phase: 'ready', lastSuccessAt: now, validUntil: new Date(Date.now() + 3_600_000).toISOString(), retryAt: null, failure: null };
  state.realtime = {
    phase: 'ready',
    required: true,
    ordersAllowed: true,
    message: '실시간 대조 완료',
    code: '005930',
    lastQuoteAt: now,
    lastNoticeAt: null,
    reconciledAt: now,
    price: 75_000,
    fresh: true,
  };
  state.risk = { maxOrder: 2_000_000, maxPosition: 5_000_000, dailyLoss: 300_000, halted: true };
  state.paperManualMaxQty = 7;
  state.paperRisk = { day: '20261128', baselineEquity: 10_000_000, unresolvedCount: 2, orders: { observedAt: now, rows: [] } };
  state.strategies = [
    { id: 'kis-1', name: 'KIS 활성', code: '005930', fast: 5, slow: 20, qty: 1, active: true, lastSignal: 'hold', lastTick: 1, environment: 'kis-paper' },
    { id: 'kis-2', name: 'KIS 대기', code: '069500', fast: 5, slow: 20, qty: 1, active: false, lastSignal: 'hold', lastTick: 1, environment: 'kis-paper' },
    { id: 'demo-1', name: 'DEMO 활성1', code: '005930', fast: 5, slow: 20, qty: 1, active: true, lastSignal: 'hold', lastTick: 1, environment: 'demo' },
    { id: 'demo-2', name: 'DEMO 활성2', code: '000660', fast: 5, slow: 20, qty: 1, active: true, lastSignal: 'hold', lastTick: 1 },
    { id: 'demo-3', name: 'DEMO 대기', code: '035420', fast: 5, slow: 20, qty: 1, active: false, lastSignal: 'hold', lastTick: 1, environment: 'demo' },
  ];
  await page.route('**/api/state', route => offline ? route.abort() : route.fulfill({ json: state }));
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: '워크스페이스 연결·운영 설정 현황' })).toBeVisible();

  const realtimeCard = page.getByLabel('KIS 실시간 및 토큰 상태', { exact: true });
  await expect(realtimeCard).toContainText('토큰 발급됨');
  await expect(realtimeCard).toContainText('REST 대조 완료');
  await expect(realtimeCard).toContainText('005930 · 실시간 주문 허용');
  await expect(realtimeCard.getByRole('link', { name: 'KIS 모의 매매 · 실시간 대조 ↗' })).toHaveAttribute('href', '/paper');

  const riskCard = page.getByLabel('공통 주문 및 위험 한도 현황', { exact: true });
  await expect(riskCard).toContainText('긴급정지 켜짐 (신규 주문 정지)');
  await expect(riskCard).toContainText('2,000,000원 / 5,000,000원');
  await expect(riskCard).toContainText('300,000원');
  await expect(riskCard).toContainText('1회 7주 · 불명·전송 중 2건');
  await expect(riskCard.getByRole('link', { name: '일반 한도·수량 설정 ↗' })).toHaveAttribute('href', '/settings/trading/general');
  await expect(riskCard.getByRole('link', { name: '위험관리·긴급정지 ↗' })).toHaveAttribute('href', '/risk');

  const strategyCard = page.getByLabel('전략 계약 및 데이터 운영 현황', { exact: true });
  await expect(strategyCard).toContainText('저장 2개 · 실행 중 1개');
  await expect(strategyCard).toContainText('저장 3개 · 실행 중 2개');
  await expect(strategyCard.locator('div', { hasText: '당일 KIS 주문 대조' }).locator('dd')).not.toHaveText('미대조');
  await expect(strategyCard.getByRole('link', { name: '매매 설정 · 전용 계약 ↗' })).toHaveAttribute('href', '/settings/trading');
  await expect(strategyCard.getByRole('link', { name: 'KIS 전략 스튜디오 ↗' })).toHaveAttribute('href', '/strategies?environment=kis-paper');
  await expect(strategyCard.getByRole('link', { name: '데이터 상태 · 동기화 ↗' })).toHaveAttribute('href', '/data');

  state.paperRisk = { ...state.paperRisk!, unresolvedCount: 0 };
  await page.getByRole('button', { name: '로컬 서버 상태 새로고침' }).click();
  await expect(riskCard).toContainText('1회 7주 · 불명·전송 중 0건');

  state.paperRisk = undefined;
  await page.getByRole('button', { name: '로컬 서버 상태 새로고침' }).click();
  await expect(riskCard).toContainText('1회 7주 · 불명·전송 중 미확인');
  await expect(riskCard).not.toContainText('불명·전송 중 0건');

  offline = true;
  await page.getByRole('button', { name: '로컬 서버 상태 새로고침' }).click();
  await expect(realtimeCard).toContainText('서버 상태 확인 필요');
  await expect(realtimeCard).toContainText('상태 미확인');
  await expect(riskCard).toContainText('상태 미확인');
  await expect(riskCard).toContainText('미확인');
  await expect(strategyCard).toContainText('미확인');
  await expect(strategyCard).toContainText('미대조');
});

test('settings shows extended technical diagnostics with zero POSTs, zero secret inputs, and zero mobile overflow', async ({ page }) => {
  const state = snapshot();
  const authAt = '2026-11-28T04:11:12.000Z';
  const balanceSuccessAt = '2026-11-28T05:13:20.000Z';
  const observedAt = '2026-11-28T05:15:30.000Z';
  state.connection.configured = true;
  state.connection.injection = { phase: 'present', missing: [] };
  state.connection.connected = true;
  state.connection.balanceSeconds = 90;
  state.connection.authentication = { phase: 'ready', lastSuccessAt: authAt, validUntil: new Date(Date.now() + 3_600_000).toISOString(), retryAt: null, failure: null };
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt, lastSuccessAt: balanceSuccessAt, pages: 2 };
  state.connection.balance = {
    cash: 1_234_567,
    totalEquity: 2_011_892,
    positions: [{ code: '069500', name: 'KODEX 200', qty: 10, sellable: 10, average: 77732.5, price: 78_500 }],
  };
  state.realtime = {
    phase: 'reconciling',
    required: true,
    ordersAllowed: false,
    message: 'REST 대조 필요',
    code: null,
    lastQuoteAt: null,
    lastNoticeAt: null,
    reconciledAt: null,
    price: null,
    fresh: false,
  };
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));

  const expectedAuth = new Date(authAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const expectedBalanceSuccess = new Date(balanceSuccessAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const expectedObserved = new Date(observedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  expect(expectedObserved).not.toBe(expectedBalanceSuccess);
  expect(expectedObserved).not.toBe(expectedAuth);

  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/settings');
    await expect(page.locator('input[type=password], input[name*=key]')).toHaveCount(0);
    await expect(page.getByLabel('KIS 실시간 및 토큰 상태', { exact: true })).toContainText('REST 대조 필요');
    await expect(page.getByLabel('KIS 실시간 및 토큰 상태', { exact: true })).toContainText('구독 없음 · 실시간 주문 차단');

    await page.getByText('서버·인증 상세 정보', { exact: true }).click();
    const technical = page.locator('.settings-technical');
    await expect(technical).toContainText('자동 주입·공시 경로');
    await expect(technical).toContainText('Universal Auth (.secrets/infisical-dev.json) · 공시 dev /stock');
    await expect(technical).toContainText('최근 잔고 관측');
    await expect(technical).toContainText('잔고 신선도·제한시간');
    await expect(technical).toContainText('60초 유효 · 조회 제한 90초');
    await expect(technical.locator('dt', { hasText: /^토큰 발급$/ }).locator('+ dd')).toHaveText(expectedAuth);
    await expect(technical.locator('dt', { hasText: /^잔고 전체 조회$/ }).locator('+ dd')).toHaveText(expectedBalanceSuccess);
    await expect(technical.locator('dt', { hasText: /^최근 잔고 관측$/ }).locator('+ dd')).toHaveText(expectedObserved);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  expect(posts).toEqual([]);
});
