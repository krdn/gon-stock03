import { expect, test, type Page } from '@playwright/test';
import { snapshot } from '../snapshot';

const instruments = [
  { code: '069500', name: '예시 지수 ETF', exchange: 'KOSPI', kind: 'etf', isin: 'fixture-etf', group: 'EF' },
  { code: '005930', name: '예시 반도체', exchange: 'KOSPI', kind: 'stock', isin: 'fixture-stock', group: 'ST' },
];
const removed = [{ ...instruments[1], code: '999999', name: '예시 제외', removedAt: '2026-11-10T00:00:00.000Z' }];
async function fixture(page: Page, saved: string[], partial = false) {
  const state = snapshot();
  state.watchlist = saved;
  const at = new Date().toISOString();
  const sources = (partial ? ['KOSPI'] : ['KOSPI', 'KOSDAQ']).map(exchange => ({
    exchange, source: 'https://example.test/fixture', phase: 'ready', observedAt: at, lastSuccessAt: at, sha256: 'fixture', count: 2, error: null,
  }));
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/data/master', route => route.fulfill({ json: { instruments, removed, sources } }));
  await page.route('**/api/market/quote', route => route.fulfill({ status: 400, json: { error: '격리 예시 · 시세 미연결' } }));
  await page.route('**/api/kis/market', route => route.fulfill({ status: 400, json: { error: '격리 예시 · 시세 미연결' } }));
  return state;
}

for (const route of ['/watchlist', '/market']) {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    test(`${route} 상세와 트레이딩의 Back/Forward 및 키보드 복귀 ${viewport.width}`, async ({ page, context }) => {
      await page.setViewportSize(viewport);
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await fixture(page, ['069500', '888888']);
      await page.goto(route);
      const first = page.locator('tbody tr').first();
      await expect(first).toContainText('미수신 · 조회 실패');
      await expect(first).toBeInViewport({ ratio: 0.95 });
      expect(await page.locator('.table-scroll').evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
      const search = page.getByRole('textbox', { name: '종목명 또는 코드 검색' });
      const etf = page.getByRole('button', { name: 'ETF', exact: true });
      const trigger = page.getByRole('button', { name: '예시 지수 ETF 상세' });
      const detail = page.getByRole('region', { name: '종목 상세' });
      await search.pressSequentially('0695');
      await etf.press('Space');
      const listURL = route + '?q=0695&market=ETF';
      const detailURL = listURL + '&detail=069500';
      async function expectList() {
        await expect(page).toHaveURL(listURL);
        await expect(detail).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(search).toHaveValue('0695');
        await expect(etf).toHaveAttribute('aria-pressed', 'true');
      }
      async function expectDetail() {
        await expect(page).toHaveURL(detailURL);
        await expect(detail).toBeFocused();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(detail).toContainText('예시 지수 ETF · 069500');
        await expect(search).toHaveValue('0695');
        await expect(etf).toHaveAttribute('aria-pressed', 'true');
      }
      await trigger.press('Enter');
      await expectDetail();
      if (route === '/watchlist') {
        await detail.getByRole('button', { name: '종목코드 복사' }).press('Enter');
        await expect(detail.getByRole('status')).toContainText('069500');
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('069500');
      }
      await detail.getByRole('link', { name: '트레이딩에서 시세 보기' }).press('Enter');
      await expect(page).toHaveURL('/trade?code=069500');
      await expect(page.getByLabel('실제 시세 종목코드')).toHaveValue('069500');
      await page.goBack();
      await expectDetail();
      await page.goForward();
      await expect(page).toHaveURL('/trade?code=069500');
      await expect(page.getByLabel('실제 시세 종목코드')).toHaveValue('069500');
      await page.goBack();
      await expectDetail();
      await page.reload();
      await expectDetail();
      await detail.press('Escape');
      await expectList();
      await trigger.press('Enter');
      await expect(detail).toBeFocused();
      await page.goBack();
      await expectList();
      await page.goForward();
      await expectDetail();
    });
  }
}

test('페이지를 떠날 때 시장·관심종목 이력 리스너를 해제한다', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium DevTools의 활성 리스너 목록을 측정한다.');
  await fixture(page, ['069500']);
  await page.goto('/trade?code=069500');
  await expect(page.getByLabel('실제 시세 종목코드')).toHaveValue('069500');
  const cdp = await context.newCDPSession(page);
  async function listenerCount() {
    const { result } = await cdp.send('Runtime.evaluate', {
      expression: '(getEventListeners(window).popstate || []).length', includeCommandLineAPI: true, returnByValue: true,
    });
    return result.value as number;
  }
  const routerListeners = await listenerCount();
  for (const route of ['/watchlist', '/market']) {
    await page.locator(`nav a[href="${route}"]`).click();
    await expect(page.getByRole('button', { name: '예시 지수 ETF 상세' })).toBeVisible();
    await expect.poll(listenerCount).toBe(routerListeners + 1);
    await page.goBack();
    await expect(page.getByLabel('실제 시세 종목코드')).toHaveValue('069500');
    await expect.poll(listenerCount).toBe(routerListeners);
  }
  await cdp.detach();
});

test('관심에서 제외·미확인 종목의 검색과 직접 링크를 구분한다', async ({ page }) => {
  await fixture(page, ['888888'], true);
  await page.goto('/watchlist?detail=888888');
  const detail = page.getByRole('region', { name: '종목 상세' });
  await expect(detail).toContainText('마스터 미확인');
  await expect(detail.getByRole('link', { name: '트레이딩에서 시세 보기' })).toHaveCount(0);
  await detail.press('Escape');
  await expect(page.locator('#market-open-888888')).toBeFocused();
  const search = page.getByRole('textbox', { name: '종목명 또는 코드 검색' });
  await search.fill('999999');
  await expect(page.locator('.empty')).toContainText('관심종목으로 추가할 수 없습니다');
  await search.fill('777777');
  await expect(page.locator('.empty')).toContainText('전체 마스터를 확인하지 못했습니다');
  await page.getByRole('button', { name: '검색 조건 지우기' }).press('Space');
  await expect(search).toBeFocused();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.goto('/watchlist?detail=777777');
  await expect(page.getByText('이 목록에서 선택한 상세 종목을 확인하지 못했습니다.', { exact: false })).toBeVisible();
});

test('관심 해제 뒤 다음 행과 마지막 빈 목록에서 키보드를 이어 쓴다', async ({ page }) => {
  const state = await fixture(page, ['069500', '005930']);
  await page.route('**/api/watchlist', route => {
    const { code } = route.request().postDataJSON();
    state.watchlist = state.watchlist.filter(saved => saved !== code);
    state.revision++;
    return route.fulfill({ json: {} });
  });
  await page.goto('/watchlist');
  await page.getByRole('button', { name: '예시 지수 ETF 상세' }).press('Enter');
  await expect(page.getByRole('region', { name: '종목 상세' })).toBeFocused();
  await page.getByRole('button', { name: '예시 지수 ETF 관심 해제' }).press('Space');
  await expect(page).not.toHaveURL(/detail=/);
  await expect(page.getByText('이 목록에서 선택한 상세 종목을 확인하지 못했습니다.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '예시 반도체 상세' })).toBeFocused();
  await page.getByRole('button', { name: '예시 반도체 관심 해제' }).press('Space');
  await expect(page.getByRole('textbox', { name: '종목명 또는 코드 검색' })).toBeFocused();
  await expect(page.getByText('관심종목이 없습니다', { exact: true })).toBeVisible();
});

test('마스터 첫 응답을 기다리는 동안 저장 코드의 분류와 상세를 확정하지 않는다', async ({ page }) => {
  await fixture(page, ['069500']);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/data/master', async route => { await gate; await route.fallback(); });
  try {
    await page.goto('/watchlist?detail=069500');
    await expect(page.getByRole('heading', { name: '종목 마스터를 확인하고 있습니다' })).toBeVisible();
    await expect(page.getByText('저장된 관심종목 1개 · 마스터 확인 중')).toBeVisible();
    await expect(page.getByRole('region', { name: '종목 상세' })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole('region', { name: '종목 상세' })).toBeFocused();
});

test('관심목록이 0개면 마스터 실패·필터와 독립적으로 비어 있음을 알린다', async ({ page }) => {
  await fixture(page, []);
  await page.route('**/api/data/master', route => route.fulfill({ status: 503, body: 'fixture' }));
  await page.goto('/watchlist?market=KOSPI&q=777777');
  await expect(page.getByRole('alert').filter({ hasText: '마스터를 불러오지 못했습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '관심종목이 없습니다' })).toBeVisible();
  await page.getByRole('button', { name: '검색 조건 지우기' }).press('Enter');
  await expect(page.getByRole('textbox', { name: '종목명 또는 코드 검색' })).toBeFocused();
  await expect(page).toHaveURL(/\/watchlist$/);
});
