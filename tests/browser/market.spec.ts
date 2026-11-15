import { test, expect, type Page } from '@playwright/test';
import { snapshot } from '../snapshot';

const instruments = [
  { code: '00088K', name: '한화우', exchange: 'KOSPI', kind: 'stock' },
  { code: '005930', name: '삼성전자', exchange: 'KOSPI', kind: 'stock' },
  { code: '035420', name: 'NAVER', exchange: 'KOSPI', kind: 'stock' },
  { code: '069500', name: 'KODEX 200', exchange: 'KOSPI', kind: 'etf' },
  { code: '247540', name: '에코프로비엠', exchange: 'KOSDAQ', kind: 'stock', tradingHalted: true },
  ...Array.from({ length: 7 }, (_, i) => ({ code: String(300000 + i), name: `검증 종목 ${i}`, exchange: 'KOSDAQ', kind: 'stock' })),
].map(row => ({ ...row, isin: 'KR7000000000', group: row.kind === 'etf' ? 'EF' : 'ST' }));
const removed = [{ ...instruments[0], code: '999999', name: '이전 종목', removedAt: '2026-11-14T00:00:00.000Z' }];
const master = () => ({ instruments, removed, sources: ['KOSPI', 'KOSDAQ'].map(exchange => ({ exchange, source: 'https://example.test/master', phase: 'ready', observedAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), sha256: 'fixture', count: 6, error: null })) });
const quote = (code: string) => ({ code, price: 70000, change: -1.25, upper: 91000, lower: 49000, tickSize: 100, stopped: false, volume: 123456, sector: '전기전자', liquidation: false, receivedAt: new Date().toISOString() });
async function setup(page: Page, state = snapshot()) {
  const calls: string[] = [];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/data/master', route => route.fulfill({ json: master() }));
  await page.route('**/api/market/quote', async route => {
    const { code } = route.request().postDataJSON(); calls.push(code); await route.fulfill({ json: { quote: quote(code) } });
  });
  await page.route('**/api/watchlist', async route => {
    const { code } = route.request().postDataJSON(); state.watchlist = state.watchlist.includes(code) ? state.watchlist.filter(c => c !== code) : [...state.watchlist, code]; state.revision++;
    await route.fulfill({ json: {} });
  });
  return calls;
}

test('market searches actual master with combined filters, limits quote reads, keeps codes and opens matching details', async ({ page }) => {
  const calls = await setup(page); await page.goto('/market');
  await expect(page.getByText('총 13개 종목', { exact: false })).toBeVisible();
  await expect.poll(() => calls.length).toBe(8); expect(calls).toEqual([...instruments, ...removed].slice(0, 8).map(row => row.code));
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: '이전 종목' })).toContainText('마스터 제외');
  await expect.poll(() => calls.length).toBe(12); expect(calls).not.toContain('999999');
  await page.getByRole('button', { name: 'ETF', exact: true }).click();
  await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('0695');
  const etf = page.getByRole('row').filter({ hasText: 'KODEX 200' }); await expect(etf).toContainText('069500');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'KOSDAQ', exact: true }).click(); await expect(page.getByText('표시할 종목이 없습니다', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '전체', exact: true }).click();
  const search = page.getByRole('textbox', { name: '종목명 또는 코드 검색' }); await search.fill(' 00088k ');
  await expect(page.locator('tbody tr')).toHaveCount(1); await expect(page.locator('tbody')).toContainText('00088K');
  await page.getByRole('button', { name: '한화우 관심 등록', exact: true }).click(); await page.reload();
  await expect(page.getByRole('button', { name: '한화우 관심 해제', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '한화우 상세', exact: true }).click();
  await expect(page.getByRole('region', { name: '종목 상세' })).toBeFocused();
  await expect(page.getByRole('region', { name: '종목 상세' })).toContainText('00088K');
  await expect(page.getByRole('region', { name: '종목 상세' })).toContainText('전기전자');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('empty combined filters and unavailable masters never imply the searched code was delisted', async ({ page }) => {
  await setup(page); await page.goto('/market');
  await page.getByRole('button', { name: 'ETF', exact: true }).click();
  await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('005930');
  await expect(page.getByText('다른 시장 필터에 있는 종목입니다.', { exact: false })).toBeVisible();
  await expect(page.getByText('현재 마스터에 없는 코드입니다.', { exact: false })).toHaveCount(0);
  await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('KODEX2');
  await expect(page.getByText('미등록·상장폐지 여부를 확인하세요.', { exact: false })).toHaveCount(0);
  await page.route('**/api/data/master', route => route.fulfill({ status: 503, body: 'unavailable' })); await page.reload();
  await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('005930');
  await expect(page.getByText('마스터 확인 후 검색 결과를 판단할 수 있습니다.', { exact: false })).toBeVisible();
  await expect(page.getByText('현재 마스터에 없는 코드입니다.', { exact: false })).toHaveCount(0);
});

test('watchlist shares saved master entries with market and returns focus after closing details', async ({ page }) => {
  await setup(page); await page.goto('/market');
  await page.getByRole('button', { name: '한화우 관심 등록', exact: true }).click();
  await page.getByRole('button', { name: '한화우 상세', exact: true }).click();
  await expect(page.getByRole('region', { name: '종목 상세' })).toBeFocused();
  await page.getByRole('button', { name: '상세 닫기', exact: true }).click();
  await expect(page.getByRole('button', { name: '한화우 상세', exact: true })).toBeFocused();
  await page.goto('/watchlist'); await expect(page.getByRole('button', { name: '한화우 관심 해제', exact: true })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '한화우' })).toContainText('수신');
  await expect(page.getByText('마스터 전체 목록은 KIS 수집 단계에서 연결', { exact: false })).toHaveCount(0);
});

test('market distinguishes missing, delayed, halted, liquidation and removed data without fabricated zero prices', async ({ page }) => {
  await setup(page);
  await page.route('**/api/market/quote', async route => {
    const { code } = route.request().postDataJSON();
    if (code === '00088K') { await route.fulfill({ status: 400, json: { error: 'KIS 모의 호출 한도 초과' } }); return; }
    await route.fulfill({ json: { quote: { ...quote(code), ...(code === '005930' ? { receivedAt: new Date(Date.now() - 60_000).toISOString() } : {}), ...(code === '069500' ? { liquidation: true } : {}) } } });
  });
  await page.goto('/market');
  const row = (name: string) => page.getByRole('row').filter({ hasText: name });
  await expect(row('한화우')).toContainText('미수신'); await expect(row('한화우')).toContainText('—'); await expect(row('한화우')).not.toContainText('0.0%');
  await expect(row('삼성전자')).toContainText('지연'); await expect(row('삼성전자')).toContainText('70,000');
  await expect(row('에코프로비엠')).toContainText('거래정지'); await expect(row('KODEX 200')).toContainText('정리매매');
  await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('이전 종목');
  await expect(row('이전 종목')).toContainText('상장폐지 확인 필요');
  await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('123456');
  await expect(page.getByText('현재 마스터에 없는 코드입니다.', { exact: false })).toBeVisible();
  await expect(page.getByText('상장폐지로 단정할 수 없습니다.', { exact: false })).toBeVisible();
});

test('market pauses hidden reads and marks a failed refresh as previous data', async ({ page }) => {
  await page.clock.install(); const calls = await setup(page); await page.goto('/market'); await expect.poll(() => calls.length).toBe(8);
  const search = page.getByRole('textbox', { name: '종목명 또는 코드 검색' }); await search.fill('005930'); await page.clock.runFor(300);
  await expect(page.locator('tbody')).toContainText('삼성전자'); await expect(search).toBeFocused();
  await page.route('**/api/market/quote', route => route.fulfill({ status: 400, json: { error: 'KIS 연결 실패' } }));
  await page.clock.runFor(16_000); await expect(page.locator('tbody')).toContainText('지연 · 갱신 실패'); await expect(page.locator('tbody')).toContainText('70,000');
  await expect(search).toHaveValue('005930'); await expect(search).toBeFocused();
  let hiddenCalls = 0; await page.route('**/api/market/quote', async route => { hiddenCalls++; await route.fulfill({ json: { quote: quote('005930') } }); });
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(60_000); expect(hiddenCalls).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(300); await expect.poll(() => hiddenCalls).toBe(1);
  await page.goto('/dashboard'); const stopped = hiddenCalls; await page.clock.runFor(60_000); expect(hiddenCalls).toBe(stopped);
});

test('market discards an in-flight previous page and rejects a mismatched quote without losing its prior value', async ({ page }) => {
  await setup(page); let release!: () => void, started = false;
  const gate = new Promise<void>(resolve => { release = resolve; }); const calls: string[] = [];
  await page.route('**/api/market/quote', async route => {
    const { code } = route.request().postDataJSON(); calls.push(code);
    if (code === '00088K') { started = true; await gate; }
    await route.fulfill({ json: { quote: quote(code) } }).catch(() => {});
  });
  await page.goto('/market'); await expect.poll(() => started).toBe(true);
  await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('005930');
  await expect(page.locator('tbody')).toContainText('70,000'); release();
  await expect(page.locator('tbody tr')).toHaveCount(1); expect(calls).toEqual(['00088K', '005930']);
  await page.route('**/api/market/quote', route => route.fulfill({ json: { quote: { ...quote('000660'), price: 999999 } } }));
  await page.getByRole('button', { name: '표시 종목 시세 갱신', exact: true }).click();
  await expect(page.locator('tbody')).toContainText('종목코드가 일치하지 않습니다');
  await expect(page.locator('tbody')).toContainText('70,000'); await expect(page.locator('tbody')).not.toContainText('999,999');
});

test('market preserves previous master on refresh failure and provides an empty first-load retry', async ({ page }) => {
  await setup(page);
  await page.route('**/api/data/master/refresh', route => route.fulfill({ json: { ...master(), sources: master().sources.map(source => ({ ...source, phase: 'error', error: '전체 교체 보류' })) } }));
  await page.goto('/market'); await page.getByRole('button', { name: '마스터 갱신', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '마스터' })).toContainText('이전 목록'); await expect(page.locator('tbody')).toContainText('005930');
  await page.route('**/api/data/master', route => route.fulfill({ status: 503, body: 'not json' })); await page.reload();
  await expect(page.getByText('종목 마스터를 불러오지 못했습니다.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '마스터 갱신', exact: true })).toBeEnabled(); await expect(page.locator('tbody tr')).toHaveCount(0);
});


test('watchlist persists shared selections, shows received time and navigates with the exact code without ordering', async ({ page }, testInfo) => {
  const state = snapshot(); state.watchlist = ['00088K', '005930']; const calls = await setup(page, state);
  const orders: string[] = []; page.on('request', request => { if (/\/api\/(kis\/order|orders)$/.test(request.url())) orders.push(request.url()); });
  await page.goto('/watchlist'); await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('header.topbar')).toContainText('공식 마스터 · KIS 모의 시세');
  await expect.poll(() => calls.length).toBe(2); expect(calls).toEqual(['00088K', '005930']);
  const row = page.getByRole('row').filter({ hasText: '한화우' });
  await expect(row).toContainText('수신 완료'); await expect(row).toContainText('수신 ');
  await page.screenshot({ path: testInfo.outputPath('watchlist-desktop.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: testInfo.outputPath('watchlist-mobile.png'), fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.reload(); await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('link', { name: '한화우 KIS 주문 화면', exact: true }).click();
  await expect(page).toHaveURL(/paper\?code=00088K/); await expect(page.getByLabel('KIS 종목코드')).toHaveValue('00088K');
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeDisabled();
  await expect(page.getByText('현재 주문 화면은 숫자 6자리 종목만 지원합니다.', { exact: false })).toBeVisible();
  expect(orders).toEqual([]);
  await page.goto('/watchlist'); await page.getByRole('button', { name: '한화우 관심 해제', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.goto('/market'); await expect(page.getByRole('button', { name: '한화우 관심 등록', exact: true })).toBeVisible();
});

test('watchlist retains the saved list on write failure and offers exploration when empty', async ({ page }) => {
  const state = snapshot(); state.watchlist = ['00088K']; await setup(page, state);
  await page.route('**/api/watchlist', route => route.fulfill({ status: 500, json: { error: '저장 실패' } }));
  await page.goto('/watchlist'); await page.getByRole('button', { name: '한화우 관심 해제', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '관심목록 저장 실패' })).toBeVisible();
  await expect(page.getByRole('button', { name: '한화우 관심 해제', exact: true })).toBeVisible();
  await page.reload(); await expect(page.locator('tbody tr')).toHaveCount(1);
  state.watchlist = []; state.revision++; await page.reload();
  await expect(page.getByText('관심종목이 없습니다', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '시장 탐색에서 추가', exact: true }).click(); await expect(page).toHaveURL(/market/);
});

test('watchlist keeps unknown and removed saved codes visible without quoting them', async ({ page }) => {
  const state = snapshot(); state.watchlist = ['888888', '999999']; const calls = await setup(page, state);
  await page.goto('/watchlist'); await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('row').filter({ hasText: '888888' })).toContainText('마스터 미확인');
  await expect(page.getByRole('row').filter({ hasText: '999999' })).toContainText('마스터 제외');
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: '888888 관심 해제', exact: true }).click(); await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.route('**/api/data/master', route => route.fulfill({ status: 503, body: 'unavailable' })); await page.reload();
  await expect(page.getByRole('row').filter({ hasText: '999999' })).toContainText('마스터 미확인');
  await expect(page.getByText('종목 마스터를 불러오지 못했습니다.', { exact: false })).toBeVisible(); expect(calls).toEqual([]);
});

test('watchlist quotes only the visible page, stops on leave and keeps filters focused while polling', async ({ page }) => {
  const state = snapshot(); state.watchlist = instruments.map(row => row.code); const calls = await setup(page, state);
  await page.goto('/watchlist'); await expect.poll(() => calls.length).toBe(8);
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click(); await expect.poll(() => calls.length).toBe(12);
  await page.clock.install(); const search = page.getByRole('textbox', { name: '종목명 또는 코드 검색' }); await search.fill('00088');
  await page.clock.runFor(400); await expect(page.locator('tbody tr')).toHaveCount(1); await expect(search).toBeFocused();
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(search).toHaveValue('00088'); await expect(search).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('link', { name: '한화우 KIS 주문 화면', exact: true }).click();
  await expect(page).toHaveURL(/paper\?code=00088K/); await expect(page.getByLabel('KIS 종목코드')).toHaveValue('00088K'); const count = calls.length;
  await page.clock.fastForward(20000); expect(calls.length).toBe(count);
});


test('watchlist distinguishes an unsaved master code from a market filter mismatch', async ({ page }) => {
  const state = snapshot(); state.watchlist = ['005930']; await setup(page, state);
  await page.goto('/watchlist'); await page.getByRole('textbox', { name: '종목명 또는 코드 검색' }).fill('00088K');
  await expect(page.getByText('관심목록에 없는 종목입니다.', { exact: false })).toBeVisible();
  await expect(page.getByText('다른 시장 필터에 있는 종목입니다.', { exact: false })).toHaveCount(0);
});
