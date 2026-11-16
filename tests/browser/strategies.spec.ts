import { test, expect } from '@playwright/test';
import { storageErrorMessage } from '../../shared/contracts';
import { snapshot } from '../snapshot';

test('KIS 전략 저장은 입력을 검증하고 재조회해도 환경·revision을 보존하며 자동 호출하지 않는다', async ({ page }) => {
  await page.goto('/strategies');
  await page.getByLabel('전략 환경').selectOption('kis-paper');
  const posts: string[] = []; page.on('request', req => { if (req.method() === 'POST') posts.push(new URL(req.url()).pathname); });
  await page.getByLabel('전략 이름').fill('KIS 저장 검증');
  await page.getByLabel('단기 평균 (이벤트)').fill('5'); await page.getByLabel('장기 평균 (이벤트)').fill('3');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('입력값');
  await expect(page.getByLabel('전략 이름')).toHaveValue('KIS 저장 검증');
  await expect(page.getByRole('heading', { name: 'KIS 저장 검증' })).toHaveCount(0);
  await page.getByLabel('단기 평균 (이벤트)').fill('2');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  const card = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'KIS 저장 검증', exact: true }) });
  await expect(card).toContainText('revision 1');
  await expect(card.getByRole('button', { name: '전략 시작' })).toBeDisabled();
  await expect(card).toContainText('평가 기록 없음');
  await expect(page.getByRole('button', { name: '자동 재생 시작', exact: true })).toHaveCount(0);
  await page.reload(); await page.getByLabel('전략 환경').selectOption('kis-paper');
  await expect(card).toBeVisible();
  expect(posts).toEqual(['/api/strategies', '/api/strategies']);
  await page.getByLabel('전략 환경').selectOption('demo');
  await expect(page.getByRole('heading', { name: 'KIS 저장 검증' })).toHaveCount(0);
});

test('KIS 신호·주문·차단 이력과 S01 집계는 DEMO와 분리되고 정지는 명시적 active=false를 보낸다', async ({ page }, testInfo) => {
  const state = snapshot(); const now = new Date().toISOString();
  state.realtime = { phase: 'ready', required: true, ordersAllowed: true, fresh: true, message: 'REST 대조 완료', code: '005930', lastQuoteAt: now, lastNoticeAt: null, reconciledAt: now, price: 73000 };
  state.strategies.push({ id: 'saved-kis', name: 'KIS 교차 관찰', code: '005930', fast: 2, slow: 3, qty: 1, active: true, lastSignal: 'buy', lastTick: -1, environment: 'kis-paper', revision: 1, run: 1, evaluations: [
    { event: '20261116:5', at: now, revision: 1, signal: 'buy', status: 'blocked', reason: '조건부 1회 승인 범위와 주문이 다릅니다.', requestId: '00000000-0000-4000-8000-000000000001' },
    { event: '20261116:4', at: now, revision: 1, signal: 'buy', status: 'accepted', reason: 'KIS 모의 주문 접수. 체결은 조회·대조로 확인하세요.', requestId: '00000000-0000-4000-8000-000000000002', brokerId: '001' },
    { event: '20261116:3', at: now, revision: 1, signal: 'hold', status: 'hold', reason: '표본 부족' },
  ] });
  await page.route('**/api/state', route => { const current = new Date().toISOString(); return route.fulfill({ json: { ...state, status: { ...state.status, observedAt: current, lastSuccessAt: current } } }); });
  const posts: { path: string; body: unknown }[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push({ path: new URL(req.url()).pathname, body: req.postDataJSON() }); });
  await page.goto('/dashboard');
  const dashboard = page.getByLabel('KIS 전략 현황');
  await expect(dashboard).toContainText('1 / 1'); await expect(dashboard).toContainText('조건부 1회 승인');
  await page.goto('/strategies'); await page.getByLabel('전략 환경').selectOption('kis-paper');
  await expect(page.locator('.strategy-evaluation')).toHaveCount(3);
  await expect(page.getByText('수동 보유분도', { exact: false })).toBeVisible();
  await expect(page.locator('.strategy-evaluation').nth(1)).toContainText('주문번호: 001');
  await page.screenshot({ path: testInfo.outputPath('strategies-desktop.png'), fullPage: true });
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('strategies-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(posts).toEqual([]);
  await page.route('**/api/kis/strategies/run', async route => { state.strategies.at(-1)!.active = false; state.revision++; await route.fulfill({ json: { message: 'KIS 전략 정지' } }); });
  await page.getByRole('button', { name: '전략 정지', exact: true }).click();
  await expect(page.getByRole('button', { name: '전략 시작', exact: true })).toBeVisible();
  expect(posts).toEqual([{ path: '/api/kis/strategies/run', body: { id: 'saved-kis', active: false } }]);
});

test('KIS 전략 저장 실패는 입력을 보존하고 성공을 표시하지 않는다', async ({ page }) => {
  await page.goto('/strategies'); await page.getByLabel('전략 환경').selectOption('kis-paper');
  await page.getByLabel('전략 이름').fill('저장 실패 초안');
  await page.route('**/api/strategies', route => route.fulfill({ status: 500, json: { error: storageErrorMessage } }));
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(storageErrorMessage);
  await expect(page.getByLabel('전략 이름')).toHaveValue('저장 실패 초안');
  await expect(page.getByRole('heading', { name: '저장 실패 초안' })).toHaveCount(0);
});

test('최초 상태 조회 대기 중 환경 선택은 보류하고 조회 뒤 선택은 유지한다', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const state = snapshot();
  await page.route('**/api/state', async route => { await gate; await route.fulfill({ json: state }); });
  await page.goto('/strategies');
  try { await expect(page.getByLabel('전략 환경')).toBeDisabled(); }
  finally { release(); }
  await page.getByLabel('전략 환경').selectOption('kis-paper');
  await expect(page.getByLabel('단기 평균 (이벤트)')).toBeVisible();
  await page.getByLabel('전략 이름').fill('초기 상태 확인 후 편집');
  await expect(page.getByLabel('전략 환경')).toHaveValue('kis-paper');
  await expect(page.getByLabel('전략 이름')).toHaveValue('초기 상태 확인 후 편집');
});

test('S01은 로컬 조회 실패와 만료 시 이전 실시간 입력 준비 표시를 해제한다', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); const now = new Date().toISOString(); let failed = false;
  state.realtime = { phase: 'ready', required: true, ordersAllowed: true, fresh: true, message: 'REST 대조 완료', code: '005930', lastQuoteAt: now, lastNoticeAt: null, reconciledAt: now, price: 73000 };
  await page.route('**/api/state', route => failed ? route.fulfill({ status: 503, body: 'fixture disconnected' }) : route.fulfill({ json: state }));
  await page.goto('/dashboard'); const panel = page.getByLabel('KIS 전략 현황');
  await expect(panel).toContainText('실시간 입력 준비');
  failed = true; const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3000); await polled;
  await expect(panel).not.toContainText('실시간 입력 준비');
  await expect(panel).toContainText('상태 미확인');
});
