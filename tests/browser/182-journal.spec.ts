import { expect, test } from '@playwright/test';
import { snapshot } from '../snapshot';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`journal saves by keyboard and restores the private search on this visit at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = snapshot();
    const posts: string[] = [];
    page.on('request', req => { if (req.method() === 'POST') posts.push(new URL(req.url()).pathname); });
    await page.route('**/api/state', route => route.fulfill({ json: state }));
    await page.route('**/api/journal', route => {
      const { code, text } = route.request().postDataJSON();
      state.journal.unshift({ id: 'journal-example', date: '2026-11-20T01:30:00Z', code, text });
      return route.fulfill({ json: {} });
    });

    await page.goto('/journal');
    const stock = page.getByRole('combobox', { name: '종목' });
    const memo = page.getByRole('textbox', { name: '매매 메모' });
    const save = page.getByRole('button', { name: '일지 저장' });
    const search = page.getByRole('textbox', { name: '일지 검색' });
    await expect(page.getByText('기록이 쌓이면 원칙이 보입니다')).toBeVisible();
    await expect(save).toBeInViewport({ ratio: 1 });
    await stock.focus(); await page.keyboard.press('ArrowDown'); await expect(stock).toHaveValue('000660');
    await page.keyboard.press('Tab'); await expect(memo).toBeFocused();
    await memo.fill('예시 메모 · 분할 진입');
    await page.keyboard.press('Tab'); await expect(save).toBeFocused(); await page.keyboard.press('Enter');
    const row = page.locator('.journal-entry');
    await expect(row).toHaveText(/SK하이닉스.*000660.*분할 진입/);
    for (const term of ['분할', '000660', 'sk하이닉스', '일치하지 않는 내용']) {
      await search.fill(term);
      await expect(row).toHaveCount(term === '일치하지 않는 내용' ? 0 : 1);
    }
    await expect(page.getByText('검색 결과가 없습니다', { exact: true })).toBeVisible();
    await expect(page.locator('.journal-source')).toContainText('검색 0건 / 전체 1건');
    await page.reload(); await expect(search).toHaveValue('일치하지 않는 내용');
    await page.getByRole('link', { name: '화면 설계', exact: true }).click();
    await expect(page).toHaveURL(/\/design\?screen=journal$/);
    await page.goBack(); await expect(page).toHaveURL(/\/journal$/);
    await expect(search).toHaveValue('일치하지 않는 내용');
    const clear = page.getByRole('button', { name: '검색 지우기' });
    await clear.focus(); await page.keyboard.press('Enter');
    await expect(search).toBeFocused(); await expect(row).toHaveCount(1);
    if (viewport.width === 390) {
      await page.getByRole('button', { name: '메모 작성' }).focus();
      await page.keyboard.press('Enter'); await expect(stock).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(posts).toEqual(['/api/journal']);
  });
}

test('journal distinguishes loading, unavailable and incomplete records from a confirmed empty list', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const state = snapshot();
  const previous = new Date(now - state.status.staleAfterMs - 1).toISOString();
  state.status.observedAt = state.status.lastSuccessAt = previous;
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(new URL(req.url()).pathname); });
  let release!: () => void;
  const loading = new Promise<void>(resolve => { release = resolve; });
  let failed = true;
  await page.route('**/api/state', async route => {
    await loading;
    return failed ? route.fulfill({ status: 503 }) : route.fulfill({ json: state });
  });
  await page.goto('/journal');
  const save = page.getByRole('button', { name: '일지 저장' });
  await expect(page.getByText('저장한 기록을 불러오는 중입니다.')).toBeVisible();
  await expect(page.getByText('기록이 쌓이면 원칙이 보입니다')).toHaveCount(0);
  release();
  await expect(page.getByText('저장한 기록을 확인하지 못했습니다.')).toBeVisible();
  await expect(save).toBeDisabled();
  failed = false; state.status.phase = 'partial'; state.status.complete = false;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByText('전체 기록을 확인하지 못했습니다. 받은 기록만 표시합니다.')).toBeVisible();
  await expect(page.locator('.journal-source')).not.toContainText('0건');
  await expect(save).toBeDisabled();
  // Replaying the same observation cannot turn an expired success into a new one.
  state.status.phase = 'ready'; state.status.complete = true;
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('group', { name: '로컬 상태', exact: true })).toContainText('오래됨');
  await expect(save).toBeDisabled();
  const memo = page.getByRole('textbox', { name: '매매 메모' });
  await memo.fill('연결이 일시 중단된 동안의 초안');
  await save.evaluate((button: HTMLButtonElement) => button.form!.requestSubmit());
  await expect(page.getByRole('alert')).toContainText('최신 로컬 상태');
  await expect(memo).toHaveValue('연결이 일시 중단된 동안의 초안'); expect(posts).toEqual([]);

  state.status.observedAt = state.status.lastSuccessAt = new Date(now).toISOString();
  await page.getByRole('button', { name: '로컬 상태 확인' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('기록이 쌓이면 원칙이 보입니다')).toBeVisible();
  await expect(save).toBeEnabled();
  await expect(memo).toHaveValue('연결이 일시 중단된 동안의 초안');
  failed = true;
  const response = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await response;
  await expect(page.getByText('마지막으로 받은 기록입니다. 최신 목록을 확인해야 합니다.')).toBeVisible();
  await expect(save).toBeDisabled(); await expect(memo).toHaveValue('연결이 일시 중단된 동안의 초안');
  await expect(page.getByText('기록이 쌓이면 원칙이 보입니다')).toHaveCount(0);
});

test('journal retains an edited draft on a lost reply and checks the full list without a second write', async ({ page }) => {
  const state = snapshot();
  state.journal = [{ id: 'previous', code: '005930', date: '2026-11-20T00:00:00Z', text: '이전 예시' }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const writes: string[] = [];
  await page.route('**/api/journal', async route => {
    const { code, text } = route.request().postDataJSON();
    writes.push(text);
    await gate;
    state.journal.unshift({ id: 'ack-lost', code, text, date: '2026-11-20T01:30:00Z' });
    return route.abort();
  });
  await page.goto('/journal');
  const memo = page.getByRole('textbox', { name: '매매 메모' });
  await page.getByLabel('일지 검색').fill('검색 밖');
  await memo.fill('첫 번째 메모');
  await page.getByRole('button', { name: '일지 저장' }).click();
  try {
    await expect.poll(() => writes.length).toBe(1);
    await memo.fill('응답 전에 수정한 메모');
  } finally { release(); }
  await expect(page.locator('.journal-feedback')).toContainText('저장 결과를 확인하지 못했습니다');
  await page.getByRole('button', { name: '전체 기록 확인' }).click();
  await expect(page.getByRole('heading', { name: '나의 기록' })).toBeFocused();
  await expect(page.locator('.journal-entry').first()).toContainText('첫 번째 메모');
  await expect(memo).toHaveValue('응답 전에 수정한 메모');
  expect(writes).toEqual(['첫 번째 메모']);
});

test('journal scopes incomplete searches and blocks a stock that disappears during editing', async ({ page }) => {
  const now = Date.now();
  await page.clock.install({ time: now });
  const state = snapshot();
  state.status.observedAt = state.status.lastSuccessAt = new Date(now - 1_000).toISOString();
  await page.setViewportSize({ width: 390, height: 844 });
  const receivedInstruments = state.instruments.filter(s => s.code === '000660');
  state.instruments = [];
  state.journal = [{ id: 'subset', code: '005930', text: '수신한 예시', date: '2026-11-20T01:30:00Z' }];
  state.status.phase = 'partial'; state.status.complete = false;
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/journal');
  await page.getByLabel('일지 검색').fill('다른 기록');
  await expect(page.getByText('받은 기록에서 검색 결과가 없습니다')).toBeVisible();
  await expect(page.locator('.journal-source')).toContainText('검색 0건 / 수신 1건');
  const stock = page.getByRole('combobox', { name: '종목' });
  await expect(stock).toContainText('종목 목록 미확인');
  await page.getByRole('button', { name: '메모 작성' }).click();
  await expect(page.getByLabel('매매 메모')).toBeFocused();
  await page.getByLabel('매매 메모').fill('종목을 확인하기 전의 초안');
  await page.locator('.journal-compose form').evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.getByRole('alert')).toHaveCount(0);
  state.instruments = receivedInstruments;
  state.status.observedAt = state.status.lastSuccessAt = new Date(now).toISOString();
  state.status.phase = 'ready'; state.status.complete = true;
  await page.getByRole('button', { name: '다시 확인' }).click();
  const save = page.getByRole('button', { name: '일지 저장' });
  await expect(save).toBeEnabled(); await expect(stock).toHaveValue('000660');
  await page.getByLabel('매매 메모').fill('다음 확인 전까지 남길 초안');
  state.instruments = [];
  const response = page.waitForResponse('**/api/state'); await page.clock.fastForward(3500); await response;
  await expect(stock).toHaveValue(''); await expect(stock).toBeDisabled(); await expect(save).toBeDisabled();
  await expect(page.getByLabel('매매 메모')).toHaveValue('다음 확인 전까지 남길 초안');
});

test('journal restores the matching search on same-page history changes', async ({ page }) => {
  const state = snapshot();
  state.journal = [{ id: 'example', code: '000660', text: '분할 진입', date: '2026-11-20T01:30:00Z' }];
  await page.route('**/api/state', route => route.fulfill({ json: state }));
  await page.goto('/journal?view=notes');
  const search = page.getByLabel('일지 검색');
  await search.fill('분할');
  await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '매매일지' }).click();
  await expect(page).toHaveURL(/\/journal$/); await expect(search).toHaveValue('');
  await search.fill('000660');
  await page.goBack(); await expect(page).toHaveURL(/\/journal\?view=notes$/);
  await expect(search).toHaveValue('분할');
  await page.goForward(); await expect(search).toHaveValue('000660');
});
