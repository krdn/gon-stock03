import { expect, test, type Page } from '@playwright/test';
import { snapshot } from '../snapshot';

// Keep browser wall time, elapsed time, and the server's observations independently controllable.
const epoch = Date.UTC(2026, 10, 20, 3);
const iso = (offset = 0) => new Date(epoch + offset).toISOString();
function fixture() {
  const state = snapshot();
  state.startedAt = iso(-60_000);
  state.status.observedAt = state.status.lastSuccessAt = iso();
  return state;
}
const local = (page: Page) => page.getByRole('group', { name: '로컬 상태', exact: true });
const account = (page: Page) => page.getByRole('group', { name: 'KIS 계좌 상태', exact: true });
const save = (page: Page) => page.getByRole('button', { name: '일지 저장' });

async function freezeClock(page: Page, skew = 0) {
  await page.clock.install({ time: epoch + skew - 1000 });
  await page.clock.pauseAt(epoch + skew);
}
async function interceptJournal(page: Page) {
  const posts: string[] = [];
  await page.route('**/api/**', route => {
    if (route.request().method() === 'GET') return route.fallback();
    const path = new URL(route.request().url()).pathname;
    posts.push(path);
    return path === '/api/journal' ? route.fulfill({ json: { message: '예시 접수' } }) : route.abort();
  });
  return posts;
}

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    for (const skew of [0, -120_000, 120_000]) {
      test(`initial wall skew ${skew} and live corrections keep the journal and broker status consistent`, async ({ page }) => {
        await freezeClock(page, skew);
        const state = fixture();
        const posts = await interceptJournal(page);
        await page.route('**/api/state', route => route.fulfill({ json: state }));
        await page.goto('/journal');
        for (const [index, wall] of [skew, 120_000, -120_000].entries()) {
          await page.clock.setSystemTime(epoch + wall);
          await page.clock.runFor(1000);
          await expect(local(page)).toContainText('정상');
          await expect(account(page)).toContainText('미연결');
          await page.getByLabel('매매 메모').fill('시각 편차 예시');
          await save(page).click();
          await expect(page.getByLabel('매매 메모')).toHaveValue('');
          expect(posts).toHaveLength(index + 1);
        }
        expect(posts).toEqual(Array(3).fill('/api/journal'));
      });
    }

    test('already old server values stay expired behind a slow browser wall clock', async ({ page }) => {
      await freezeClock(page, -120_000);
      const state = fixture();
      state.status.lastSuccessAt = iso(-10_000);
      state.connection.connected = true;
      state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: iso(), lastSuccessAt: iso(-60_000) };
      const posts = await interceptJournal(page);
      await page.route('**/api/state', route => route.fulfill({ json: state }));
      await page.goto('/journal'); await expect(local(page)).toContainText('오래됨');
      await expect(account(page)).toContainText('오래됨');
      await expect(save(page)).toBeDisabled();
      await page.getByLabel('매매 메모').fill('이전 값 예시');
      await save(page).evaluate((button: HTMLButtonElement) => button.form!.requestSubmit());
      await expect(page.getByRole('alert')).toContainText('최신 로컬 상태'); expect(posts).toEqual([]);
    });

    test('frozen polls expire exactly at 10s and 60s, including a submit before repaint', async ({ page }) => {
      await freezeClock(page, -120_000);
      const state = fixture();
      state.connection.connected = true;
      state.connection.status = { ...state.connection.status, phase: 'ready', complete: true, observedAt: iso(), lastSuccessAt: iso() };
      const posts = await interceptJournal(page);
      await page.route('**/api/state', route => route.fulfill({ json: state }));
      await page.goto('/journal'); await expect(local(page)).toContainText('정상');
      await page.getByLabel('매매 메모').fill('경계 예시');
      const repeated = page.waitForResponse('**/api/state');
      await page.clock.fastForward(9999); await repeated;
      await expect(save(page)).toBeEnabled();
      // Move the monotonic clock one millisecond inside the event, before any React timer can paint.
      await save(page).evaluate((button: HTMLButtonElement) => {
        const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
        const original = performance.now.bind(performance);
        Object.defineProperty(performance, 'now', { configurable: true, value: () => original() + 1 });
        try { button.form!.requestSubmit(); } finally { if (descriptor) Object.defineProperty(performance, 'now', descriptor); else Reflect.deleteProperty(performance, 'now'); }
      });
      await expect(page.getByRole('alert')).toContainText('최신 로컬 상태');
      expect(posts).toEqual([]);
      await page.clock.runFor(1);
      await expect(local(page)).toContainText('오래됨');
      await expect(save(page)).toBeDisabled();
      const repeatedAgain = page.waitForResponse('**/api/state');
      await page.clock.fastForward(49_999); await repeatedAgain;
      await expect(account(page)).toContainText('정상');
      await page.clock.runFor(1);
      await expect(account(page)).toContainText('오래됨');
      state.instanceId = 'replacement-with-same-timestamps';
      await page.getByRole('button', { name: '다시 확인', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('서버가 다시 시작');
      await expect(local(page)).toContainText('오래됨');
      await expect(account(page)).toContainText('오래됨');
      // New local observation after a long pause cannot revive the same expired broker success.
      state.status.observedAt = state.status.lastSuccessAt = iso(61_000);
      await page.getByRole('button', { name: '다시 확인', exact: true }).click();
      await expect(local(page)).toContainText('정상');
      await expect(account(page)).toContainText('오래됨');
      expect(posts).toEqual([]);
    });
  });
}

test('a delayed first response pays its request duration and a genuinely fresh response recovers', async ({ page }) => {
  await freezeClock(page); const state = fixture();
  state.status.lastSuccessAt = iso(-7_500);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let waiting = true;
  await page.route('**/api/state', async route => {
    if (waiting) await gate;
    return route.fulfill({ json: state });
  });
  const first = page.waitForRequest('**/api/state');
  await page.goto('/journal'); await first;
  await page.clock.runFor(2500);
  release();
  await expect(local(page)).toContainText('오래됨');
  await expect(save(page)).toBeDisabled();
  waiting = false; state.status.observedAt = state.status.lastSuccessAt = iso(2500);
  await page.getByRole('button', { name:'다시 확인', exact:true }).click();
  await expect(save(page)).toBeEnabled();
});

test('returning to a suspended page requires a new observation, including after transport errors', async ({ page }) => {
  await freezeClock(page); const state = fixture();
  const posts = await interceptJournal(page);
  let mode: 'ok' | 'hang' | 'error' = 'ok';
  await page.route('**/api/state', route => {
    if (mode === 'hang') return;
    return mode === 'error' ? route.fulfill({status:503}) : route.fulfill({json:state});
  });
  await page.goto('/journal'); await expect(save(page)).toBeEnabled();
  await page.getByLabel('매매 메모').fill('복귀 예시');
  mode = 'hang';
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}));
    document.querySelector('form')!.requestSubmit();
  });
  await expect(local(page)).toContainText('로딩'); expect(posts).toEqual([]);
  await expect(local(page)).not.toContainText('연결과 서버 버전');
  await page.clock.fastForward(120_000); await expect(save(page)).toBeDisabled();
  for (const responseMode of ['error','ok'] as const) {
    mode = responseMode;
    const reply = page.waitForResponse('**/api/state');
    await page.getByRole('button', {name:'다시 확인',exact:true}).click(); await reply;
    await expect(save(page)).toBeDisabled();
  }
  state.status.observedAt = state.status.lastSuccessAt = iso(120_000);
  await page.getByRole('button', {name:'다시 확인',exact:true}).click();
  await expect(save(page)).toBeEnabled(); expect(posts).toEqual([]);
});

test('partial, invalid, regressed and retired server evidence cannot enable the old journal', async ({ page }) => {
  await freezeClock(page); const state = fixture();
  state.connection.status.phase = 'partial';
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/journal'); await expect(account(page)).toContainText('부분실패');
  state.status.observedAt = null;
  await page.clock.runFor(3000); await expect(save(page)).toBeDisabled();
  state.status.observedAt = iso(-1);
  await page.clock.runFor(3000); await expect(save(page)).toBeDisabled();
  state.status.observedAt = iso(6000); state.status.lastSuccessAt = iso(7000);
  await page.clock.runFor(3000); await expect(save(page)).toBeDisabled();
  state.status.observedAt = state.status.lastSuccessAt = iso(9000); state.status.complete = false;
  await page.clock.runFor(3000); await expect(save(page)).toBeDisabled();
  const oldServer = state.instanceId;
  state.instanceId = 'new-fixture'; state.status.complete = true;
  state.status.observedAt = state.status.lastSuccessAt = iso(12_000);
  await page.clock.runFor(3000); await expect(save(page)).toBeEnabled();
  await expect(page.getByRole('alert')).toContainText('서버가 다시 시작');
  state.instanceId = oldServer;
  await page.clock.runFor(3000); await expect(save(page)).toBeDisabled();
  await expect(account(page)).not.toContainText('정상');
});

test('a current HTTP Date also exposes an already old body on first load', async ({ page }) => {
  await freezeClock(page, -120_000); const state = fixture();
  await page.route('**/api/state', route => route.fulfill({ headers: {Date:new Date(epoch + 10_000).toUTCString()}, json:state }));
  await page.goto('/journal'); await expect(local(page)).toContainText('오래됨');
  await expect(save(page)).toBeDisabled();
});

test('new observations with the same local success do not renew its lifetime', async ({ page }) => {
  await freezeClock(page);
  const state = fixture();
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/journal'); await expect(save(page)).toBeEnabled();
  for (const offset of [3000, 6000, 9000]) {
    state.status.observedAt = iso(offset);
    const poll = page.waitForResponse('**/api/state');
    await page.clock.fastForward(3000); await poll;
  }
  await page.clock.runFor(999); await expect(save(page)).toBeEnabled();
  await page.clock.runFor(1);
  await expect(local(page)).toContainText('오래됨'); await expect(save(page)).toBeDisabled();
});

test('on a hung poll a wall correction cannot preserve a ready state after actual elapsed time', async ({ page }) => {
  await freezeClock(page);
  const state = fixture();
  let silent = false;
  await page.route('**/api/state', route => silent ? undefined : route.fulfill({ json:state }));
  await page.goto('/journal'); await expect(local(page)).toContainText('정상');
  silent = true;
  await page.clock.setSystemTime(epoch - 120_000);
  const hanging = page.waitForRequest('**/api/state');
  await page.clock.fastForward(9999); await hanging;
  await expect(save(page)).toBeEnabled();
  await page.clock.runFor(1); await expect(save(page)).toBeDisabled();
  await expect(local(page)).toContainText('오래됨');
});

test('a replacement with no clock retires the old instance until the new server confirms a time', async ({ page }) => {
  await freezeClock(page);
  const state = fixture();
  const firstServer = state.instanceId;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/journal'); await expect(save(page)).toBeEnabled();
  state.instanceId = 'replacement'; state.status.observedAt = null;
  await page.clock.fastForward(3000); await expect(save(page)).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('서버가 다시 시작');
  state.instanceId = firstServer; state.status.observedAt = state.status.lastSuccessAt = iso(6000);
  await page.clock.fastForward(3000); await expect(save(page)).toBeDisabled();
  state.instanceId = 'replacement'; state.status.observedAt = state.status.lastSuccessAt = iso(9000);
  await page.clock.fastForward(3000); await expect(save(page)).toBeEnabled();
});

test('a future body contradicting the HTTP response time cannot authorize a local action', async ({ page }) => {
  await freezeClock(page, 120_000); const state = fixture();
  state.status.observedAt = state.status.lastSuccessAt = iso(120_000);
  await page.route('**/api/state', route => route.fulfill({ headers: { Date: new Date(epoch).toUTCString() }, json: state }));
  await page.goto('/journal');
  await expect(local(page)).toContainText('오래됨'); await expect(save(page)).toBeDisabled();
});

test('wall corrections and delayed new observations cannot re-enable the same expired authentication', async ({ page }) => {
  await freezeClock(page, 120_000);
  const state = fixture();
  state.connection.authentication = { phase: 'ready', lastSuccessAt: iso(), validUntil: iso(2000), retryAt: null, failure: null };
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/settings');
  const auth = page.getByLabel('KIS 인증 상태', {exact:true});
  await expect(auth).toContainText('토큰 발급됨');
  await page.clock.runFor(2000); await expect(auth).toContainText('만료·갱신 필요');
  await page.clock.setSystemTime(epoch - 120_000);
  state.status.observedAt = state.status.lastSuccessAt = iso(500);
  const refreshed = page.waitForResponse('**/api/state');
  await page.getByRole('button', {name:'서버 상태 새로고침'}).click(); await refreshed;
  await expect(auth).toContainText('만료·갱신 필요');
  await expect(account(page)).toContainText('미연결');
});

test('a missing or regressed KIS success cannot reset the deadline of an earlier balance', async ({ page }) => {
  await freezeClock(page); const state = fixture();
  state.connection.connected = true;
  const status = state.connection.status;
  Object.assign(status, { phase:'ready', complete:true, lastSuccessAt:iso(), observedAt:iso() });
  await page.route('**/api/state', route => route.fulfill({json:state}));
  await page.goto('/journal'); await expect(account(page)).toContainText('정상');
  async function poll(offset: number) {
    state.status.observedAt = state.status.lastSuccessAt = iso(offset);
    const response = page.waitForResponse('**/api/state');
    await page.clock.fastForward(3000); await response;
  }
  status.phase = 'partial'; status.complete = false; status.lastSuccessAt = null;
  await poll(3000); await expect(account(page)).toContainText('부분실패');
  status.phase = 'ready'; status.complete = true; status.lastSuccessAt = iso(-1);
  await poll(6000); await expect(account(page)).toContainText('오래됨');
  status.lastSuccessAt = iso();
  await poll(9000); await expect(account(page)).toContainText('오래됨');
  status.observedAt = status.lastSuccessAt = iso(12_000);
  await poll(12_000); await expect(account(page)).toContainText('정상');
});

test('a valid new local observation can confirm a still-fresh balance after losing the clock', async ({ page }) => {
  await freezeClock(page);
  const state = fixture();
  state.connection.connected = true;
  Object.assign(state.connection.status, { phase:'ready', complete:true, observedAt:iso(), lastSuccessAt:iso() });
  await page.route('**/api/state', route => route.fulfill({json:state}));
  await page.goto('/journal'); await expect(account(page)).toContainText('정상');
  state.status.observedAt = null;
  await page.clock.fastForward(3000); await expect(account(page)).toContainText('오래됨');
  state.status.observedAt = state.status.lastSuccessAt = iso(6000);
  await page.clock.fastForward(3000); await expect(account(page)).toContainText('정상');
  const poll = page.waitForResponse('**/api/state');
  await page.clock.fastForward(53_999); await poll; await expect(account(page)).toContainText('정상');
  await page.clock.runFor(1); await expect(account(page)).toContainText('오래됨');
});

test('a KIS partial failure also invalidates its old success when the local clock is missing', async ({ page }) => {
  await freezeClock(page);
  const state = fixture();
  state.connection.connected = true;
  const status = state.connection.status;
  Object.assign(status, { phase:'ready', complete:true, observedAt:iso(), lastSuccessAt:iso() });
  await page.route('**/api/state', route => route.fulfill({json:state}));
  await page.goto('/journal'); await expect(account(page)).toContainText('정상');
  state.status.observedAt = null; status.phase = 'partial'; status.complete = false;
  await page.clock.fastForward(3000); await expect(account(page)).toContainText('부분실패');
  state.status.observedAt = state.status.lastSuccessAt = iso(6000); status.phase = 'ready'; status.complete = true;
  await page.clock.fastForward(3000); await expect(local(page)).toContainText('정상');
  await expect(account(page)).toContainText('오래됨');
  state.status.observedAt = state.status.lastSuccessAt = status.observedAt = status.lastSuccessAt = iso(9000);
  await page.clock.fastForward(3000); await expect(account(page)).toContainText('정상');
});
