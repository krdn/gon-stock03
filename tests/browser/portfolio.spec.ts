import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

function portfolioState() {
  const state = snapshot(); const now = state.status.lastSuccessAt!;
  state.connection = { ...state.connection, configured: true, connected: true, balance: { cash: 1000, totalEquity: 9999, positions: [
    { code: '005930', name: '삼성전자', qty: 2, average: 100, price: 150 },
    { code: '000660', name: 'SK하이닉스', qty: 4, average: 200, price: 175 },
    { code: '069500', name: 'KODEX 200', qty: 0, average: 100, price: 150 },
  ] }, status: { ...state.connection.status, phase: 'ready', complete: true, pages: 2, observedAt: now, lastSuccessAt: now } };
  return state;
}

test('portfolio separates environments and shows totals, weights, PnL and read-only detail links', async ({ page }) => {
  const state = portfolioState(); let mutations = 0;
  page.on('request', req => { if (req.method() === 'POST') mutations++; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');
  await expect(page.getByRole('button', { name: 'KIS 모의', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const summary = page.getByRole('region', { name: '포트폴리오 요약' });
  await expect(summary).toContainText('2,000원'); await expect(summary).not.toContainText('9,999');
  const details = page.getByText('평가 기준과 자산 배분', { exact: true });
  await details.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText(/KIS 계좌 총평가액.*9,999원/)).toBeVisible();
  await expect(page.getByRole('img', { name: '현금과 투자 자산의 비중' })).toBeVisible();
  await page.keyboard.press('Space');
  const samsung = page.getByRole('row').filter({ has: page.getByRole('link', { name: /삼성전자/ }) });
  await expect(samsung).toContainText('300'); await expect(samsung).toContainText('+100'); await expect(samsung).toContainText('15.0%');
  await expect(page.getByRole('row').filter({ hasText: 'SK하이닉스' })).toContainText('-100');
  await expect(page.getByRole('table')).not.toContainText('KODEX 200');
  await expect(page.getByRole('link', { name: /삼성전자/ })).toHaveAttribute('href', '/paper?code=005930');
  await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
  await expect(summary).not.toContainText('2,000원');
  await expect(page.getByRole('table').getByRole('link', { name: /삼성전자/ })).toHaveAttribute('href', '/trade?mode=demo&code=005930');
  expect(mutations).toBe(0);
});

test('portfolio distinguishes disconnected, loading, partial, stale and recovered snapshots', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); let checks = 0;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let release!: () => void; let gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/kis/check', async route => { checks++; await gate; state.connection = portfolioState().connection; await route.fulfill({ json: { connection: state.connection, message: '잔고 전체 조회' } }); });
  await page.goto('/portfolio');
  await expect(page.getByRole('heading', { name: 'KIS 잔고를 조회해 주세요' })).toBeVisible();
  const common = page.getByLabel('KIS 계좌 상태', { exact: true });
  await expect(common).toContainText('관측 없음');
  await expect(common).toContainText('최종 전체 성공 없음');
  await expect(page.locator('.portfolio-warning')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '연결·설정 확인' })).toBeVisible();
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toHaveCount(0);
  await page.getByRole('button', { name: 'KIS 잔고 새로고침' }).click();
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('로딩');
  await expect(page.getByRole('button', { name: 'KIS 잔고 새로고침' })).toBeDisabled();
  release(); await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('2,000원');
  expect(checks).toBe(1);
  state.connection.status = { ...state.connection.status, phase: 'partial', complete: false, pages: 1, error: '다음 페이지 조회 실패' }; state.connection.connected = false;
  const updated = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await updated;
  await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: false })).toBeVisible();
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('부분실패');
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toHaveAttribute('href', '/settings');
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('2,000원');
  state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, pages: 2, error: null, lastSuccessAt: new Date(Date.now() - 120000).toISOString() };
  const stale = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await stale;
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('오래됨');
  gate = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole('button', { name: 'KIS 잔고 새로고침' }).click();
  await expect(page.locator('.portfolio-warning')).toContainText('KIS 잔고 새로고침 중');
  await expect(page.locator('.portfolio-warning')).toContainText('이전 전체 성공값');
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toHaveCount(0);
  release();
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('정상');
  await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: false })).toHaveCount(0);
  expect(checks).toBe(2);
});

test('portfolio missing price and zero-asset states never show invented money or NaN percentages', async ({ page }) => {
  await page.clock.install(); const state = portfolioState(); state.connection.balance!.positions[0].price = null;
  await page.route('**/api/state', route => route.fulfill({ json: state })); await page.goto('/portfolio');
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('평가 불가');
  await expect(page.getByText(/현재가 누락 1종목/)).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '삼성전자' })).toContainText('산출 불가');
  await expect(page.locator('body')).not.toContainText('NaN'); await expect(page.locator('body')).not.toContainText('Infinity');
  await page.getByRole('navigation').getByRole('link', { name: '연결·설정', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: '삼성전자' })).toContainText('평가 불가');
  state.connection.balance = { cash: 0, totalEquity: 0, positions: [] };
  await page.getByRole('navigation').getByRole('link', { name: '포트폴리오', exact: true }).click();
  const updated = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await updated;
  await expect(page.getByText('총자산 0원 · 비중을 산출하지 않습니다.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '보유종목 없음' })).toBeVisible();
  await expect(page.locator('svg circle[stroke-dasharray]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('NaN');
  state.cash = 0; state.positions = []; state.revision++;
  const demo = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await demo;
  await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
  await expect(page.getByText('총자산 0원 · 비중을 산출하지 않습니다.', { exact: true })).toBeVisible();
});

test('portfolio detail navigation is environment-specific and layouts stay usable at mobile width', async ({ page }) => {
  const state = portfolioState(); const errors: string[] = []; let posts = 0;
  page.on('pageerror', error => errors.push(error.message)); page.on('request', req => { if (req.method() === 'POST') posts++; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');
  await expect(page.locator('.topbar')).toContainText('DEMO / KIS 모의');
  await page.getByRole('link', { name: /삼성전자/ }).click(); await expect(page).toHaveURL(/\/paper\?code=005930/);
  await expect(page.getByLabel('KIS 종목코드', { exact: true })).toHaveValue('005930'); expect(posts).toBe(0);
  await page.goto('/portfolio'); await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'KIS 잔고 새로고침' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect.poll(() => page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/portfolio-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 }); await page.screenshot({ path: 'test-results/portfolio-desktop.png', fullPage: true });
  expect(errors).toEqual([]); expect(posts).toBe(0);
});

test('portfolio keeps fractional average purchase prices visible so displayed PnL can be checked', async ({ page }) => {
  const state = portfolioState();
  state.connection.balance!.positions = [{ code: '005930', name: '삼성전자', qty: 2, average: 100.5, price: 150 }];
  await page.route('**/api/state', route => route.fulfill({ json: state })); await page.goto('/portfolio');
  const row = page.getByRole('row').filter({ hasText: '삼성전자' });
  await expect(row.getByRole('cell', { name: '150원', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '100.5원', exact: true })).toBeVisible();
  await expect(row.getByRole('cell', { name: '+99원', exact: true })).toBeVisible();
});

test('DEMO selection, stock destination and history survive keyboard navigation and reload', async ({ page }) => {
  const state = portfolioState();
  const mutations: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') mutations.push(req.url()); });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/portfolio?context=account');
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toContainText('2,000원');
  const demo = page.getByRole('button', { name: '로컬 DEMO', exact: true });
  await demo.focus(); await page.keyboard.press('Space');
  await expect(page).toHaveURL(/context=account&environment=demo/);
  await page.reload(); await expect(demo).toHaveAttribute('aria-pressed', 'true');
  const stock = page.getByRole('table').getByRole('link', { name: /삼성전자/ });
  await stock.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'DEMO 연습' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/mode=demo&code=005930/);
  await page.goBack(); await expect(demo).toHaveAttribute('aria-pressed', 'true');
  await page.goBack(); await expect(page.getByRole('button', { name: 'KIS 모의', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(mutations).toEqual([]);
});

test('DEMO first read failure withholds fixture money, later failure retains the confirmed balance', async ({ page }) => {
  const state = portfolioState();
  await page.clock.install();
  let fail = true;
  await page.route('**/api/state', route => fail ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: state }));
  await page.goto('/portfolio?environment=demo');
  const summary = page.getByRole('region', { name: '포트폴리오 요약' });
  await expect(page.getByRole('heading', { name: 'DEMO 계좌 미확인' })).toBeVisible();
  await expect(summary).toHaveCount(0);
  await expect(page.getByLabel('포트폴리오 조회 상태', { exact: true })).toContainText('로컬 확인 없음');
  await page.getByRole('button', { name: 'KIS 모의', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'KIS 계좌 미확인' })).toBeVisible();
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'KIS 잔고 새로고침' })).toBeDisabled();
  await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
  fail = false;
  await page.clock.fastForward(3500);
  await expect(summary).toContainText(state.cash.toLocaleString('ko-KR') + '원');
  fail = true;
  await page.clock.fastForward(3500);
  await expect(page.getByText('이전 DEMO 확인값 · 최신 아님', { exact: false })).toBeVisible();
  await expect(summary).toContainText(state.cash.toLocaleString('ko-KR') + '원');
});

for (const timezoneId of ['UTC', 'Asia/Seoul']) {
  test.describe('계좌 기준 시각 ' + timezoneId, () => {
    test.use({ timezoneId });
    test('balance timestamp is KST on both portfolio and dashboard', async ({ page }) => {
      const at = '2026-11-20T01:00:00Z';
      const state = portfolioState();
      await page.clock.setFixedTime(new Date(at));
      state.status.observedAt = state.status.lastSuccessAt = at;
      state.connection.status.lastSuccessAt = at;
      state.connection.status.observedAt = '2026-11-20T01:01:00Z';
      state.connection.status.phase = 'partial';
      state.connection.status.complete = false;
      await page.route('**/api/state', route => route.fulfill({ json: state }));
      await page.goto('/portfolio');
      const common = page.getByLabel('KIS 계좌 상태', { exact: true });
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await expect(common.getByText(/^관측 /)).toContainText('2026-11-20 10:01:00 KST');
        await expect(common.getByText(/^최종 전체 성공 /)).toContainText('2026-11-20 10:00:00 KST');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      }
      const selected = page.getByLabel('포트폴리오 조회 상태', { exact: true });
      await expect(selected).toContainText('2026-11-20 10:00:00 KST');
      await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: false })).toBeVisible();
      await expect(page.locator('.portfolio-warning')).toContainText('2026-11-20 10:01:00 KST');
      const cause = page.getByRole('link', { name: '연결 원인 확인' });
      await cause.focus(); await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/settings$/); await page.goBack();
      await expect(selected).toContainText('부분실패');
      await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
      await expect(selected).toContainText('2026-11-20 10:00:00 KST');
      await page.goto('/orders?view=history');
      await expect(common.getByText(/^관측 /)).toBeVisible();
      await expect(common.getByText(/^관측 /)).toContainText('2026-11-20 10:01:00 KST');
      await expect(common.getByText(/^최종 전체 성공 /)).toContainText('2026-11-20 10:00:00 KST');
      await page.goto('/dashboard');
      await expect(page.getByLabel('KIS 계좌 요약').getByText(/잔고 최종 전체 성공/)).toContainText('2026-11-20 10:00:00 KST');
    });
  });
}

test('partial first read has a cause and no money, and sub-won losses display neutral zero', async ({ page }) => {
  const state = portfolioState();
  const balance = state.connection.balance!;
  delete state.connection.balance;
  state.connection.status = { ...state.connection.status, phase: 'partial', complete: false, lastSuccessAt: null };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');
  await expect(page.locator('.portfolio-warning')).toContainText('전체 조회 미완료 · 확인된 금액 없음');
  await expect(page.getByRole('heading', { name: 'KIS 잔고 전체 조회 미완료' })).toBeVisible();
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toBeVisible();
  await expect(page.getByRole('region', { name: '포트폴리오 요약' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  balance.cash = 123456789012345;
  balance.positions = [{ code: '005930', name: '삼성전자', qty: 1200, price: 100, average: 100.0001 }];
  state.connection.balance = balance;
  state.connection.status = portfolioState().connection.status;
  await page.reload();
  const row = page.getByRole('row').filter({ hasText: '삼성전자' });
  await expect(row).toContainText('1,200주');
  await expect(page.getByText('123,456,789,012,345원', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const pnl = row.getByRole('cell', { name: '0원', exact: true });
  await expect(pnl).toBeVisible();
  await expect(pnl).not.toHaveClass(/up|down/);
  await expect(page.getByRole('region', { name: '포트폴리오 요약' }).getByText('0원', { exact: true })).toBeVisible();
});

test('initial KIS view names the local server read while the response is pending', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', async route => { await gate; await route.fulfill({ json: snapshot() }); });
  await page.goto('/portfolio');
  await expect(page.locator('.portfolio-warning')).toContainText('로컬 서버에서 계좌 상태 확인 중');
  await expect(page.getByRole('link', { name: '연결 원인 확인' })).toHaveCount(0);
  release();
  await expect(page.getByRole('heading', { name: 'KIS 잔고를 조회해 주세요' })).toBeVisible();
  await expect(page.locator('.portfolio-warning')).toHaveCount(0);
});

test('portfolio 4-tab WAI-ARIA help panel supports keyboard navigation and returns focus on close', async ({ page }) => {
  const state = portfolioState();
  let mutations = 0;
  page.on('request', req => { if (req.method() === 'POST') mutations++; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');

  const toggle = page.getByRole('button', { name: '사용방법 도움말', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: '포트폴리오 사용방법 도움말' })).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByRole('region', { name: '포트폴리오 사용방법 도움말' });
  await expect(panel).toBeVisible();
  const controlsId = await toggle.getAttribute('aria-controls');
  expect(controlsId).toBeTruthy();
  await expect(panel).toHaveAttribute('id', controlsId!);

  // 토글 버튼에서 Tab 키로 도움말 패널 내부(닫기 -> 첫 번째 탭)로 자연 진입
  await toggle.focus();
  await page.keyboard.press('Tab');
  const closeBtn = panel.getByRole('button', { name: '닫기', exact: true });
  await expect(closeBtn).toBeFocused();
  await page.keyboard.press('Tab');
  const tabWorkflow = panel.getByRole('tab', { name: '처음부터 따라하기', exact: true });
  const tabMath = panel.getByRole('tab', { name: '평가·손익·비중 산식 사전', exact: true });
  const tabSafety = panel.getByRole('tab', { name: '데이터 완전성·안전장치 사전', exact: true });
  const tabFaq = panel.getByRole('tab', { name: '환경별 차이·장전 계획·FAQ', exact: true });
  await expect(tabWorkflow).toBeFocused();
  await expect(tabWorkflow).toHaveAttribute('aria-selected', 'true');

  // ArrowRight 순환 및 ArrowLeft/Home/End 키보드 탐색
  await page.keyboard.press('ArrowRight');
  await expect(tabMath).toBeFocused();
  await expect(tabMath).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('tabpanel')).toContainText('totalEquity');

  await page.keyboard.press('ArrowRight');
  await expect(tabSafety).toBeFocused();
  await expect(panel.getByRole('tabpanel')).toContainText('Zero-Mutation Read');

  await page.keyboard.press('ArrowRight');
  await expect(tabFaq).toBeFocused();
  await expect(panel.getByRole('tabpanel')).toContainText('/trade?mode=demo');

  await page.keyboard.press('ArrowRight');
  await expect(tabWorkflow).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(tabFaq).toBeFocused();

  await page.keyboard.press('Home');
  await expect(tabWorkflow).toBeFocused();

  await page.keyboard.press('End');
  await expect(tabFaq).toBeFocused();

  // 닫기 클릭 시 패널 숨김 및 토글 버튼으로 포커스 복귀
  await closeBtn.click();
  await expect(panel).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  expect(mutations).toBe(0);
});

test('portfolio formats return rates and up-to-4-decimal average prices without losing large integer precision', async ({ page }) => {
  const state = portfolioState();
  state.connection.balance!.positions = [
    { code: '005930', name: '삼성전자', qty: 2, average: 100.5, price: 150 },
    { code: '000660', name: 'SK하이닉스', qty: 4, average: 200, price: 175 },
    { code: '035420', name: 'NAVER', qty: 3, average: 34694.813913751714, price: 35000 },
    { code: '005380', name: '현대차', qty: 1200, average: 100.0001, price: 100 },
    { code: '051910', name: 'LG화학', qty: 1, average: 123456789012345, price: 123456789012345 },
    { code: '035720', name: '카카오', qty: 2, average: 50000, price: null },
  ];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');

  const samsung = page.getByRole('row').filter({ hasText: '삼성전자' });
  await expect(samsung.getByRole('cell', { name: '100.5원', exact: true })).toBeVisible();
  const samsungRate = samsung.getByRole('cell', { name: '+49.25%', exact: true });
  await expect(samsungRate).toBeVisible();
  await expect(samsungRate).toHaveClass(/up/);

  const skh = page.getByRole('row').filter({ hasText: 'SK하이닉스' });
  const skhRate = skh.getByRole('cell', { name: '-12.50%', exact: true });
  await expect(skhRate).toBeVisible();
  await expect(skhRate).toHaveClass(/down/);

  const naver = page.getByRole('row').filter({ hasText: 'NAVER' });
  await expect(naver.getByRole('cell', { name: '34,694.8139원', exact: true })).toBeVisible();
  await expect(naver.getByRole('cell', { name: '+0.88%', exact: true })).toBeVisible();

  const hyundai = page.getByRole('row').filter({ hasText: '현대차' });
  await expect(hyundai.getByRole('cell', { name: '100.0001원', exact: true })).toBeVisible();
  const hyundaiRate = hyundai.getByRole('cell', { name: '0.00%', exact: true });
  await expect(hyundaiRate).toBeVisible();
  await expect(hyundaiRate).not.toHaveClass(/up|down/);

  const lgchem = page.getByRole('row').filter({ hasText: 'LG화학' });
  await expect(lgchem.getByRole('cell', { name: '123,456,789,012,345원', exact: true }).first()).toBeVisible();

  const kakao = page.getByRole('row').filter({ hasText: '카카오' });
  await expect(kakao.getByRole('cell', { name: '평가 불가', exact: true })).toHaveCount(4);
  await expect(page.locator('body')).not.toContainText('NaN');
  await expect(page.locator('body')).not.toContainText('Infinity');
});

test('portfolio supports holdings search, PnL filters, multi-criteria sort with nulls last, and filter reset', async ({ page }) => {
  const state = portfolioState();
  state.connection.balance!.positions = [
    { code: '005930', name: '삼성전자', qty: 2, average: 100, price: 150 },
    { code: '000660', name: 'SK하이닉스', qty: 4, average: 200, price: 175 },
    { code: '035420', name: 'NAVER', qty: 1, average: 1000, price: 1000 },
    { code: '035720', name: '카카오', qty: 2, average: 500, price: null },
  ];
  let mutations = 0;
  page.on('request', req => { if (req.method() === 'POST') mutations++; });
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');

  const controls = page.getByRole('region', { name: '보유종목 검색 및 정렬 제어' });
  const search = controls.getByRole('searchbox', { name: '보유종목 검색' });
  const sort = controls.getByRole('combobox', { name: '보유종목 정렬' });
  const tbodyRows = page.locator('tbody tr');

  await expect(tbodyRows).toHaveCount(4);

  // 검색: 코드 및 종목명
  await search.fill('000660');
  await expect(tbodyRows).toHaveCount(1);
  await expect(tbodyRows.first()).toContainText('SK하이닉스');
  await expect(controls).toContainText('표시 1종목 / 전체 4종목');
  await search.fill('');

  // 손익 상태 필터
  await controls.getByRole('button', { name: '수익 종목', exact: true }).click();
  await expect(tbodyRows).toHaveCount(1);
  await expect(tbodyRows.first()).toContainText('삼성전자');

  await controls.getByRole('button', { name: '손실 종목', exact: true }).click();
  await expect(tbodyRows).toHaveCount(1);
  await expect(tbodyRows.first()).toContainText('SK하이닉스');

  await controls.getByRole('button', { name: '보합·평가불가', exact: true }).click();
  await expect(tbodyRows).toHaveCount(2);
  await expect(tbodyRows.nth(0)).toContainText('NAVER');
  await expect(tbodyRows.nth(1)).toContainText('카카오');

  await controls.getByRole('button', { name: '전체', exact: true }).click();
  await expect(tbodyRows).toHaveCount(4);

  // 정렬: 평가액 높은 순 (NAVER 1000 -> SK하이닉스 700 -> 삼성전자 300 -> 카카오 null 맨 뒤)
  await sort.selectOption('value-desc');
  await expect(tbodyRows.nth(0)).toContainText('NAVER');
  await expect(tbodyRows.nth(1)).toContainText('SK하이닉스');
  await expect(tbodyRows.nth(2)).toContainText('삼성전자');
  await expect(tbodyRows.nth(3)).toContainText('카카오');

  // 정렬: 수익률 높은 순 (삼성전자 +50% -> NAVER 0% -> SK하이닉스 -12.5% -> 카카오 null 맨 뒤)
  await sort.selectOption('return-desc');
  await expect(tbodyRows.nth(0)).toContainText('삼성전자');
  await expect(tbodyRows.nth(1)).toContainText('NAVER');
  await expect(tbodyRows.nth(2)).toContainText('SK하이닉스');
  await expect(tbodyRows.nth(3)).toContainText('카카오');

  // 빈 검색 결과 및 조건 지우기 -> 검색창 포커스 복귀
  await search.fill('존재하지않는종목');
  await expect(page.getByRole('heading', { name: '조건에 맞는 보유종목이 없습니다' })).toBeVisible();
  await page.getByRole('button', { name: '조건 지우기', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(sort).toHaveValue('default');
  await expect(tbodyRows).toHaveCount(4);
  await expect(tbodyRows.nth(0)).toContainText('삼성전자');
  expect(mutations).toBe(0);
});

test('portfolio renders allocation bar, 3-card diagnostic hub for KIS and DEMO, and zero overflow on 390px and 320px', async ({ page }) => {
  const state = portfolioState();
  const now = state.status.lastSuccessAt!;
  state.connection.balance!.positions = [
    { code: '005930', name: '삼성전자', qty: 2, sellable: 1, average: 100, price: 150 },
    { code: '000660', name: 'SK하이닉스', qty: 4, average: 200, price: 175 },
  ];
  delete state.paperRisk;
  // DEMO에 미체결 매수·매도 예약 및 일일 손실 한도 도달 시나리오 구성
  state.orders = [
    { id: 'ord-buy-1', code: '005930', side: 'buy', qty: 2, price: 50000, status: 'pending', createdAt: now, source: 'manual', fee: 0, requestId: 'req-buy-1' },
    { id: 'ord-sell-1', code: '005930', side: 'sell', qty: 5, price: 80000, status: 'pending', createdAt: now, source: 'manual', fee: 0, requestId: 'req-sell-1' },
  ];
  state.startingEquity = 20_000_000;
  state.risk.dailyLoss = 300_000;

  let mutations = 0;
  const errors: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') mutations++; });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/portfolio');

  const hub = page.getByRole('region', { name: '포트폴리오 분석 및 위험·배분 진단 허브' });
  await expect(hub).toBeVisible();

  // KIS 모의 자산 구성 비율 바 (순수 HTML div, svg 미사용, 종목명 링크 없음)
  const allocBar = hub.getByRole('region', { name: '자산 구성 비율 바' });
  await expect(allocBar).toBeVisible();
  await expect(allocBar.locator('svg')).toHaveCount(0);
  await expect(allocBar.locator('a')).toHaveCount(0);
  await expect(allocBar).toContainText('현금 50.0%');
  await expect(allocBar).toContainText('삼성전자 15.0%');
  await expect(allocBar).toContainText('SK하이닉스 35.0%');

  // KIS 모의 3카드 진단 허브: paperRisk 미제공 시 허위 0건 금지 + 일부 sellable 정직 표기
  await expect(hub).toContainText('수익 1종목 · 손실 1종목 · 보합·미평가 0종목');
  await expect(hub).toContainText('삼성전자 (+100원) · SK하이닉스 (-100원)');
  await expect(hub).toContainText('최대 SK하이닉스 (35.0%) · 상위 3종목 합산 50.0%');
  await expect(hub).toContainText('미체결 미확인');
  await expect(hub).toContainText('불명·전송 중 미확인');
  await expect(hub).toContainText('총 보유 6주 · 주문가능 확인 1주 (1종목 미확인)');
  await expect(hub.getByRole('link', { name: 'KIS 모의 매매·대조', exact: true })).toHaveAttribute('href', '/paper');
  await expect(hub.getByRole('link', { name: 'KIS 모의 원장', exact: true })).toHaveAttribute('href', '/orders?view=kis');
  await expect(hub.getByRole('link', { name: 'KIS 전략 스튜디오', exact: true })).toHaveAttribute('href', '/strategies?environment=kis-paper');
  await expect(hub.getByRole('link', { name: 'KIS 위험관리', exact: true })).toHaveAttribute('href', '/risk?env=kis');

  // 로컬 DEMO 전환: 예약 제외 가용, 매도 예약 수량, 일일 손실 한도 도달(정상 오표시 금지)
  await page.getByRole('button', { name: '로컬 DEMO', exact: true }).click();
  await expect(hub).toContainText('미체결 매수 예약 100,015원');
  await expect(hub).toContainText('예약 제외 가용');
  await expect(hub).toContainText('매도 예약 5주');
  await expect(hub).toContainText('일일 손실 한도 도달 (신규 주문 정지)');
  await expect(hub).not.toContainText('긴급정지 꺼짐 (정상)');
  await expect(hub.getByRole('link', { name: 'DEMO 연습 주문', exact: true })).toHaveAttribute('href', '/trade?mode=demo');
  await expect(hub.getByRole('link', { name: 'DEMO 주문 원장', exact: true })).toHaveAttribute('href', '/orders?view=demo');
  await expect(hub.getByRole('link', { name: 'DEMO 전략 스튜디오', exact: true })).toHaveAttribute('href', '/strategies?environment=demo');
  await expect(hub.getByRole('link', { name: 'DEMO 위험관리', exact: true })).toHaveAttribute('href', '/risk');

  // 390px 및 320px 뷰포트(도움말 열림 포함) 가로 넘침 0px 검증
  await page.getByRole('button', { name: '사용방법 도움말', exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  // 현재가 누락 시 자산 구성 비율 바 미표시 및 평가 불가 표기
  state.connection.balance!.positions[0].price = null;
  await page.goto('/portfolio');
  await expect(hub.getByRole('region', { name: '자산 구성 비율 바' })).toHaveCount(0);
  await expect(hub).toContainText('평가 불가 (현재가 누락)');

  expect(mutations).toBe(0);
  expect(errors).toEqual([]);
});
