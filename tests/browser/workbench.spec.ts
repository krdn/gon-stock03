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
test('journal rejects empty and whitespace notes without losing the draft', async ({ page }) => {
  await page.goto('/journal');
  await expect(page.getByRole('button', { name: '일지 저장' })).toBeEnabled();
  const before = (await (await page.request.get('/api/state')).json()).journal;
  await page.getByRole('button', { name: '일지 저장' }).click();
  expect(await page.getByLabel('매매 메모').evaluate((node: HTMLTextAreaElement) => node.validity.valueMissing)).toBe(true);
  await page.getByLabel('매매 메모').fill('  \n\t ');
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.getByRole('alert')).toContainText('입력값을 확인하세요');
  await expect(page.getByLabel('매매 메모')).toHaveValue('  \n\t ');
  expect((await (await page.request.get('/api/state')).json()).journal).toEqual(before);
  await expect(page.getByText('변경 사항을 저장했습니다.', { exact: true })).toHaveCount(0);
});

test('journal separates first empty state from no search results and searches body/code', async ({ page }) => {
  const state = snapshot(); state.journal = [];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/journal'); await expect(page.getByText('기록이 쌓이면 원칙이 보입니다')).toBeVisible();
  state.journal = [{ id: 'journal-search', code: '005930', date: '2026-11-15T12:00:00Z', text: '진입 원칙 지키기' }];
  await page.reload();
  for (const query of ['원칙', '005930']) {
    await page.getByLabel('일지 검색').fill(query); await expect(page.locator('.journal-entry')).toHaveCount(1);
  }
  await page.getByLabel('일지 검색').fill('일치하지 않는 검색어');
  await expect(page.getByText('검색 결과가 없습니다', { exact: true })).toBeVisible();
  await expect(page.getByText('기록이 쌓이면 원칙이 보입니다')).toHaveCount(0);
  await page.getByLabel('일지 검색').fill(''); await expect(page.locator('.journal-entry')).toHaveCount(1);
});

test('journal save failure retains draft and never reports success; retry persists safely on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const text = '<img src=x onerror="window.journalExecuted=true"><script>window.journalExecuted=true</script>\n' + '긴메모'.repeat(90);
  await page.goto('/journal'); await expect(page.getByRole('button', { name: '일지 저장' })).toBeEnabled();
  await page.getByLabel('매매 메모').fill(text);
  await page.route('**/api/journal', route => route.fulfill({ status: 500, json: { error: '요청과 이벤트 저장에 실패했습니다. 저장소 상태를 확인하세요.' } }));
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.getByRole('alert')).toContainText('저장에 실패');
  await expect(page.getByLabel('매매 메모')).toHaveValue(text);
  await expect(page.getByText('변경 사항을 저장했습니다.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.journal-entry').filter({ hasText: text })).toHaveCount(0);
  await page.unroute('**/api/journal');
  await page.getByRole('button', { name: '일지 저장' }).click();
  await expect(page.getByLabel('매매 메모')).toHaveValue('');
  await expect(page.locator('.journal-entry').filter({ hasText: text })).toHaveCount(1);
  await page.reload();
  const entry = page.locator('.journal-entry').filter({ hasText: text });
  await expect(entry).toBeVisible(); await expect(entry.locator('img,script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { journalExecuted?: boolean }).journalExecuted)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('journal keeps new typing while an earlier save response is pending', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let received!: () => void;
  const requestReceived = new Promise<void>(resolve => { received = resolve; });
  await page.route('**/api/journal', async route => { received(); await gate; await route.continue(); });
  await page.goto('/journal'); await expect(page.getByRole('button', { name: '일지 저장' })).toBeEnabled();
  await page.getByLabel('매매 메모').fill('먼저 저장한 메모');
  await page.getByRole('button', { name: '일지 저장' }).click(); await requestReceived;
  try {
    await expect(page.getByRole('button', { name: '일지 저장' })).toBeDisabled();
    await page.getByLabel('매매 메모').fill('응답 대기 중 새로 작성한 메모');
  } finally { release(); }
  await expect(page.getByRole('button', { name: '일지 저장' })).toBeEnabled();
  await expect(page.locator('.journal-entry').filter({ hasText: '먼저 저장한 메모' })).toHaveCount(1);
  await expect(page.getByLabel('매매 메모')).toHaveValue('응답 대기 중 새로 작성한 메모');
  expect((await (await page.request.get('/api/state')).json()).journal.some((entry: { text: string }) => entry.text === '응답 대기 중 새로 작성한 메모')).toBe(false);
});

test('design connects every screen to its issue, stage, contract and implementation evidence', async ({ page }) => {
  const mapping = [
    ['dashboard', 18, '04 주문·위험'], ['market', 10, '02 데이터·조회'], ['watchlist', 20, '03 조회·주문 계약'],
    ['trade', 12, '04 주문·위험'], ['orders', 13, '04 주문·위험'], ['portfolio', 16, '02 데이터·조회'],
    ['strategies', 22, '05 자동매매'], ['backtest', 21, '03 조회·주문 계약'], ['risk', 11, '04 주문·위험'],
    ['journal', 23, '01 기반'], ['alerts', 17, '04 주문·위험'], ['data', 15, '02 데이터·조회'],
    ['settings', 8, '02 데이터·조회'], ['design', 24, '01 기반'], ['paper', 14, '04 주문·위험'],
  ] as const;
  expect(screens.map(s => s.id)).toEqual(mapping.map(([id]) => id));
  await page.goto('/design?tab=screens');
  for (const [id, issue, stage] of mapping) {
    const screen = screens.find(s => s.id === id)!;
    const button = page.locator('.spec-nav').getByRole('button', { name: new RegExp(screen.title) });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: `작업·완료 기준 #${issue}`, exact: true })).toHaveAttribute('href', `https://github.com/krdn/gon-stock03/issues/${issue}`);
    await expect(page.getByRole('link', { name: '구현 근거', exact: true })).toHaveAttribute('href', /^https:\/\/github.com\/krdn\/gon-stock03\/blob\/main\/src\//);
    await expect(page.getByText(stage, { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '현재 동작 범위', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '후속·검증 경계', exact: true })).toBeVisible();
    await expect(page.locator('.api-chips')).toContainText(screen.api[0]);
    await expect(page.getByRole('link', { name: '화면 열기', exact: true })).toHaveAttribute('href', '/' + id);
  }
  await page.getByRole('button', { name: '리서치·API', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(15);
  await page.getByRole('button', { name: '개발 단계', exact: true }).click();
  await expect(page.locator('.roadmap')).toContainText('06 장중 실증');
  await expect(page.locator('.roadmap .panel').filter({ has: page.getByRole('heading', { name: '01 기반', exact: true }) }).getByRole('link', { name: '공통·실증 #7', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '현재 진행 상태 · GitHub', exact: true })).toHaveAttribute('href', 'https://github.com/users/krdn/projects/25');
});

test('design supports keyboard selection and mobile navigation across every topic', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/design?screen=design');
  const topics = page.getByRole('group', { name: '설계 주제' }).getByRole('button');
  await topics.first().focus();
  for (let i = 0; i < 6; i++) {
    await expect(topics.nth(i)).toBeFocused(); await page.keyboard.press('Enter');
    await expect(topics.nth(i)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (i < 5) await page.keyboard.press('Tab');
  }
  await topics.nth(1).focus(); await page.keyboard.press('Space');
  const choices = page.locator('.spec-nav button'); await choices.first().focus();
  for (let i = 0; i < 15; i++) {
    await expect(choices.nth(i)).toBeFocused(); await page.keyboard.press('Enter');
    await expect(choices.nth(i)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('link', { name: '화면 열기', exact: true })).toHaveAttribute('href', '/' + screens[i].id);
    const bounds = await choices.nth(i).evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth }; });
    expect(bounds.left >= 0 && bounds.right <= bounds.width, `${screens[i].id}: ${JSON.stringify(bounds)}`).toBe(true);
    if (i < 14) await page.keyboard.press('Tab');
  }
  await page.reload(); await expect(choices.last()).toHaveAttribute('aria-pressed', 'true');
  await expect(choices.last()).toBeInViewport({ ratio: 0.99 });
});

test('design malformed topic and fractional step links remain navigable', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/design?tab=missing');
  await expect(page.getByRole('heading', { name: '화면 지도', exact: true })).toBeVisible();
  for (const step of ['1.5', '-1', 'Infinity', 'no-step']) {
    await page.goto('/design?tab=flow&step=' + step);
    await expect(page.locator('.step-detail h3')).toHaveText('입력·확인');
  }
  expect(errors).toEqual([]);
});

test('project map local drafts never send requests or approve execution, including blocked storage', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); }; });
  await page.goto('/project-map.html#screens');
  const requests: string[] = []; page.on('request', req => requests.push(req.url()));
  await expect(page.getByRole('link', { name: '현재 진행 상태 · GitHub' })).toHaveAttribute('href', 'https://github.com/users/krdn/projects/25');
  await page.getByRole('textbox', { name: '이 부분에 수정 요청 남기기' }).fill('<script>검토 요청</script>');
  const save = page.getByRole('button', { name: '초안 저장', exact: true }); await save.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('브라우저 저장이 제한');
  await expect(page.getByRole('textbox')).toHaveValue('<script>검토 요청</script>');
  await page.locator('summary').click();
  await expect(page.locator('#packet')).toContainText('실행·승인 아님');
  await expect(page.locator('#packet script')).toHaveCount(0);
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '요청 파일 받기', exact: true }).click();
  const content = await readFile((await (await downloading).path())!, 'utf8');
  expect(content).toContain('전송 상태: 미전송'); expect(content).toContain('실행·승인 아님'); expect(requests).toEqual([]);
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
