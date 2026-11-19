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
      draft = { draft: { terms, id: 'target', fixed: false, limits:{...snapshot().risk,manualQty:5} } };
      return r.fulfill({ json: { plan: draft } });
    }
    if (path.endsWith('/fix')) {
      if(!draft) throw Error('missing test draft');
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
