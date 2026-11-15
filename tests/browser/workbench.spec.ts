import { test, expect } from '@playwright/test';
import { screens } from '../../src/specs';
import { readFile } from 'node:fs/promises';
import { snapshot } from '../snapshot';

test('stored risk limits hydrate after reload without overwriting user edits on polling', async ({ page, request }) => {
  const before = (await (await request.get('/api/state')).json()).risk;
  await request.post('/api/risk', { headers: { 'X-Workbench': 'local' }, data: { maxOrder: 500000, maxPosition: 3000000, dailyLoss: 250000 } });
  try {
    await page.clock.install(); await page.goto('/risk');
    await expect(page.getByLabel('1회 주문 한도 (원)', { exact: true })).toHaveValue('500000');
    await page.getByLabel('1회 주문 한도 (원)', { exact: true }).fill('600000');
    await request.post('/api/risk', { headers: { 'X-Workbench': 'local' }, data: { maxOrder: 500000, maxPosition: 3500000, dailyLoss: 250000 } });
    const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
    await expect(page.getByLabel('1회 주문 한도 (원)', { exact: true })).toHaveValue('600000');
  } finally { await request.post('/api/risk', { headers: { 'X-Workbench': 'local' }, data: { maxOrder: before.maxOrder, maxPosition: before.maxPosition, dailyLoss: before.dailyLoss } }); }
});
test('quote polling preserves the limit price and open order confirmation', async ({ page }) => {
  await page.clock.install();
  const state = snapshot(); state.instruments[0].price = 74800; state.revision = 20;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/trade'); await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeEnabled();
  await expect(page.getByLabel('주문 가격 (원)')).toHaveValue('74800');
  await page.getByLabel('주문 가격 (원)').fill('70000');
  await page.getByRole('button', { name: '매수 주문 확인' }).click();
  state.instruments[0].price += 1000; state.revision++;
  const updated = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await updated;
  await expect(page.locator('.quote strong')).toContainText('75,800');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('70,000원');
  await expect(page.getByLabel('주문 가격 (원)')).toHaveValue('70000');
});
test('watchlist polling preserves search and focus', async ({ page }) => {
  await page.clock.install(); await page.goto('/watchlist'); await expect(page.getByText('로컬 서버 연결', { exact: true })).toBeVisible(); const search = page.getByRole('textbox').first();
  await search.fill('삼성'); const updated = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await updated;
  await expect(search).toHaveValue('삼성'); await expect(search).toBeFocused();
});
test('paper page shows a stored unknown order before a broker query', async ({ page }) => {
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [{ requestId: 'stored', code: '005930', side: 'buy', qty: 1, price: 70000, createdAt: new Date().toISOString(), tradeDate: '20261114', status: 'unknown', filled: 0, remaining: 1, message: '저장된 응답 불명' }] } }));
  await page.goto('/paper'); await expect(page.getByText('저장된 응답 불명', { exact: true })).toBeVisible();
  await expect(page.getByText('앱의 KIS 주문 기록 없음', { exact: true })).toHaveCount(0);
});

test('all screens and detailed specs render without console errors at desktop and mobile sizes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const screen of screens) {
    await page.goto('/' + screen.id); await expect(page.getByRole('heading', { name: screen.title + '.', exact: true })).toBeVisible();
    await expect(page.getByLabel('환경과 데이터 상태')).toContainText('DEMO · 합성 데이터');
    await expect(page.getByLabel('환경과 데이터 상태')).toContainText('KIS 모의 · REST');
    await expect(page.getByLabel('긴급정지 상태', { exact: true })).toContainText('긴급정지 꺼짐');
    await expect(page.getByText('화면 미리보기입니다.', { exact: false })).toHaveCount(0);
  }
  await page.goto('/design?screen=trade'); await expect(page.getByText('사용자가 하는 일', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '주문 흐름', exact: true }).click(); await page.getByRole('button', { name: '02 서버 위험 검사' }).click();
  await expect(page.getByText('화면 검사를 우회해', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const screen of screens) {
    await page.goto('/' + screen.id); await expect(page.getByRole('heading', { name: screen.title + '.', exact: true })).toBeVisible();
    await expect(page.getByLabel('환경과 데이터 상태')).toContainText('DEMO · 합성 데이터');
    await expect(page.getByLabel('환경과 데이터 상태')).toContainText('KIS 모의 · REST');
    await expect(page.getByLabel('긴급정지 상태', { exact: true })).toContainText('긴급정지 꺼짐');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), screen.id).toBe(true);
  }
  await page.getByRole('button', { name: '메뉴 열기' }).click(); await page.getByRole('navigation').getByRole('link', { name: '대시보드', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/); expect(errors).toEqual([]);
});
test('manual order is confirmed, filled later, and reflected in portfolio; watchlist persists', async ({ page }) => {
  await page.goto('/trade'); await page.getByLabel('주문 가격 (원)').fill('80000'); await page.getByLabel('주문 수량 (주)').fill('1');
  await page.getByRole('button', { name: '매수 주문 확인' }).click(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click(); await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/orders'); await expect(page.getByText('접수 · 미체결', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다음 데모 봉 재생' }).click(); await expect(page.getByRole('cell', { name: '체결', exact: true })).toBeVisible();
  await page.goto('/portfolio'); await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click(); await expect(page.getByRole('row').filter({ hasText: '삼성전자' })).toContainText('31주');
  await page.goto('/watchlist'); await page.getByRole('button', { name: 'NAVER 관심 해제', exact: true }).click();
  await page.reload(); await expect(page.getByRole('button', { name: 'NAVER 관심 해제', exact: true })).toHaveCount(0);
  const saved = await (await page.request.get('/api/state')).json(); expect(saved.watchlist).not.toContain('035420');
  await page.request.post('/api/watchlist', { headers: { 'X-Workbench': 'local' }, data: { code: '035420' } });
});
test('strategy saves, automatic replay advances, backtest computes, halt stops and blocks new orders', async ({ page, request }) => {
  await page.goto('/strategies'); await page.getByLabel('전략 이름').fill('브라우저 검증 전략'); await page.getByRole('button', { name: '전략 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '브라우저 검증 전략' })).toBeVisible();
  await page.getByRole('button', { name: '전략 시작', exact: true }).first().click();
  const before = (await (await request.get('/api/state')).json()).tick;
  await page.getByRole('button', { name: '자동 재생 시작', exact: true }).click();
  await expect.poll(async () => (await (await request.get('/api/state')).json()).tick, { timeout: 8000 }).toBeGreaterThan(before);
  await page.goto('/risk'); await page.getByRole('button', { name: '신규 주문 긴급정지', exact: true }).click();
  await expect(page.getByRole('button', { name: '신규 주문 허용', exact: true })).toBeVisible();
  const stopped = await (await request.get('/api/state')).json(); expect(stopped.playing).toBe(false); expect(stopped.strategies.every((s: { active: boolean }) => !s.active)).toBe(true);
  await page.goto('/trade'); await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
  await page.goto('/risk'); await page.getByRole('button', { name: '신규 주문 허용' }).click();
  await page.goto('/backtest'); await page.getByRole('combobox', { name: '데이터 출처', exact: true }).selectOption('demo'); await page.getByRole('button', { name: '백테스트 실행' }).click(); await expect(page.getByRole('heading', { name: '자산 곡선' })).toBeVisible();
});
test('journal treats input as text and saves; missing KIS credentials show failure rather than success', async ({ page }) => {
  await page.goto('/journal'); const text = '<script>alert("not code")</script> 규칙을 지켰다.';
  await page.getByLabel('매매 메모').fill(text); await page.getByRole('button', { name: '일지 저장' }).click();
  await page.reload(); await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.goto('/settings'); await page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' }).click();
  await expect(page.getByRole('alert')).toContainText('환경변수'); await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
  await page.goto('/paper'); await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeDisabled();
});
test('project map selects a stable node, restores draft and downloads request without AI transmission', async ({ page }) => {
  await page.goto('/project-map.html');
  await page.getByRole('button', { name: /^4 로컬 기능 구현/ }).click();
  await page.getByRole('textbox', { name: '이 부분에 수정 요청 남기기' }).fill('검증용 초안: 주문 상태 설명 확인');
  await page.getByRole('button', { name: '초안 저장', exact: true }).click();
  await page.reload(); await expect(page.getByRole('textbox', { name: '이 부분에 수정 요청 남기기' })).toHaveValue('검증용 초안: 주문 상태 설명 확인');
  await page.getByRole('button', { name: '근거와 한계', exact: true }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '요청 파일 받기', exact: true }).click();
  const download = await downloading; const content = await readFile((await download.path())!, 'utf8');
  expect(content).toContain('local-features'); expect(content).toContain('검증용 초안');
  await expect(page.getByText('AI 실행 미연결', { exact: false }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('stored daily backtest is separate from DEMO and replays a persisted experiment after reload', async ({ page }, testInfo) => {
  const { Store } = await import('../../server/store.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const { dailyFixture } = await import('../backtest-fixture.ts');
  const store = new Store(':memory:'), f = dailyFixture(); store.saveDaily(f.run, f.bars);
  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4314, 4332]);
  await new Promise<void>(resolve => server.listen(4332, '127.0.0.1', resolve));
  await page.route('**/api/**', async route => {
    const response = await route.fetch({ url: route.request().url().replace(':4314', ':4332') }); await route.fulfill({ response });
  });
  try {
    await page.goto('/backtest');
    await expect(page.getByRole('combobox', { name: '데이터 출처', exact: true })).toHaveValue('stored');
    await expect(page.getByRole('combobox', { name: '수정주가 정책', exact: true })).toHaveValue('raw');
    await page.getByLabel('단기 (봉)', { exact: true }).fill('2'); await page.getByLabel('장기 (봉)', { exact: true }).fill('4');
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    const result = page.getByRole('region', { name: '저장 일봉 실험 결과' });
    await expect(result).toContainText('15봉'); await expect(result).toContainText('00088K'); await expect(result).toContainText('원주가');
    await expect(result).toContainText('2026-01-13'); await expect(result).toContainText('다음 봉 시가');
    await expect(page.getByText('세금·배당·기업행사를 반영하지 않습니다.', { exact: false })).toBeVisible();
    const hash = await result.getByTestId('experiment-hash').textContent(); expect(hash).toMatch(/^[a-f0-9]{64}$/);
    await page.reload(); await page.getByRole('button', { name: '저장 실험 불러오기', exact: true }).click();
    await expect(result.getByTestId('experiment-hash')).toHaveText(hash!);
    await page.getByRole('button', { name: '고정 입력으로 재현 검증', exact: true }).click();
    await expect(result).toContainText('재현 일치');
    await page.getByRole('button', { name: '알림 닫기', exact: true }).click();
    await result.getByText('재현 입력·출처 확인', { exact: true }).click();
    await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: testInfo.outputPath('backtest-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.sidebar')).not.toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('backtest-mobile.png'), fullPage: true });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => ({ tag: e.tagName, class: e.className, width: e.getBoundingClientRect().width, text: e.textContent?.slice(0, 40) })));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(overflow)).toBe(true);
    await page.getByLabel('시작일', { exact: true }).fill('2026-01-22');
    await expect(result).toHaveCount(0);
    await page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true }).click();
    await expect(page.getByRole('main').getByRole('alert').filter({ hasText: '가격 표본이 부족' })).toBeVisible();
    await expect(result).toHaveCount(0);
    await page.getByRole('combobox', { name: '데이터 출처', exact: true }).selectOption('demo');
    await expect(page.getByText('현재 저장된 합성 봉으로 계산하는 기능 검증입니다.', { exact: false })).toBeVisible();
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});

test('backtest empty storage and list failures never fall back to synthetic data', async ({ page }) => {
  await page.goto('/backtest');
  await expect(page.getByText('저장된 KIS 일봉이 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeDisabled();
  await page.route('**/api/data/daily', route => route.fulfill({ status: 503, body: 'failed' }));
  await page.getByRole('button', { name: '실험 목록 새로고침', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '실험 목록 조회 실패' })).toBeVisible();
  await expect(page.getByText('저장된 KIS 일봉이 없습니다', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true })).toBeDisabled();
});
