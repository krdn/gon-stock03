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
  await expect(page.getByRole('alert')).toContainText('단기 평균은 장기 평균보다 작아야');
  await expect(page.getByLabel('단기 평균 (이벤트)')).toBeFocused();
  await expect(page.getByLabel('장기 평균 (이벤트)')).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('장기 평균 (이벤트)').fill('');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('장기 평균 (이벤트)').fill('3');
  await expect(page.getByLabel('전략 이름')).toHaveValue('KIS 저장 검증');
  await expect(page.getByRole('heading', { name: 'KIS 저장 검증' })).toHaveCount(0);
  await page.getByLabel('단기 평균 (이벤트)').fill('2');
  await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  const card = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'KIS 저장 검증', exact: true }) });
  await expect(card).toContainText('revision 1');
  await expect(card.getByRole('button', { name: '전략 시작' })).toBeDisabled();
  await expect(card).toContainText('평가 기록 없음');
  await expect(page.getByRole('button', { name: '자동 재생 시작', exact: true })).toHaveCount(0);
  await expect(card.getByRole('heading')).toBeFocused();
  const contract = card.getByRole('link', { name: '다음 계약 준비' });
  await expect(contract).toBeInViewport();
  await contract.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('저장 KIS 전략').locator('option:checked')).toContainText('KIS 저장 검증');
  await page.goBack();
  await expect(card.getByRole('heading')).toBeFocused();
  await expect(contract).toBeInViewport();
  await page.reload(); await expect(page.getByLabel('전략 환경')).toHaveValue('kis-paper');
  await expect(card).toBeVisible();
  expect(posts).toEqual(['/api/strategies']);
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
  await expect(page.locator('.strategy-evaluation')).toHaveCount(0);
  await page.getByText('실행 규칙', { exact: true }).click();
  await expect(page.getByText('수동 보유분도', { exact: false })).toBeVisible();
  await page.getByText('최근 평가 · 3건 (최대 100건)', { exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.strategy-evaluation')).toHaveCount(3);
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

test('KIS 전달 주소와 최근 평가의 키보드 이동·뒤로가기·새로고침', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = snapshot();
  const base = { ...state.strategies[0], environment: 'kis-paper' as const, revision: 1 };
  const blocked = { event: 'sample', at: '2026-11-20T01:00:00.000Z', revision: 1, signal: 'buy' as const, status: 'blocked' as const, reason: '예시 한도 초과' };
  state.strategies = [
    { ...base, id: 'empty', name: '평가 대기', evaluations: [] },
    { ...base, id: 'newer', name: '최근 신호', evaluations: [blocked] },
    { ...base, id: 'older', name: '이전 신호', evaluations: [{ ...blocked, at: '2026-11-19T08:00:00.000Z', status: 'unknown', reason: '결과 대조 필요' }] },
  ];
  state.connection.status.phase = 'partial';
  state.connection.status.error = '예시 계좌 일부 조회';
  await page.route('**/api/state', r => r.fulfill({ json: state }));
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(new URL(req.url()).pathname); });
  await page.goto('/strategies?environment=kis-paper#strategy-evaluations');
  const latest = page.getByRole('region', { name: '최근 KIS 평가' });
  await expect(latest.getByRole('heading')).toBeFocused();
  await expect(latest.getByText('예시 한도 초과')).toBeInViewport();
  await expect(latest).toContainText('10:00:00 KST');
  await expect(page.getByRole('group', { name: 'KIS 계좌 상태' })).toContainText('부분실패');
  await latest.getByRole('link', { name: '해당 전략 보기' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '최근 신호' })).toBeFocused();
  await expect(page).toHaveURL(/#strategy-newer$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: '최근 신호' })).toBeFocused();
  await page.goBack();
  await expect(latest.getByRole('heading')).toBeFocused();
  await page.getByLabel('전략 환경').selectOption('demo');
  await expect(page).toHaveURL(/environment=demo$/);
  await page.reload(); await expect(page.getByLabel('전략 환경')).toHaveValue('demo');
  await expect(latest).toHaveCount(0);
  await page.goBack(); await expect(latest.getByText('예시 한도 초과')).toBeInViewport();
  await page.getByRole('link', { name: '새 전략 만들기' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '새 전략 만들기' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByLabel('전략 이름')).toBeFocused();
  expect(posts).toEqual([]);
});

test('정상 빈 목록과 최초 조회 실패, 이전 조회의 평가 기록을 구분한다', async ({ page }) => {
  const state = snapshot();
  let fail = true;
  await page.route('**/api/state', r => fail ? r.fulfill({ status: 503, body: 'example' }) : r.fulfill({ json: state }));
  await page.goto('/strategies?environment=kis-paper');
  const latest = page.getByRole('region', { name: '최근 KIS 평가' });
  await expect(latest).toContainText('로컬 조회 실패');
  await expect(page.getByText('로컬 조회 실패 · 저장 전략 미확인', { exact: true })).toBeVisible();
  await expect(latest).not.toContainText('전략이 없습니다');
  fail = false;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(latest).toContainText('저장된 KIS 전략이 없습니다');
  state.strategies.push({ ...state.strategies[0], id: 'older', name: '예시 신호', environment: 'kis-paper',
    evaluations: [{ event: 'sample', at: '2026-11-20T01:00:00.000Z', revision: 1, signal: 'buy', status: 'accepted', reason: '예시 접수' }] });
  await expect(latest).toContainText('접수 · 체결 미확정');
  fail = true;
  await expect(latest).toContainText('최신 평가 미확인', { timeout: 8000 });
  await expect(latest).toContainText('마지막 조회 기록');
  await expect(latest).toContainText('예시 접수');
  await expect(page.getByRole('button', { name: '전략 시작' })).toBeDisabled();
});

test('DEMO 긴급정지와 종목 미제공 차단 사유를 조작 옆에 표시한다', async ({ page }) => {
  const state = snapshot();
  state.instruments = [];
  state.risk.halted = true;
  await page.route('**/api/state', r => r.fulfill({ json: state }));
  await page.goto('/strategies?environment=demo');
  await expect(page.getByText('신규 실행 차단 · 긴급정지 켜짐')).toBeVisible();
  await expect(page.getByText(/긴급정지로 재생 시작 차단/)).toBeVisible();
  await expect(page.getByRole('button', { name: '전략 시작' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '자동 재생 시작' })).toBeDisabled();
  await expect(page.getByLabel('대상 종목').locator('option:checked')).toHaveText('저장 가능한 종목 없음');
  await expect(page.getByRole('button', { name: '전략 저장' })).toBeDisabled();
});

test('KIS 시세가 서버 관측보다 미래이면 차단하고 유효 시간 안의 동일 종목은 시작 버튼을 연다', async ({ page }) => {
  const now = '2026-11-20T01:00:00.000Z';
  await page.clock.setFixedTime(new Date(now));
  const state = snapshot();
  state.status.observedAt = state.status.lastSuccessAt = now;
  state.strategies = [{ ...state.strategies[0], code: '005930', environment: 'kis-paper' }];
  state.realtime = { phase: 'ready', required: true, fresh: true, ordersAllowed: true,
    code: '005930', lastQuoteAt: '2026-11-20T01:00:00.001Z', quoteSeconds: 5,
    lastNoticeAt: null, reconciledAt: now, price: 73000, message: '예시 대조 완료' };
  await page.route('**/api/state', r => r.fulfill({ json: state }));
  await page.goto('/strategies?environment=kis-paper');
  const start = page.getByRole('button', { name: '전략 시작' });
  await expect(page.getByText(/전략 시작 차단 · 현재 시세 유효 시간/)).toBeVisible();
  await expect(start).toBeDisabled();
  state.realtime.lastQuoteAt = '2026-11-20T00:59:59.000Z';
  await page.reload();
  await expect(start).toBeEnabled();
});
