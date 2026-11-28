import { test, expect, type Page } from '@playwright/test';
import { snapshot } from '../snapshot';

const market = (code = '005930', price = 190300) => ({
  quote: { code, price, change: -3.3, upper: 255800, lower: 137800, tickSize: 100, stopped: false, volume: 15771834, receivedAt: new Date().toISOString() },
  bars: [{ date: '20261113', close: 206000 }, { date: '20261116', close: 196800 }, { date: '20261117', close: price }],
});
async function local(page: Page) {
  await page.route('**/api/state', async route => {
    const state = snapshot();
    state.status.staleAfterMs = 3_600_000;
    await route.fulfill({ json: state });
  });
}

test('trade defaults to actual KIS quote and dated bars without demo money or order transmission', async ({ page }) => {
  await local(page); const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.route('**/api/kis/market', route => route.fulfill({ json: market() }));
  await page.goto('/trade');
  await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  await expect(page.getByRole('img', { name: '005930 KIS 수정 일봉 종가 3개' })).toBeVisible();
  await expect(page.getByText('2026-11-17', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '실제 시세', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'KIS 모의 주문 화면' })).toHaveAttribute('href', '/paper?code=005930');
  await expect(page.getByLabel('주문 가격 (원)')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('72,800');
  await expect(page.locator('main')).not.toContainText('8,341,000');
  expect(posts).toEqual(['/api/kis/market']);
});

test('initial quote failure has no synthetic fallback and manual retry recovers', async ({ page }) => {
  await local(page); let fail = true;
  await page.route('**/api/kis/market', route => fail ? route.fulfill({ status: 503, body: 'private-upstream-detail' }) : route.fulfill({ json: market() }));
  await page.goto('/trade');
  await expect(page.getByRole('alert')).toContainText('현재가·일봉을 조회하지 못했습니다');
  await expect(page.getByLabel('실제 시세 상태')).toContainText('수신값 없음');
  await expect(page.getByLabel('실제 현재가')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('72,800');
  await expect(page.locator('main')).not.toContainText('private-upstream-detail');
  fail = false; await page.getByRole('button', { name: '시세 다시 조회' }).click();
  await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
});

test('polling updates the actual quote and a failed refresh preserves a visibly old value', async ({ page }) => {
  await page.clock.install(); await local(page); let price = 190300; let fail = false; let calls = 0;
  await page.route('**/api/kis/market', route => { calls++; return fail ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: market('005930', price) }); });
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  price = 191000; await page.clock.fastForward(16000);
  await expect(page.getByLabel('실제 현재가')).toHaveText('191,000원');
  fail = true; await page.clock.fastForward(16000);
  await expect(page.getByRole('alert')).toContainText('현재가·일봉을 조회하지 못했습니다');
  await expect(page.getByLabel('실제 현재가')).toHaveText('191,000원');
  await expect(page.getByLabel('실제 시세 상태')).toContainText('이전 수신값 · 최신 아님');
  const failedCalls = calls; await page.clock.fastForward(60000); expect(calls).toBe(failedCalls);
});

test('late response from a previous code cannot replace the selected stock', async ({ page }) => {
  await local(page); let release!: () => void; let oldFinished = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/kis/market', async route => {
    const { code } = route.request().postDataJSON();
    if (code === '005930') { await gate; await route.fulfill({ json: market() }).catch(() => {}); oldFinished = true; }
    else await route.fulfill({ json: market(code, 1080000) });
  });
  const first = page.waitForRequest('**/api/kis/market');
  await page.goto('/trade'); await first;
  await page.getByLabel('실제 시세 종목', { exact: true }).selectOption('000660');
  await expect(page.getByLabel('실제 현재가')).toHaveText('1,080,000원'); release();
  await expect.poll(() => oldFinished).toBe(true);
  await expect(page.getByRole('link', { name: 'KIS 모의 주문 화면' })).toHaveAttribute('href', '/paper?code=000660');
  await expect(page.getByLabel('실제 현재가')).toHaveText('1,080,000원');
});

for (const invalid of ['code', 'bars']) {
  test(`trade rejects mismatched ${invalid} data without showing demo prices`, async ({ page }) => {
    await local(page); const result = market();
    if (invalid === 'code') result.quote.code = '000660'; else result.bars[1].date = result.bars[0].date;
    await page.route('**/api/kis/market', route => route.fulfill({ json: result }));
    await page.goto('/trade');
    await expect(page.getByRole('alert')).toContainText('시세 응답의 종목·가격·일봉을 확인하지 못했습니다');
    await expect(page.getByLabel('실제 현재가')).toHaveCount(0);
  });
}

test('invalid code does not silently switch or call KIS and a direct valid code is preserved', async ({ page }) => {
  await local(page); const calls: string[] = [];
  await page.route('**/api/kis/market', route => { const { code } = route.request().postDataJSON(); calls.push(code); return route.fulfill({ json: market(code) }); });
  await page.goto('/trade?code=wrong');
  await expect(page.getByText('숫자 6자리 종목코드를 입력하세요.', { exact: true })).toBeVisible();
  expect(calls).toEqual([]);
  await page.getByLabel('실제 시세 종목코드').fill('012345');
  await page.getByRole('button', { name: '종목 조회', exact: true }).click();
  await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  expect(calls).toEqual(['012345']);
  await expect(page.getByRole('link', { name: 'KIS 모의 주문 화면' })).toHaveAttribute('href', '/paper?code=012345');
});

test('hidden page pauses price requests and re-entry fetches fresh data', async ({ page }) => {
  await page.clock.install(); await local(page); let calls = 0;
  await page.route('**/api/kis/market', route => { calls++; return route.fulfill({ json: market() }); });
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  const before = calls; await page.clock.fastForward(60000); expect(calls).toBe(before);
  await expect(page.getByLabel('실제 시세 상태')).toContainText('자동 조회 일시정지');
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => calls).toBe(before + 1);
});

test('demo is explicit, keeps its environment on stock changes and never requests KIS', async ({ page }) => {
  await local(page); let calls = 0;
  await page.route('**/api/kis/market', route => { calls++; return route.fulfill({ json: market() }); });
  await page.goto('/trade?mode=demo');
  await expect(page.getByRole('button', { name: 'DEMO 연습', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('트레이딩 종목').selectOption('000660');
  await expect(page).toHaveURL(/mode=demo/);
  await expect(page.getByLabel('주문 가격 (원)')).toBeVisible(); expect(calls).toBe(0);
  await page.getByRole('button', { name: '실제 시세', exact: true }).click();
  await expect(page.getByLabel('주문 가격 (원)')).toHaveCount(0);
});

for (const width of [320, 1440]) {
  test(`actual trade fits ${width}px without horizontal overflow`, async ({ page }) => {
    await local(page); await page.route('**/api/kis/market', route => route.fulfill({ json: market() }));
    await page.setViewportSize({ width, height: 900 }); await page.goto('/trade');
    await expect(page.getByLabel('실제 현재가')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('trusted API client errors preserve rate-limit recovery instructions', async ({ page }) => {
  await local(page);
  await page.route('**/api/kis/market', route => route.fulfill({ status: 400, json: { error: '인증 재시도 대기 중입니다. 1분 후 다시 확인하세요.' } }));
  await page.goto('/trade');
  await expect(page.getByRole('alert')).toContainText('1분 후 다시 확인하세요.');
  await expect(page.getByLabel('실제 현재가')).toHaveCount(0);
});

test('local connection loss pauses quotes and recovery resumes without orders', async ({ page }) => {
  await page.clock.install(); let failed = false; let calls = 0;
  await page.route('**/api/state', route => failed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: snapshot() }));
  await page.route('**/api/kis/market', route => { calls++; return route.fulfill({ json: market() }); });
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  failed = true; const response = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await response;
  await expect(page.getByLabel('실제 시세 상태')).toHaveText('로컬 서버 연결 대기');
  await expect(page.getByRole('button', { name: '시세 다시 조회' })).toBeDisabled(); expect(calls).toBe(1);
  failed = false; await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await expect(page.getByLabel('실제 시세 상태')).toHaveText('수신 완료');
});

for (const offset of [-120_000, 120_000]) {
  test(`uses server time for fresh and aged KRX quotes with device offset ${offset}`, async ({ page }) => {
    const state = snapshot();
    // Keep common availability independent from the quote clock under test (#157).
    state.status.staleAfterMs = 3_600_000;
    const serverTime = Date.parse(state.status.observedAt!);
    await page.clock.install({ time: new Date(serverTime + offset) });
    await page.route('**/api/state', route => route.fulfill({ json: state }));
    const value = market();
    value.quote.receivedAt = new Date(serverTime - 26_000).toISOString();
    await page.route('**/api/kis/market', route => route.fulfill({ json: value }));
    await page.goto('/trade');
    await expect(page.getByLabel('실제 시세 상태')).toHaveText('수신 완료');
    await expect(page.locator('.trade-quote-time time')).toHaveAttribute('datetime', value.quote.receivedAt);
    await page.clock.fastForward(5500);
    await expect(page.getByLabel('실제 시세 상태')).toHaveText('이전 수신값 · 최신 아님');
    value.quote.receivedAt = new Date(serverTime - 45_000).toISOString();
    await page.getByRole('button', { name: '시세 다시 조회' }).click();
    await expect(page.locator('.trade-quote-time time')).toHaveAttribute('datetime', value.quote.receivedAt);
    await expect(page.getByLabel('실제 시세 상태')).toHaveText('이전 수신값 · 최신 아님');
  });
}

test('keyboard range preserves actual count, code and return URL without extra market reads', async ({ page }) => {
  await local(page);
  const posts: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.route('**/api/kis/market', route => route.fulfill({ json: market(route.request().postDataJSON().code) }));
  await page.goto('/trade?code=000660&range=bad');
  const range = page.getByRole('group', { name: '일봉 범위' });
  await expect(range.getByRole('button', { name: '60일봉' })).toHaveAttribute('aria-pressed', 'true');
  await range.getByRole('button', { name: '60일봉' }).press('Enter');
  await expect(page).toHaveURL(/range=60/);
  for (const n of [20, 60, 100]) {
    const button = range.getByRole('button', { name: n + '일봉' });
    await button.focus(); await page.keyboard.press('Space');
    await expect(button).toBeFocused();
    await expect(page).toHaveURL(new RegExp('range=' + n));
    await expect(page.getByText(`KIS 수정 종가 · 3개 거래일 (선택 ${n}일) · 마지막 거래일 2026-11-17`)).toBeVisible();
  }
  expect(posts).toEqual(['/api/kis/market']);
  await page.reload();
  await expect(range.getByRole('button', { name: '100일봉' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'KIS 모의 주문 화면' }).press('Enter');
  await expect(page).toHaveURL(/\/paper\?code=000660$/);
  await page.goBack();
  await expect(range.getByRole('button', { name: '100일봉' })).toHaveAttribute('aria-pressed', 'true');
  expect(posts.every(path => path === '/api/kis/market')).toBe(true);
});

test('partial local state retains labeled previous quote and blocks retry', async ({ page }) => {
  const state = snapshot();
  await page.clock.install();
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/market', route => route.fulfill({ json: market() }));
  await page.goto('/trade'); await expect(page.getByLabel('실제 현재가')).toBeVisible();
  state.status.phase = 'partial'; state.status.complete = false;
  const response = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await response;
  await expect(page.getByLabel('실제 시세 상태')).toHaveText('로컬 서버 연결 대기');
  await expect(page.locator('.quote').getByText('이전 수신값')).toBeVisible();
  await expect(page.getByRole('button', { name: '시세 다시 조회' })).toBeDisabled();
});

test('trade help panel toggles 4 WAI-ARIA tabs with keyboard and restores focus on close', async ({ page }) => {
  await local(page);
  await page.route('**/api/kis/market', route => route.fulfill({ json: market() }));
  await page.goto('/trade');
  const toggle = page.getByRole('button', { name: '사용방법 도움말', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const region = page.getByRole('region', { name: '트레이딩 사용방법 도움말' });
  await expect(region).toBeVisible();
  const tablist = region.getByRole('tablist', { name: '트레이딩 도움말 분류' });
  const tabs = ['처음부터 따라하기', '시세·호가·차트 사전', '주문·한도·체결 사전', '환경별 차이·FAQ'];
  const firstTab = tablist.getByRole('tab', { name: tabs[0] });
  await expect(firstTab).toHaveAttribute('aria-selected', 'true');
  await firstTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(tablist.getByRole('tab', { name: tabs[1] })).toBeFocused();
  await expect(tablist.getByRole('tab', { name: tabs[1] })).toHaveAttribute('aria-selected', 'true');
  await expect(region.getByRole('tabpanel')).toContainText('가격제한폭 위치');
  await page.keyboard.press('ArrowRight');
  await expect(tablist.getByRole('tab', { name: tabs[2] })).toHaveAttribute('aria-selected', 'true');
  await expect(region.getByRole('tabpanel')).toContainText('공통 4대 위험 한도');
  await page.keyboard.press('End');
  await expect(tablist.getByRole('tab', { name: tabs[3] })).toBeFocused();
  await expect(tablist.getByRole('tab', { name: tabs[3] })).toHaveAttribute('aria-selected', 'true');
  await expect(region.getByRole('tabpanel')).toContainText('Zero-Synthetic-Fallback');
  await page.keyboard.press('Home');
  await expect(firstTab).toBeFocused();
  await expect(firstTab).toHaveAttribute('aria-selected', 'true');
  await region.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(region).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('live trade renders quote band metrics, trend/SMA summary, and explicit watchlist actions without extra initial POSTs', async ({ page }) => {
  const state = snapshot();
  state.status.staleAfterMs = 3_600_000;
  state.watchlist = ['005930', '000660', '069500', '035420', '00088K'];
  const posts: { path: string; body: unknown }[] = [];
  page.on('request', r => {
    if (r.method() === 'POST') posts.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
  });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/watchlist', async route => {
    const { code } = route.request().postDataJSON();
    state.watchlist = state.watchlist.includes(code)
      ? state.watchlist.filter(c => c !== code)
      : [...state.watchlist, code];
    state.revision++;
    await route.fulfill({ json: { state } });
  });
  const bars65 = Array.from({ length: 65 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 1 + i));
    const date = d.toISOString().slice(0, 10).replaceAll('-', '');
    return { date, close: 150000 + i * 500 };
  });
  await page.route('**/api/kis/market', route => {
    const { code } = route.request().postDataJSON();
    if (code === '005930') {
      return route.fulfill({
        json: {
          quote: { code, price: 182000, change: 1.25, upper: 234000, lower: 126000, tickSize: 100, stopped: false, liquidation: false, volume: 12345678, sector: '전기전자', receivedAt: new Date().toISOString() },
          bars: bars65,
        },
      });
    }
    if (code === '035420') {
      return route.fulfill({
        json: {
          quote: { code, price: 187200, change: 0, upper: 0, lower: 0, tickSize: 500, stopped: false, receivedAt: new Date().toISOString() },
          bars: [{ date: '20261116', close: 187200 }, { date: '20261117', close: 187200 }],
        },
      });
    }
    return route.fulfill({ json: market(code, 210000) });
  });
  await page.goto('/trade');
  await expect(page.getByLabel('실제 현재가')).toHaveText('182,000원');
  expect(posts.map(p => p.path)).toEqual(['/api/kis/market']);
  await expect(page.locator('main')).not.toContainText('72,800');
  await expect(page.locator('main')).not.toContainText('8,341,000');

  const metrics = page.getByLabel('실제 호가 및 가격제한폭 요약');
  await expect(metrics).toContainText('234,000원');
  await expect(metrics).toContainText('126,000원');
  await expect(metrics).toContainText('100원');
  await expect(metrics).toContainText('52%');
  await expect(metrics.locator('.trade-band-meter')).toHaveCount(1);
  await expect(metrics).toContainText('12,345,678주');
  await expect(metrics).toContainText('전기전자 · 정상 거래');

  const trend = page.getByLabel('선택 구간 일봉 추세 요약');
  await expect(trend).toContainText('선택 구간 수익률');
  await expect(trend).toContainText('최고 182,000원');
  await expect(trend).toContainText('20일 이동평균 (SMA 20)');
  await expect(trend).not.toContainText('표본 부족 (20거래일 미만)');
  await expect(trend).toContainText('60일 이동평균 (SMA 60)');
  await expect(trend).not.toContainText('표본 부족 (60거래일 미만)');

  const chips = page.getByRole('group', { name: '관심종목 빠른 선택' });
  await expect(chips.getByRole('button', { name: /삼성전자/ })).toHaveAttribute('aria-pressed', 'true');
  const nonNumericChip = chips.getByRole('button', { name: /00088K/ });
  await expect(nonNumericChip).toBeDisabled();
  await expect(nonNumericChip).toContainText('숫자 코드만 조회');

  // liquidation 미제공(undefined) 시 '정리매매 미제공' 구분 확인
  await chips.getByRole('button', { name: /SK하이닉스/ }).click();
  await expect(page).toHaveURL(/code=000660/);
  await expect(page.getByLabel('실제 현재가')).toHaveText('210,000원');
  await expect(metrics).toContainText('미제공 · 정리매매 미제공');
  await expect(trend).toContainText('표본 부족 (20거래일 미만)');
  await expect(trend).toContainText('표본 부족 (60거래일 미만)');

  // 무효 가격제한폭(upper=0, lower=0) 시 '계산 불가' 표시 및 게이지 바 미노출 확인
  await chips.getByRole('button', { name: /NAVER/ }).click();
  await expect(page).toHaveURL(/code=035420/);
  await expect(page.getByLabel('실제 현재가')).toHaveText('187,200원');
  await expect(metrics).toContainText('계산 불가');
  await expect(metrics.locator('.trade-band-meter')).toHaveCount(0);
  await expect(metrics).not.toContainText('상단 여유');
  await expect(metrics).not.toContainText('하단 여유');

  const watchToggle = page.getByRole('button', { name: '관심종목 해제', exact: true });
  await watchToggle.click();
  await expect(page.getByRole('button', { name: '관심종목 등록', exact: true })).toBeVisible();
  expect(posts.some(p => p.path === '/api/watchlist')).toBe(true);
  expect(posts.filter(p => p.path === '/api/kis/market').every(p => /^\d{6}$/.test((p.body as { code: string }).code))).toBe(true);
});

test('live trade workspace diagnostic hub renders KIS holdings, paperRisk fallback, links, and fits 320-1440px', async ({ page }) => {
  const state = snapshot();
  state.status.staleAfterMs = 3_600_000;
  state.connection.balance = {
    cash: 5_000_000,
    totalEquity: 7_000_000,
    positions: [{ code: '005930', name: '삼성전자', qty: 10, sellable: 8, average: 185000.5, price: 190300 }],
  };
  state.strategies.push({
    id: 'kis-1', name: 'KIS 모의 삼성 전략', code: '005930', fast: 5, slow: 20, qty: 1,
    active: true, lastSignal: 'hold', lastTick: 0, environment: 'kis-paper',
  });
  state.journal.push({ id: 'j-1', date: new Date().toISOString(), code: '005930', text: '실제 시세 점검 메모' });
  let offline = false;
  await page.route('**/api/state', route => offline ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state }));
  await page.route('**/api/kis/market', route => route.fulfill({ json: market('005930', 190300) }));

  await page.goto('/trade');
  await expect(page.getByLabel('실제 현재가')).toHaveText('190,300원');
  const hub = page.getByLabel('선택 종목 KIS 모의 매매 및 워크스페이스 현황');
  await expect(hub).toContainText('보유 10주 · 주문가능 8주 · 평단 185,000.5원');
  await expect(hub).toContainText('+52,995원');
  await expect(hub).toContainText('긴급정지 꺼짐 (정상)');
  await expect(hub).toContainText('불명·전송 중 미확인');
  await expect(hub).toContainText('저장 1개 · 실행 중 1개');
  await expect(hub).toContainText('기록 1건');
  await expect(hub.getByRole('link', { name: 'KIS 모의 매매·원장 대조 ↗' })).toHaveAttribute('href', '/paper?code=005930');
  await expect(hub.getByRole('link', { name: 'KIS 전략 스튜디오 ↗' })).toHaveAttribute('href', '/strategies?environment=kis-paper');
  await expect(hub.getByRole('link', { name: '일봉 백테스트 ↗' })).toHaveAttribute('href', '/backtest');
  await expect(hub.getByRole('link', { name: '매매일지 기록 ↗' })).toHaveAttribute('href', '/journal');
  await expect(page.getByRole('link', { name: 'KIS 모의 주문 화면' })).toHaveCount(1);

  state.paperRisk = { day: '20261117', baselineEquity: 7_000_000, unresolvedCount: 2, orders: null };
  state.revision++;
  await page.reload();
  await expect(hub).toContainText('불명·전송 중 2건');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `live-${width}`).toBe(true);
  }

  offline = true;
  await page.reload();
  await expect(hub).toContainText('상태 미확인');
  await expect(hub).not.toContainText('불명·전송 중 2건');
});
