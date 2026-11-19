import { once } from 'node:events';
import { test, expect } from '@playwright/test';
import { snapshot } from '../snapshot';

test('mobile once workflow keeps edits across pages and reload, reviews before fixing and sends no trade', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let draft: import('../../shared/trading-plan').PlanRecord | null = null;
  const writes: string[] = [];
  await page.route('**/api/**', async (r) => {
    const path = new URL(r.request().url()).pathname;
    if (r.request().method() === 'POST') writes.push(path);
    if (path === '/api/state') return r.fulfill({ json: snapshot() });
    if (path === '/api/trading-settings')
      return r.fulfill({ json: { active: null, plans: { once: draft }, canFix: true } });
    if (path.endsWith('/draft')) {
      const { terms } = r.request().postDataJSON();
      draft = { draft: { terms, id: 'target', fixed: false, limits: { ...snapshot().risk, manualQty: 5 } } };
      return r.fulfill({ json: { plan: draft } });
    }
    if (path.endsWith('/fix')) {
      if (!draft) throw Error('missing test draft');
      draft.draft.fixed = true;
      draft.draft.runId = 'run';
      return r.fulfill({ json: { plan: draft } });
    }
    return r.abort();
  });
  await page.goto('/settings/trading');
  await page.getByRole('link', { name: /다음 한정 실행/ }).click();
  await page.getByLabel('실행일 (KST)').fill('2099-01-05');
  await page.getByRole('button', { name: '한도·조건으로' }).click();
  await page.getByLabel('승인 최대 수량 (주)').fill('7');
  await page.reload();
  await expect(page.getByLabel('승인 최대 수량 (주)')).toHaveValue('7');
  await page.getByRole('button', { name: '이전 단계' }).click();
  await expect(page.getByLabel('실행일 (KST)')).toHaveValue('2099-01-05');
  await page.getByRole('button', { name: '한도·조건으로' }).click();
  await page.getByRole('button', { name: '초안 저장 및 검토' }).click();
  await expect(page.getByRole('row', { name: /수량 상한/ })).toContainText('7주');
  expect(writes).toEqual(['/api/trading-settings/draft']);
  await page.getByRole('button', { name: '다음 실행 고정' }).click();
  await expect(page.getByText('고정 완료 · 실행 대기')).toBeVisible();
  expect(writes).toEqual(['/api/trading-settings/draft', '/api/trading-settings/fix']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('strategy editor uses the saved revision and the running contract is read only', async ({ page }) => {
  const state = snapshot();
  state.strategies.push({
    id: 'test-kis',
    name: '모의 전략',
    environment: 'kis-paper',
    code: '005930',
    fast: 2,
    slow: 3,
    qty: 2,
    revision: 3,
    active: false,
    lastSignal: 'hold',
    lastTick: -1,
  });
  const active = {
    kind: 'strategy',
    strategyId: 'test-kis',
    revision: 3,
    startsAt: '2099-01-05T00:00:00Z',
    endsAt: '2099-01-05T01:00:00Z',
    maxOrderAmount: 90000,
    maxAttempts: 2,
    maxTotalAmount: 180000,
    sellPolicy: 'deny',
  };
  let running = false;
  await page.route('**/api/state', (r) => r.fulfill({ json: state }));
  await page.route('**/api/trading-settings', (r) =>
    r.fulfill({ json: { plans: {}, active: running ? active : null, canFix: !running } }),
  );
  await page.goto('/strategies?environment=kis-paper');
  await page.getByRole('link', { name: '다음 계약 준비' }).click();
  await expect(page.getByLabel('저장 KIS 전략')).toHaveValue('test-kis');
  await expect(page.getByText('005930 · revision 3 · 2/3 교차 · 2주')).toBeVisible();
  running = true;
  await page.reload();
  await expect(page.getByText('전용 실행 원장 · 읽기 전용')).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 실행 고정' })).toHaveCount(0);
  await page.getByRole('button', { name: '다음 계약으로 복사' }).click();
  await expect(page.getByRole('textbox')).toHaveValue(JSON.stringify(active));
});

test('실제 매매설정 화면이 하한가 2주와 지연 전략을 각각 새 원장에 고정한다', async ({ page }, testInfo) => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { Store } = await import('../../server/store.ts');
  const { KisClient } = await import('../../server/kis.ts');
  const { makeServer } = await import('../../server/http.ts');
  const { readPreparedRun, activeTerms } = await import('../../server/trading-plans.ts');
  const dir = mkdtempSync(join(tmpdir(), 'trading-policy-browser-')),
    store = new Store(join(dir, 'general.sqlite'));
  let brokerCalls = 0;
  const client = new KisClient({ key: 'fixture', secret: 'fixture', account: '00000000', product: '01' }, async () => {
    brokerCalls++;
    throw Error('unexpected broker call');
  });
  const port = 4387,
    server = makeServer(store, client, [port]);
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + port + '/settings/trading';
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + '/once');
    await page.getByLabel('실행일 (KST)').fill('2099-01-05');
    await page.getByRole('button', { name: '한도·조건으로' }).click();
    await page.getByRole('button', { name: '11월 19일 하한가 2주 예시 불러오기' }).click();
    await expect(page.getByLabel('계약 고정 단가 (원)')).toHaveValue('136300');
    await expect(page.getByLabel('승인 최대 수량 (주)')).toHaveValue('2');
    await page.getByLabel('주문 후 조회·잔량 대응 시간 (초)').fill('600');
    await page.getByRole('button', { name: '초안 저장 및 검토' }).click();
    await expect(page.getByRole('row', { name: /고정 단가/ }).last()).toContainText('136,300');
    await expect(page.getByRole('row', { name: /조회·잔량 대응/ })).toContainText('600초');
    await page.getByRole('button', { name: '다음 실행 고정' }).click();
    await expect(page.getByText('고정 완료 · 실행 대기')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const pinned = store.tradingPlan('once')!.draft;
    const prepared = readPreparedRun(
      join(dir, 'trading-runs', 'approval-' + pinned.id, 'approval-' + pinned.runId + '.json'),
      'once',
    );
    expect('requestId' in prepared.config && activeTerms(prepared.config)).toEqual(pinned.terms);
    await page.screenshot({ path: testInfo.outputPath('mobile-once.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto(base + '/strategy');
    await page.getByRole('button', { name: '종목·수량·교차 주기로 새 전략 만들기' }).click();
    await page.getByLabel('전략 이름').fill('격리 교차 신호');
    await page.getByRole('button', { name: '정지 상태로 저장하고 선택' }).click();
    await expect(page.getByLabel('저장 KIS 전략').locator('option:checked')).toHaveText('격리 교차 신호 · 005930');
    await page.getByLabel('시작 (KST)').fill('2099-01-05T09:00');
    await page.getByLabel('종료 (KST)').fill('2099-01-05T11:00');
    await page.getByRole('button', { name: '한도·조건으로' }).click();
    await page.getByRole('button', { name: '지연 재현용 시세·신호 15초 적용' }).click();
    await page.getByLabel('매도 범위').selectOption('contract');
    await page.getByRole('button', { name: '초안 저장 및 검토' }).click();
    await expect(page.getByRole('row', { name: /원 신호 유효시간/ })).toContainText('15초');
    await page.getByRole('button', { name: '다음 실행 고정' }).click();
    await expect(page.getByText('고정 완료 · 실행 대기')).toBeVisible();
    const strat = store.tradingPlan('strategy')!.draft;
    expect(strat.fixed).toBe(true);
    expect(store.read().strategies.at(-1)?.active).toBe(false);
    const run = readPreparedRun(
      join(dir, 'trading-runs', 'strategy-' + strat.id, 'strategy-' + strat.runId + '.json'),
      'strategy',
    );
    expect('contractId' in run.config && activeTerms(undefined, run.config)).toEqual(strat.terms);
    expect(brokerCalls).toBe(0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true });
  }
});

test('하한가에서 시장가로 전환하거나 실행일을 바꿔도 이전 날짜·숨은 가격 조건이 남지 않는다', async ({ page }) => {
  await page.route('**/api/state', (r) => r.fulfill({ json: snapshot() }));
  await page.route('**/api/trading-settings', (r) => r.fulfill({ json: { active: null, plans: {}, canFix: false } }));
  await page.goto('/settings/trading/once/1');
  await page.getByLabel('실행일 (KST)').fill('2099-01-05');
  await page.getByRole('button', { name: '한도·조건으로' }).click();
  await page.getByRole('button', { name: '11월 19일 하한가 2주 예시 불러오기' }).click();
  await page.getByText('특별 개장일 공지 입력', { exact: true }).click();
  await page.getByLabel('해당 날짜의 공식 정규장 공지를 직접 확인해 고정').check();
  await page.getByLabel('KRX·한국투자증권 공식 공지 URL').fill('https://kind.krx.co.kr/example');
  await page.getByRole('button', { name: '이전 단계' }).click();
  await page.getByLabel('실행일 (KST)').fill('2026-11-19');
  await page.getByRole('combobox', { name: '주문 방식', exact: true }).selectOption('market');
  await page.getByRole('button', { name: '한도·조건으로' }).click();
  await expect(page.getByLabel('계약 고정 단가 (원)')).toHaveCount(0);
  await expect(page.getByLabel('실행 개시 시각 (KST)')).toHaveValue('10:00');
  await expect(page.getByLabel('실행 마감 시각 (KST)')).toHaveValue('16:30');
  await expect(page.getByLabel('해당 날짜의 공식 정규장 공지를 직접 확인해 고정')).not.toBeChecked();
  let saved: Extract<import('../../shared/trading-plan').TradingTerms, { kind: 'once' }> | undefined;
  await page.route('**/api/trading-settings/draft', (r) => {
    saved = r.request().postDataJSON().terms;
    return r.fulfill({
      json: {
        plan: { draft: { id: 'draft', fixed: false, terms: saved, limits: { ...snapshot().risk, manualQty: 5 } } },
      },
    });
  });
  await page.getByRole('button', { name: '초안 저장 및 검토' }).click();
  await expect.poll(() => saved?.policy?.priceMode).toBe('current');
  expect(saved?.policy?.limitPrice).toBeUndefined();
  expect(saved?.policy?.exchangeNotice).toBeUndefined();
});
