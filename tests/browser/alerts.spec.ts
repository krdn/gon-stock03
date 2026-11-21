import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

test('alerts separate environments and link causes without executing broker requests', async ({ page }) => {
  await page.clock.install(); const state = snapshot();
  state.events = [
    { id: 'paper:1', time: '2026-11-16T07:00:00Z', title: 'KIS 불명 복구 확인', detail: '응답 불명 → 접수 · 미체결', level: 'info', read: false, environment: 'kis-paper', target: 'paper', requestId: 'fdcd2e60-96f6-483b-ac3a-b0fefecf34a8' },
    { id: 'risk', time: '2026-11-16T06:00:00Z', title: '신규 주문 긴급정지', detail: '기접수 주문은 별도 취소', level: 'warning', read: false, environment: 'shared', target: 'risk' },
    { id: 'connection', time: '2026-11-16T05:00:00Z', title: 'KIS 연결 확인 실패', detail: '인증 만료', level: 'error', read: true, environment: 'kis-paper', target: 'settings' },
  ];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  const posts: string[] = []; page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/alerts');
  await expect(page.locator('.topbar')).toContainText('DEMO / KIS 모의 · 운영 이벤트');
  await expect(page.locator('.event')).toHaveCount(3);
  await expect(page.locator('.event').first()).toContainText('KIS 모의');
  const request = page.locator('.event').first().getByText('요청 ID', { exact: true });
  await expect(page.getByText(state.events[0].requestId!, { exact: true })).toBeHidden();
  await request.focus(); await page.keyboard.press('Space');
  await expect(page.getByText(state.events[0].requestId!, { exact: true })).toBeVisible();
  await expect(page.locator('.event').first().getByRole('link', { name: '원인 화면' })).toHaveAttribute('href', '/paper');
  await expect(page.locator('.event').nth(1)).toContainText('공통 위험');
  await page.getByLabel('중요도', { exact: true }).selectOption('error');
  await expect(page.locator('.event')).toHaveCount(1);
  await expect(page.locator('.event').getByRole('link', { name: '원인 화면' })).toHaveAttribute('href', '/settings');
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.locator('.event')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: '원인 화면' }).click(); await expect(page).toHaveURL(/\/settings/); expect(posts).toEqual([]);
});

test('failed read save retains unread events and successful save survives reload', async ({ page }) => {
  await page.goto('/alerts'); await expect(page.locator('.unread-dot').first()).toBeVisible();
  await page.route('**/api/events/read', route => route.fulfill({ status: 500, json: { error: '요청과 이벤트 저장에 실패했습니다. 저장소 상태를 확인하세요.' } }));
  await page.getByRole('button', { name: /이 목록 .*읽음 처리/ }).click();
  await expect(page.getByRole('alert')).toContainText('저장소 상태');
  await expect(page.locator('.alerts-feedback')).toContainText('읽음 저장 결과를 확인하지 못했습니다');
  await expect(page.locator('.unread-dot').first()).toBeVisible();
  await page.unroute('**/api/events/read'); await page.getByRole('button', { name: /이 목록 .*읽음 처리/ }).click();
  await expect(page.locator('.unread-dot')).toHaveCount(0); await page.reload(); await expect(page.locator('.unread-dot')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '이 목록 0건 읽음 처리' })).toBeDisabled();
});

test('same revision receives new audits and read acknowledgement excludes events not yet shown', async ({ page }) => {
  const state = snapshot();
  state.events = [{ id: 'paper:first', time: '2026-11-16T07:00:00Z', title: 'KIS 주문 응답', detail: '접수 · 미체결', level: 'info', read: false, target: 'paper', environment: 'kis-paper' }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/events/read', route => {
    expect(route.request().postDataJSON()).toEqual({ ids: ['paper:first'] });
    state.events[0].read = true;
    state.events.unshift({ id: 'paper:new', time: '2026-11-16T07:01:00Z', title: 'KIS 주문 대조', detail: '응답 불명 · 대조 필요', level: 'warning', read: false, target: 'paper', environment: 'kis-paper' });
    return route.fulfill({ json: {} });
  });
  await page.goto('/alerts'); await expect(page.locator('.event')).toHaveCount(1);
  await page.getByRole('button', { name: /이 목록 .*읽음 처리/ }).click();
  await expect(page.locator('.event')).toHaveCount(2);
  await expect(page.locator('.event').first()).toContainText('미읽음');
  await expect(page.locator('.unread-dot')).toHaveCount(1);
});

test('filter intersection persists on history navigation and read saves only its visible IDs', async ({ page }) => {
  const state = snapshot();
  const first = { id: 'kis', time: '2026-11-18T03:12:00Z', title: 'KIS 전략 정지', detail: '개별 확인 필요', level: 'warning', environment: 'kis-paper', target: 'strategies', read: false } as const;
  state.events = [first, { ...first, id: 'risk', environment: 'shared', target: 'risk' },
    { ...first, id: 'info', level: 'info' }, { ...first, id: 'read', read: true }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(new URL(req.url()).pathname); });
  await page.route('**/api/events/read', route => {
    expect(route.request().postDataJSON()).toEqual({ ids: ['kis'] });
    state.events[0].read = true;
    return route.fulfill({ json: {} });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/alerts?level=invalid');
  await expect(page.getByLabel('중요도')).toHaveValue('all');
  await page.getByLabel('중요도').selectOption('warning');
  const env = page.getByLabel('환경', { exact: true });
  await env.focus(); await page.keyboard.press('k'); await expect(env).toHaveValue('kis-paper');
  await page.keyboard.press('Tab'); await expect(page.getByLabel('읽음 상태')).toBeFocused();
  await page.getByLabel('읽음 상태').selectOption('unread');
  const url = page.url();
  await expect(page.locator('.alerts-scope')).toContainText('수신 4건 중 표시 1건 · 이 목록 미읽음 1건');
  const link = page.getByRole('link', { name: 'KIS 모의 전략 원인 화면' });
  await link.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('전략 환경')).toHaveValue('kis-paper');
  await page.goBack(); await expect(page).toHaveURL(url);
  await page.reload(); await expect(page.locator('.event')).toHaveCount(1);
  await expect(page.getByLabel('읽음 상태')).toHaveValue('unread');
  expect(posts).toEqual([]);
  await page.getByRole('button', { name: '이 목록 1건 읽음 처리' }).click();
  await expect(page.getByRole('heading', { name: '조건에 맞는 이벤트가 없습니다' })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await expect(page.locator('.event')).toHaveCount(4);
  await expect(page.locator('.unread-dot')).toHaveCount(2);
  expect(posts).toEqual(['/api/events/read']);
});

test('unverified initial state, confirmed empty and partial events have distinct actions', async ({ page }) => {
  await page.clock.install();
  const state = snapshot();
  state.events = [];
  let mode: 'failure' | 'empty' | 'partial' = 'failure';
  let release!: () => void;
  const initial = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', async route => {
    await initial;
    if (mode === 'failure') return route.fulfill({ status: 503, body: '' });
    return route.fulfill({ json: state });
  });
  await page.goto('/alerts', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('이벤트를 불러오는 중입니다.')).toBeVisible();
  await expect(page.locator('.event')).toHaveCount(0);
  release();
  await expect(page.getByText(/이벤트 수신 여부 미확인/)).toBeVisible();
  await expect(page.getByRole('button', { name: '이 목록 읽음 처리' })).toBeDisabled();
  await expect(page.getByText('아직 이벤트가 없습니다')).toHaveCount(0);
  mode = 'empty';
  await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await expect(page.getByRole('heading', { name: '아직 이벤트가 없습니다' })).toBeVisible();
  mode = 'partial';
  state.status = { ...state.status, phase: 'partial', complete: false };
  state.events = [{ id: 'partial', title: '일부 수신 예시', time: state.startedAt, level: 'info', read: false, target: 'strategies', detail: '수신 환경을 확인할 수 없습니다.' }];
  state.realtime = { phase: 'reconciling', required: true, ordersAllowed: false, message: '예시 대조 필요', code: null,
    lastQuoteAt: null, lastNoticeAt: null, reconciledAt: null, price: null, fresh: false };
  await page.clock.fastForward(3500);
  await expect(page.locator('.event')).toContainText('환경 미확인');
  await expect(page.getByText(/이벤트 일부 수신/)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('KIS 실시간 대조 필요');
  await expect(page.getByRole('button', { name: '이 목록 읽음 처리' })).toBeDisabled();
  await expect(page.getByRole('link', { name: '전략 원인 화면', exact: true })).toHaveAttribute('href', '/strategies');
  await page.getByLabel('중요도').selectOption('error');
  await expect(page.getByRole('heading', { name: '조건에 맞는 이벤트가 없습니다' })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  state.realtime.phase = 'connecting'; await page.clock.fastForward(3500);
  await expect(page.getByRole('alert')).toContainText('마지막 수신 기준 · KIS 실시간 연결 중 · 실시간 기준 신규 주문 차단');
  await expect(page.locator('.alerts-realtime summary')).toContainText('마지막 수신 기준 · KIS 실시간 연결 중');
  state.status.phase = 'loading'; await page.clock.fastForward(3500);
  await expect(page.locator('p.alerts-warning').filter({ hasText: '최신 이벤트 미확인' })).toBeVisible();
  mode = 'failure'; await page.clock.fastForward(3500);
  await expect(page.getByText(/최신 이벤트 미확인/)).toBeVisible();
  await expect(page.locator('.event')).toContainText('일부 수신 예시');
});

test('saving stopped DEMO and KIS strategies records their actual environment and opens it', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(new URL(req.url()).pathname); });
  for (const [environment, label] of [['demo', 'DEMO'], ['kis-paper', 'KIS 모의']] as const) {
    const name = `알림 확인용 ${label} 전략`;
    await page.goto('/strategies?environment=' + environment);
    await expect(page.getByLabel('전략 환경')).toBeEnabled();
    await expect(page.getByLabel('전략 환경')).toHaveValue(environment);
    await page.getByLabel('전략 이름').fill(name);
    const saved = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/strategies');
    await page.getByRole('button', { name: '전략 저장' }).click();
    expect((await saved).ok()).toBe(true);
    await page.getByRole('link', { name: '알림 열기' }).click();
    const row = page.locator('article.event').filter({ hasText: name }).first();
    await expect(row.locator('.alerts-meta')).toContainText(label);
    const state = await (await page.request.get('/api/state')).json();
    expect(state.events.find((e: { detail: string }) => e.detail === name)).toMatchObject({ environment, target: 'strategies' });
    expect(state.strategies.find((s: { name: string }) => s.name === name)).toMatchObject({ environment, active: false });
    await row.getByRole('link', { name: label + ' 전략 원인 화면' }).click();
    await expect(page.getByLabel('전략 환경')).toHaveValue(environment);
  }
  expect(posts).toEqual(['/api/strategies', '/api/strategies']);
});
