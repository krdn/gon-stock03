import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

for (const path of ['/orders', '/alerts', '/data']) {
  test(`${path} 실시간 중단·대조·지연은 동일한 상태이며 조회는 POST를 실행하지 않는다`, async ({ page }) => {
    const now = new Date('2026-11-16T01:00:00Z'); await page.clock.install({ time: now });
    const state = snapshot();
    state.realtime = { phase: 'disconnected', required: true, ordersAllowed: false, message: '실시간 연결끊김 · REST 대조 필요', code: '005930', lastQuoteAt: now.toISOString(), lastNoticeAt: null, reconciledAt: null, price: 70000, fresh: false };
    const posts: string[] = []; page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
    await page.route('**/api/state', route => { const current = new Date().toISOString(); return route.fulfill({ json: { ...state, status: { ...state.status, observedAt: current, lastSuccessAt: current } } }); });
    await page.goto(path);
    if (path === '/orders') await page.getByRole('button', { name: 'KIS 모의 원장', exact: true }).click();
    const panel = page.getByRole('region', { name: 'KIS 실시간 상태' });
    await expect(panel).toContainText('수신 중단'); await expect(panel).toContainText('REST 대조 필요');
    await expect(panel).toContainText('신규 주문 차단');
    state.realtime = { ...state.realtime, phase: 'ready', ordersAllowed: true, fresh: true, message: 'REST 대조 완료', reconciledAt: now.toISOString() };
    const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3000); await polled;
    await expect(panel).toContainText('신규 주문 허용');
    await page.clock.fastForward(3000); await expect(panel).toContainText('신규 주문 차단');
    await page.screenshot({ path: `/tmp/gon19-${path.slice(1)}-desktop.png`, fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `/tmp/gon19-${path.slice(1)}-mobile.png`, fullPage: true, animations: 'disabled' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(posts).toEqual([]);
  });
}

test('모의 화면은 명시적 실시간 시작 실패를 표시하며 자동 연결·대조·주문하지 않는다', async ({ page }) => {
  const posts: string[] = []; page.on('request', req => { if (req.method() === 'POST') posts.push(new URL(req.url()).pathname); });
  await page.goto('/paper');
  const panel = page.getByRole('region', { name: 'KIS 실시간 상태' });
  await expect(panel).toContainText('미연결'); expect(posts).toEqual([]);
  await panel.getByRole('button', { name: '실시간 수신 시작', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('서버 비밀주입과 당일 개장');
  expect(posts).toEqual(['/api/kis/realtime/start']);
  await expect(panel).toContainText('미연결');
  await expect(panel.getByRole('button', { name: '실시간 REST 대조' })).toBeDisabled();
});

test('실시간 차단과 다른 구독 종목은 모의 주문 확인을 비활성화한다', async ({ page }) => {
  const state = snapshot();
  state.realtime = { phase: 'ready', required: true, ordersAllowed: false, message: '시세 지연', code: '005930', lastQuoteAt: new Date().toISOString(), lastNoticeAt: null, reconciledAt: null, price: 70000, fresh: false };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/ledger', route => route.fulfill({ json: { orders: [] } }));
  await page.route('**/api/kis/market', route => route.fulfill({ json: { quote: { code: '005930', price: 70000, change: 0, stopped: false, receivedAt: new Date().toISOString() }, bars: [] } }));
  await page.goto('/paper'); await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeDisabled();
  state.realtime = { ...state.realtime, ordersAllowed: true, fresh: true, code: '000660' };
  await page.reload(); await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true })).toBeDisabled();
  state.realtime = { ...state.realtime, code: '005930', lastQuoteAt: new Date().toISOString() };
  await page.reload(); await page.getByRole('button', { name: '시세·일봉 조회' }).click();
  await page.getByRole('button', { name: 'KIS 모의 주문 확인', exact: true }).click();
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true })).toBeEnabled();
  state.realtime = { ...state.realtime, ordersAllowed: false, fresh: false };
  await expect(page.getByRole('button', { name: 'KIS 모의 주문 전송', exact: true })).toBeDisabled();

});
