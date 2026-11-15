import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

test('non-JSON mutation failure shows a fixed message without response text', async ({ page }) => {
  await page.route('**/api/risk/halt', route => route.fulfill({ status: 502, contentType: 'text/html', body: '<html>fixture-secret upstream failure</html>' }));
  await page.goto('/risk');
  await page.getByRole('button', { name: '신규 주문 긴급정지', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('요청을 처리하지 못했습니다. 잠시 후 다시 확인하세요.');
  await expect(page.locator('body')).not.toContainText('fixture-secret');
});

test('a later request with regressed revision is unavailable instead of silently connected', async ({ page }) => {
  await page.clock.install();
  const state = { ...snapshot(), instanceId: 'same-server', revision: 20 };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/trade');
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeEnabled();
  state.revision = 1;
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
  await expect(page.getByText('로컬 서버 연결', { exact: true })).toHaveCount(0);
  await expect(page.getByText('저장 상태가 이전 버전으로 바뀌었습니다. 페이지를 새로고침해 다시 확인하세요.', { exact: true })).toBeVisible();
});

test('a new server accepts a lower revision and closes a confirmation from the old state', async ({ page }) => {
  await page.clock.install();
  const state = { ...snapshot(), revision: 20 };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/trade'); await page.getByRole('button', { name: '매수 주문 확인' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  state.instanceId = 'replacement-server'; state.revision = 1; state.instruments[0].price = 61000;
  const polled = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await polled;
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('.quote strong')).toContainText('61,000');
  await expect(page.getByText('로컬 서버 연결', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('서버가 다시 시작');
});

test('delayed older response never overwrites a newer revision or makes the connection fail', async ({ page }) => {
  await page.clock.install(); let calls = 0;
  const old = snapshot(); old.revision = 19; old.instruments[0].price = 61000;
  const latest = snapshot(); latest.revision = 20; latest.instruments[0].price = 72000;
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', async route => {
    if (++calls === 1) { await gate; await route.fulfill({ json: old }); }
    else await route.fulfill({ json: latest });
  });
  await page.goto('/trade');
  const newer = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await newer;
  await expect(page.locator('.quote strong')).toContainText('72,000');
  const older = page.waitForResponse('**/api/state'); release!(); await older;
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeEnabled();
  await expect(page.locator('.quote strong')).toContainText('72,000');
  await expect(page.getByLabel('로컬 상태', { exact: true })).toContainText('정상');
});

test('local loading, disconnected, ready and stale states are explicit and block mutation', async ({ page }) => {
  await page.clock.install(); let mode = 'loading';
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/state', async route => {
    if (mode === 'loading') await gate;
    if (mode === 'ready') await route.fulfill({ json: snapshot() });
    else await route.fulfill({ status: 503, body: 'fixture-secret' });
  });
  await page.goto('/trade');
  await expect(page.getByLabel('로컬 상태', { exact: true })).toContainText('로딩');
  mode = 'error'; release!();
  await expect(page.getByLabel('로컬 상태', { exact: true })).toContainText('미연결');
  await expect(page.getByRole('button', { name: '매수 주문 확인' })).toBeDisabled();
  mode = 'ready'; await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await expect(page.getByLabel('로컬 상태', { exact: true })).toContainText('정상');
  await page.getByRole('button', { name: '매수 주문 확인' }).click();
  mode = 'error'; const failed = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await failed;
  await expect(page.getByLabel('로컬 상태', { exact: true })).toContainText('오래됨');
  await expect(page.getByLabel('긴급정지 상태', { exact: true })).toContainText('미확인');
  let posts = 0; await page.route('**/api/orders', async route => { posts++; await route.fulfill({ json: {} }); });
  await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('최신 로컬 상태'); expect(posts).toBe(0);
  await expect(page.locator('body')).not.toContainText('fixture-secret');
});

test('KIS partial data keeps last complete money visibly separate from DEMO across navigation', async ({ page }) => {
  await page.clock.install(); const state = snapshot();
  const success = state.status.lastSuccessAt!;
  state.connection = { ...state.connection, configured: true, connected: true, checkedAt: success, message: '전체 조회 성공', balance: { cash: 123456, totalEquity: 123456, positions: [] }, status: { ...state.connection.status, phase: 'ready', observedAt: success, lastSuccessAt: success, complete: true, pages: 2 } };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings'); await expect(page.getByText('123,456원', { exact: true })).toBeVisible();
  state.connection.status = { ...state.connection.status, phase: 'partial', complete: false, pages: 1, error: '다음 페이지 조회 실패' }; state.connection.connected = false;
  const failed = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await failed;
  await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).toContainText('부분실패');
  await expect(page.getByText('123,456원', { exact: true })).toBeVisible();
  await expect(page.getByText('이전 전체 성공값 · 최신 아님', { exact: true })).toBeVisible();
  await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'KIS 모의 매매', exact: true }).click();
  await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).toContainText('부분실패');
  await expect(page.getByText('123,456원', { exact: true })).toBeVisible();
  await expect(page.getByText('당일 주문 없음', { exact: true })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: '대시보드', exact: true }).click();
  await expect(page.locator('.stats-grid').first()).not.toContainText('123,456');
});

test('KIS success becomes stale with time even while local polling succeeds', async ({ page }) => {
  await page.clock.install(); const state = snapshot(); const success = state.status.lastSuccessAt!;
  state.connection = { ...state.connection, configured: true, connected: true, status: { ...state.connection.status, phase: 'ready', complete: true, observedAt: success, lastSuccessAt: success, pages: 1 } };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings'); await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).toContainText('정상');
  state.status.lastSuccessAt = new Date(Date.parse(success) + 61_000).toISOString();
  state.status.observedAt = state.status.lastSuccessAt;
  await page.clock.fastForward(61_000);
  await expect(page.getByLabel('로컬 상태', { exact: true })).toContainText('정상');
  await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).toContainText('오래됨');
  await expect(page.getByText('조회 확인', { exact: true })).toHaveCount(0);
});

test('emergency halt remains visible on every screen including mobile', async ({ page }) => {
  const { screens } = await import('../../src/specs'); const state = snapshot(); state.risk.halted = true;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const screen of screens) {
      await page.goto('/' + screen.id);
      await expect(page.getByLabel('긴급정지 상태', { exact: true })).toContainText('긴급정지 켜짐');
      await expect(page.getByLabel('환경과 데이터 상태')).toContainText('KIS 모의 · REST');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  }
});

test('loss of local transport clears KIS loading and ready instead of claiming broker health', async ({ page }) => {
  const state = snapshot(); let offline = false;
  await page.route('**/api/state', route => offline ? route.fulfill({ status: 503, body: 'fixture-secret' }) : route.fulfill({ json: state }));
  await page.route('**/api/kis/check', async route => { offline = true; await route.abort(); });
  await page.goto('/settings'); await page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' }).click();
  await expect(page.getByLabel('로컬 상태', { exact: true })).toContainText('오래됨');
  await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).toContainText('미연결');
  await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).not.toContainText('로딩');
  offline = false; const success = state.status.lastSuccessAt!;
  state.connection = { ...state.connection, connected: true, status: { ...state.connection.status, phase: 'ready', complete: true, observedAt: success, lastSuccessAt: success } };
  await page.getByRole('button', { name: '다시 확인', exact: true }).click();
  await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).toContainText('정상');
  offline = true;
  await expect(page.getByLabel('KIS 계좌 상태', { exact: true })).toContainText('오래됨', { timeout: 6000 });
});

test('known storage failure remains actionable while arbitrary JSON 5xx text stays hidden', async ({ page }) => {
  let safe = true;
  await page.route('**/api/orders', route => route.fulfill({ status: 500, json: { error: safe ? '요청과 이벤트 저장에 실패했습니다. 저장소 상태를 확인하세요.' : 'fixture-secret' } }));
  await page.goto('/trade'); await page.getByRole('button', { name: '매수 주문 확인' }).click();
  await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('저장소 상태를 확인하세요');
  safe = false; await page.getByRole('button', { name: '데모 주문 접수', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('요청을 처리하지 못했습니다. 잠시 후 다시 확인하세요.');
  await expect(page.locator('body')).not.toContainText('fixture-secret');
});

test('named status groups expose account pagination without adding it to a quote', async ({ page }) => {
  await page.route('**/api/kis/market', route => route.fulfill({ json: { quote: { code: '005930', price: 70000, change: 1, upper: 91000, lower: 49000, tickSize: 100, stopped: false, receivedAt: new Date().toISOString() }, bars: [{ date: '20261112', close: 69000 }, { date: '20261113', close: 70000 }] } }));
  await page.goto('/paper'); await page.getByRole('button', { name: '시세·일봉 조회', exact: true }).click();
  await expect(page.getByRole('group', { name: 'KIS 현재가 상태', exact: true })).not.toContainText('페이지');
  await expect(page.getByRole('group', { name: 'KIS 계좌 상태', exact: true })).toContainText('페이지');
});

test('revision regression also clears the account loading state after a check', async ({ page }) => {
  const state = { ...snapshot(), revision: 20 };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.route('**/api/kis/check', async route => { state.revision = 1; await route.fulfill({ json: {} }); });
  await page.goto('/settings'); await page.getByRole('button', { name: 'KIS 모의 연결·잔고 확인' }).click();
  await expect(page.getByRole('group', { name: '로컬 상태', exact: true })).toContainText('이전 버전');
  await expect(page.getByRole('group', { name: 'KIS 계좌 상태', exact: true })).toContainText('미연결');
});
