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
  await page.getByRole('button', { name: '다음 실행용 설정 보기' }).click();
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
  const port = Number(process.env.TRADING_SETTINGS_FIXTURE_PORT ?? 4387),
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
    await page.getByText('지정가·시간·응답 정책', { exact: true }).click();
    await expect(page.getByLabel('계약 고정 단가 (원)')).toHaveValue('136300');
    await expect(page.getByLabel('승인 최대 수량 (주)')).toHaveValue('2');
    await page.getByLabel('주문 후 조회·잔량 대응 시간 (초)').fill('600');
    await page.getByRole('button', { name: '초안 저장 및 검토' }).click();
    await expect(page.getByRole('row', { name: /고정 단가/ }).last()).toContainText('136,300');
    await page.getByText(/나머지 실행 조건/).click();
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
  await page.getByText('지정가·시간·응답 정책', { exact: true }).click();
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

test('주문에서 수량 한도를 저장하면 모바일 첫 화면에서 원래 입력으로 복귀한다', async ({ page }) => {
  const state = snapshot();
  const writes: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') writes.push(path);
    if (path === '/api/state') return route.fulfill({ json: { ...snapshot(), paperManualMaxQty: state.paperManualMaxQty } });
    if (path === '/api/kis/ledger') return route.fulfill({ json: { orders: [] } });
    if (path === '/api/trading-settings') return route.fulfill({ json: { active: null, plans: {}, canFix: false } });
    if (path === '/api/kis/quantity-setting') {
      state.paperManualMaxQty = route.request().postDataJSON().maxQty;
      return route.fulfill({ json: { message: '예시 한도 저장' } });
    }
    return route.abort();
  });
  await page.goto('/paper?code=069500');
  await expect(page.getByRole('group', { name: '로컬 상태' })).toContainText('정상');
  await page.getByRole('button', { name: '매도', exact: true }).click();
  await page.getByLabel('지정가 (원)').fill('72500');
  await page.getByLabel('수량 (주)', { exact: true }).fill('4');
  await page.getByRole('link', { name: '수량 한도 변경' }).click();
  await page.getByLabel('주문당 수량 상한 (주)').fill('8');
  await page.getByRole('button', { name: '수량 한도 저장' }).click();
  await expect(page.getByText('저장된 수동 주문 한도 8주')).toBeVisible();
  await page.reload();
  const back = page.getByRole('link', { name: '주문 입력으로 돌아가기' });
  await expect(back).toBeInViewport({ ratio: 1 });
  await back.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/paper\?code=069500$/);
  await expect(page.getByRole('button', { name: '매도', exact: true })).toHaveClass(/active/);
  await expect(page.getByLabel('지정가 (원)')).toHaveValue('72500');
  await expect(page.getByLabel('수량 (주)', { exact: true })).toHaveValue('4');
  expect(writes).toEqual(['/api/kis/quantity-setting']);
});

test('설정 조회 실패·미확인 상태와 빈 전략을 구분하고 검토 직링크의 문맥을 보존한다', async ({ page }) => {
  let failing = false;
  let partial = false;
  const writes: string[] = [];
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST') {
      writes.push(route.request().url());
      return route.abort();
    }
    if (route.request().url().endsWith('/api/state')) {
      const state = snapshot();
      if (partial) Object.assign(state.status, { phase: 'partial', complete: false, error: '예시 일부 응답' });
      return route.fulfill({ json: state });
    }
    return route.fulfill(failing ? { status: 503, json: {} } : { json: { active: null, plans: {}, canFix: false } });
  });
  await page.goto('/settings');
  await expect(page.getByRole('group', { name: '로컬 상태' })).toContainText('정상');
  failing = true;
  await page.locator('.page-title').getByRole('link', { name: '매매 설정' }).click();
  await expect(page.getByRole('alert')).toContainText('조회 실패');
  failing = false;
  await page.getByRole('button', { name: '다시 조회' }).click();
  await expect(page.getByRole('link', { name: /다음 전략 계약/ })).toBeVisible();
  await page.goto('/settings/trading/strategy/3?strategy=missing');
  await expect(page).toHaveURL(/strategy\/1\?strategy=missing$/);
  await expect(page.getByText('저장된 KIS 전략이 없습니다.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '한도·조건으로' })).toBeDisabled();
  partial = true;
  await page.goto('/settings/trading');
  await expect(page.getByRole('group', { name: '로컬 상태' })).toContainText('부분실패');
  await expect(page.getByRole('link', { name: /일반 주문·위험/ })).toContainText('현재 한도 미확인');
  await page.getByRole('link', { name: /다음 한정 실행/ }).click();
  await expect(page.getByLabel('실행일 (KST)')).toBeDisabled();
  await expect(page.getByText(/로컬 상태 미확인 · 최신 한도/)).toBeVisible();
  await page.goto('/settings/trading/once/2');
  await expect(page.getByText('현재 공통 한도 미확인', { exact: false })).toBeVisible();
  await page.goto('/settings/trading/strategy/1');
  await expect(page.getByText(/로컬 상태 미확인 · 최신 한도/)).toBeVisible();
  await expect(page.getByText(/저장된 KIS 전략이 없습니다/)).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('전략의 검토 URL과 뒤·앞·새로고침은 선택한 revision을 유지하고 변경된 revision의 고정을 막는다', async ({ page }) => {
  const state = snapshot();
  const strategy = { id: 'sample-cross', name: '예시 교차', code: '069500', revision: 3, environment: 'kis-paper' as const,
    qty: 2, fast: 2, slow: 5, active: false, lastSignal: 'hold' as const, lastTick: -1 };
  state.strategies.push(strategy);
  let draft: import('../../shared/trading-plan').PlanRecord | undefined;
  const writes: string[] = [];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') writes.push(path);
    if (path === '/api/state') return route.fulfill({ json: { ...snapshot(), strategies: state.strategies } });
    if (path === '/api/trading-settings') return route.fulfill({ json: { plans: { strategy: draft }, active: null, canFix: true } });
    if (path.endsWith('/draft')) {
      draft = { draft: { id: 'example-strategy', fixed: false, terms: route.request().postDataJSON().terms,
        limits: { ...state.risk, manualQty: 5 } } };
      return route.fulfill({ json: { plan: draft } });
    }
    return route.abort();
  });
  await page.goto('/settings/trading/strategy/1?strategy=sample-cross');
  await page.getByLabel('시작 (KST)').fill('');
  await page.getByRole('button', { name: '한도·조건으로' }).click();
  await expect(page.getByLabel('시작 (KST)')).toBeFocused();
  await page.getByLabel('시작 (KST)').fill('2099-01-05T09:00');
  await page.getByLabel('종료 (KST)').fill('2099-01-05T08:59');
  await page.getByRole('button', { name: '한도·조건으로' }).click();
  await expect(page.getByRole('alert')).toContainText('종료 시각');
  await page.getByLabel('종료 (KST)').fill('2099-01-05T11:00');
  await page.getByRole('button', { name: '한도·조건으로' }).click();
  await page.getByLabel('총 전송 시도 횟수').fill('3');
  await page.goBack();
  await expect(page.getByLabel('시작 (KST)')).toHaveValue('2099-01-05T09:00');
  await page.goForward();
  await page.reload();
  await expect(page.getByLabel('총 전송 시도 횟수')).toHaveValue('3');
  await page.getByRole('button', { name: '초안 저장 및 검토' }).click();
  await expect(page.getByRole('heading', { name: '검토·고정' })).toBeFocused();
  await expect(page.getByText('초안 저장됨 · 고정 전')).toBeVisible();
  await expect(page.getByRole('row', { name: /저장 전략/ })).toContainText('revision 3');
  strategy.revision = 4;
  await page.reload();
  await expect(page.getByRole('button', { name: '다음 실행 고정' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('revision이 변경');
  await page.getByRole('button', { name: '대상·기간 수정' }).click();
  await expect(page.getByText(/초안 revision 3 · 현재 revision 4/)).toBeVisible();
  await page.getByRole('button', { name: '현재 revision 사용' }).click();
  await expect(page.getByRole('button', { name: '한도·조건으로' })).toBeEnabled();
  expect(writes).toEqual(['/api/trading-settings/draft']);
});

test('고정 응답을 잃으면 재조회 동안 고정을 차단하고 확인한 고정본만 실행 대기로 표시한다', async ({ page }) => {
  const { defaultOncePolicy } = await import('../../shared/trading-policy');
  const { planLimits } = await import('../../shared/trading-plan');
  const terms = { kind: 'once' as const, date: '2099-01-05', code: '069500', orderType: 'limit' as const,
    maxQty: 2, maxAmount: 150000, allowExistingHolding: false, cancelProbe: false, policy: defaultOncePolicy('2099-01-05') };
  const plan = { draft: { id: 'example', fixed: false, terms, limits: planLimits(snapshot()), runId: 'sample' } };
  const writes: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') writes.push(path);
    if (path === '/api/state') return route.fulfill({ json: snapshot() });
    if (path === '/api/trading-settings') {
      if (plan.draft.fixed) await gate;
      return route.fulfill({ json: { active: null, plans: { once: plan }, canFix: true } });
    }
    if (path.endsWith('/fix')) {
      plan.draft.fixed = true;
      return route.abort('failed');
    }
    return route.abort();
  });
  await page.goto('/settings/trading/once/3');
  const fix = page.getByRole('button', { name: '다음 실행 고정' });
  await fix.click();
  await expect(page.getByText('저장 결과 확인 중')).toBeVisible();
  await expect(fix).toBeDisabled();
  release();
  await expect(page.getByText('고정 완료 · 실행 대기')).toBeFocused();
  await expect(fix).toHaveCount(0);
  await page.getByText('다음 실행에 사용할 고정 파일').focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('trading-runs/approval-example/approval-sample.json')).toBeVisible();
  expect(writes).toEqual(['/api/trading-settings/fix']);
});

test('검토에서 바뀐 정책·해제한 고정 단가를 바로 비교하고 그대로인 응답 대기는 펼쳐 확인한다', async ({ page }) => {
  const { defaultOncePolicy } = await import('../../shared/trading-policy');
  const { planLimits } = await import('../../shared/trading-plan');
  const date = '2099-01-05', limits = planLimits(snapshot());
  const terms = { kind: 'once' as const, date, code: '069500', orderType: 'market' as const, maxQty: 2,
    maxAmount: 150000, allowExistingHolding: false, cancelProbe: false, policy: defaultOncePolicy(date) };
  const previous = { ...terms, orderType: 'limit' as const, policy: { ...terms.policy, priceMode: 'fixed' as const,
    limitPrice: 72000, reconnects: 1 } };
  const plan = {
    draft: { terms, limits, id: 'new-draft', fixed: false },
    previous: { terms: previous, limits, id: 'older', fixed: true },
  };
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/trading-settings', route => route.fulfill({ json: { active: null, plans: { once: plan }, canFix: false } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings/trading/once/3');
  await expect(page.getByRole('row', { name: /고정 단가/ })).toContainText('해제');
  await expect(page.getByRole('row', { name: /시세 재연결/ })).toContainText('1회');
  await expect(page.getByRole('row', { name: /KIS 응답 대기/ })).toHaveCount(0);
  await page.getByText(/나머지 실행 조건/).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('row', { name: /KIS 응답 대기/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '다음 실행 고정' })).toBeDisabled();
  await expect(page.getByText(/일반 디스크 원장/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('끝 슬래시를 붙여 연 한정 설정은 대상 단계로 열리며 Enter로 한도에 들어가도 저장하지 않는다', async ({ page }) => {
  const writes: string[] = [];
  await page.route('**/api/**', route => {
    if (route.request().method() === 'POST') writes.push(route.request().url());
    return route.fulfill({ json: route.request().url().endsWith('/state')
      ? snapshot() : { plans: {}, active: null, canFix: false } });
  });
  await page.goto('/settings/trading/once/?from=paper&code=069500');
  await expect(page.getByRole('heading', { name: '대상·기간' })).toBeVisible();
  await page.getByRole('button', { name: '한도·조건으로' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/once\/2\?from=paper&code=069500$/);
  expect(writes).toEqual([]);
});
