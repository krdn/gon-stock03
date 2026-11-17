import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';
import type { ConnectionFailure } from '../../shared/model';

test('settings shows missing injection separately from unverified authentication and balance', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByLabel('서버 필수 설정 상태', { exact: true })).toContainText('미주입');
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('미확인');
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('미조회');
  await page.getByRole('button', { name: '안전한 연결 안내', exact: true }).click();
  await expect(page.getByText('KIS_APP_KEY', { exact: false }).first()).toBeVisible();
  await expect(page.locator('input[type=password], input[name*=key]')).toHaveCount(0);
  await page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' }).click();
  await expect(page.getByLabel('연결 복구 안내')).toContainText('Infisical');
  await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
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
    state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: now, lastSuccessAt: now, pages: 2 };
    state.connection.connected = true; state.connection.balance = { cash: 123456, totalEquity: 123456, positions: [] };
    await route.fulfill({ json: { connection: state.connection, message: '전체 조회 확인' } });
  });
  await page.goto('/settings');
  await expect(page.getByLabel('서버 필수 설정 상태', { exact: true })).toContainText('필수 값 있음');
  await expect(page.getByLabel('서버 필수 설정 상태', { exact: true })).toContainText('출처 미확인');
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('미확인');
  await page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeDisabled();
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('조회 중');
  state.connection.authentication = { phase: 'ready', lastSuccessAt: new Date().toISOString(), validUntil: new Date(Date.now() + 86_340_000).toISOString(), retryAt: null, failure: null };
  state.connection.status = { ...state.connection.status, phase: 'loading', pages: 1 };
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('토큰 발급 확인');
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('조회 중');
  await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'KIS 모의 계좌 조회 결과' })).toHaveCount(0);
  release();
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('전체 조회 확인');
  await expect(page.getByText('123,456원', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: '보유 종목 없음' })).toBeVisible();

  let releaseAgain!: () => void; const again = new Promise<void>(resolve => { releaseAgain = resolve; });
  await page.route('**/api/kis/check', async route => { await again; state.connection.status = { ...state.connection.status, phase: 'error', complete: false, error: '네트워크 실패' }; state.connection.failure = { kind: 'network', message: '네트워크 실패' }; await route.fulfill({ status: 400, json: { error: '네트워크 실패' } }); });
  await page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' }).click();
  const oldSnapshot = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await oldSnapshot;
  await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
  await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: '보유 종목 없음' })).toHaveCount(0);
  await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('fixture-secret');
});

test('settings expires token evidence locally and hides positive stages when the local server is unavailable', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); let offline = false;
  state.connection.configured = true; state.connection.injection = { phase: 'present', missing: [] };
  state.connection.authentication = { phase: 'ready', lastSuccessAt: new Date().toISOString(), validUntil: new Date(Date.now() + 1000).toISOString(), retryAt: null, failure: null };
  await page.route('**/api/state', route => offline ? route.abort() : route.fulfill({ json: state }));
  await page.goto('/settings'); await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('토큰 발급 확인');
  await page.clock.fastForward(2000);
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('만료·갱신 필요');
  offline = true; await page.clock.fastForward(3500);
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('서버 상태 확인 필요');
  await expect(page.getByLabel('서버 필수 설정 상태', { exact: true })).toContainText('서버 상태 확인 필요');
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeDisabled();
});

test('settings keeps GET recovery open during a hung check and bounds browser waiting without resending', async ({ page }) => {
  await page.clock.install();
  const state = snapshot(); let posts = 0, offline = false;
  await page.route('**/api/state', route => {
    const now = new Date(Date.now() + 180_000).toISOString();
    state.status.observedAt = now; state.status.lastSuccessAt = now;
    return offline ? route.abort() : route.fulfill({ json: state });
  });
  await page.route('**/api/kis/check', () => { posts++; });
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeEnabled();
  await page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' }).click();
  await expect(page.getByRole('button', { name: '연결 상태 새로고침' })).toBeEnabled();
  await page.getByRole('button', { name: '연결 상태 새로고침' }).click();
  await expect(page.getByText('외부 KIS 호출 없음', { exact: false })).toBeVisible();
  await page.clock.fastForward(125_001);
  await expect(page.getByRole('alert')).toContainText('응답 확인 지연');
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeEnabled();
  expect(posts).toBe(1);
  offline = true; await page.getByRole('button', { name: '연결 상태 새로고침' }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeDisabled();
  offline = false; await page.getByRole('button', { name: '연결 상태 새로고침' }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeEnabled();
});

test('settings uses server time for cooldown and shows server identity', async ({ page }) => {
  const start = Date.now(); await page.clock.install({ time: start });
  const state = snapshot();
  state.connection.authentication.retryAt = new Date(start + 3600_000 + 60_000).toISOString();
  state.status.observedAt = new Date(start + 3600_000).toISOString();
  state.status.lastSuccessAt = state.status.observedAt;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  await expect(page.getByLabel('실행 서버 식별')).toContainText('fixture-');
  await expect(page.getByLabel('KIS 인증 상태', { exact: true })).toContainText('60초');
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeDisabled();
  state.status.observedAt = new Date(start + 3600_000 + 60_001).toISOString();
  state.status.lastSuccessAt = state.status.observedAt;
  await page.clock.fastForward(60_001);
  await expect(page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' })).toBeEnabled();
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
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('경과 15초');
  await expect(page.getByLabel('모의 잔고 조회 상태', { exact: true })).toContainText('확인한 페이지: 2');
  await expect(page.getByRole('button', { name: '연결 상태 새로고침' })).toBeEnabled();
  state.instanceId = 'restarted-server'; state.startedAt = new Date(start + 1000).toISOString();
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, lastSuccessAt: new Date(start).toISOString(), observedAt: new Date(start).toISOString() };
  state.connection.connected = true; state.connection.balance = { cash: 9876, totalEquity: 9876, positions: [] };
  await page.getByRole('button', { name: '연결 상태 새로고침' }).click();
  await expect(page.getByLabel('실행 서버 식별')).toContainText('restarte');
  await expect(page.getByRole('alert')).toContainText('서버가 다시 시작');
  await expect(page.getByText('전체 조회 성공값', { exact: true })).toBeVisible();
  serverTime += 60_001; await page.clock.fastForward(60_001);
  await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: true })).toBeVisible();
  await expect(page.getByText('9,876원', { exact: true })).toBeVisible();
  await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
});
