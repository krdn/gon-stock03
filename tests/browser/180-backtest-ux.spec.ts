import { expect, test, type Page } from '@playwright/test';
import { dailyFixture } from '../backtest-fixture';
import { snapshot } from '../snapshot';
import type { DailyRun } from '../../shared/market-data';

const { run } = dailyFixture();
const latest: DailyRun = { ...run, code: '000660', id: '96b3f123-f72e-4d77-9091-72a057ce26e4', adjustment: 'adjusted' };
const stableURL = '/backtest?source=stored&run=' + run.id;
const picker = (page: Page) => page.getByRole('combobox', { name: '일봉 수집 기록', exact: true });
const source = (page: Page) => page.getByRole('combobox', { name: '데이터 출처', exact: true });
const execute = (page: Page) => page.getByRole('button', { name: '저장 일봉 실험 실행', exact: true });

async function inventory(page: Page, getRuns: () => DailyRun[] = () => [latest, run]) {
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/data/daily', route => route.fulfill({ json: { runs: getRuns() } }));
  await page.route('**/api/backtest/experiments', route => route.fulfill({ json: { experiments: [] } }));
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  return posts;
}

test('180 일봉 선택·출처와 주소를 뒤로·앞으로·새로고침에서 복원한다', async ({ page }) => {
  const posts = await inventory(page);
  await page.goto(stableURL); await expect(picker(page)).toHaveValue(run.id);
  await expect(page.getByRole('combobox', { name: '수정주가 정책' })).toHaveValue('raw');
  await expect(page.getByRole('link', { name: '데이터 상태 확인' })).toHaveAttribute('href', '/data?run=' + run.id + '#inventory-daily');
  await page.reload(); await expect(picker(page)).toHaveValue(run.id);
  await source(page).focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/source=demo$/); await expect(page.getByRole('heading', { name: '합성 실험 설정' })).toBeVisible();
  await page.goBack(); await expect(picker(page)).toHaveValue(run.id);
  await page.goForward(); await expect(source(page)).toHaveValue('demo');
  await page.goto('/backtest'); await expect(picker(page)).toHaveValue(latest.id);
  expect(posts).toEqual([]);
});

test('180 없어진 기록·부분 수집·달력 미대조·빈 목록을 구별하고 자동 실행하지 않는다', async ({ page }) => {
  let rows: DailyRun[] = [latest, run]; const posts = await inventory(page, () => rows);
  await page.goto(stableURL); await expect(execute(page)).toBeEnabled();
  rows = [latest]; await page.getByRole('button', { name: '실험 목록 새로고침' }).click();
  await expect(page.getByRole('alert')).toContainText('요청한 수집 기록을 찾을 수 없습니다'); await expect(picker(page)).toHaveValue('');
  await expect(execute(page)).toBeDisabled(); await picker(page).selectOption(latest.id);
  await expect(page).toHaveURL(new RegExp(latest.id + '$')); await expect(execute(page)).toBeEnabled();
  rows = [{ ...latest, nextDate: latest.to, coverageComplete: false }]; await page.reload();
  await expect(page.getByText(/부분 수집 ·/)).toBeVisible(); await expect(execute(page)).toBeDisabled();
  rows = [{ ...latest, calendar: undefined, quality: { ...latest.quality, state: 'unverified' } }];
  await page.reload(); await expect(page.getByText(/입력 달력 미대조/)).toBeVisible(); await expect(execute(page)).toBeDisabled();
  rows = []; await page.goto('/backtest'); await expect(page.getByText('저장된 KIS 일봉이 없습니다')).toBeVisible();
  await expect(page.getByText('저장된 실험이 없습니다.', { exact: false })).toBeVisible(); expect(posts).toEqual([]);
});

test('180 모호한 주소는 실행 화면을 열지 않고 직접 복구하도록 한다', async ({ page }) => {
  const posts = await inventory(page);
  for (const search of ['source=other', 'source=demo&source=stored', 'source=demo&run=' + run.id, 'source=stored&run=', 'run=' + run.id, 'source=stored&run=wrong', 'source=stored&run=' + run.id + '&run=' + latest.id]) {
    await page.goto('/backtest?' + search); await expect(page.getByRole('main').getByRole('alert')).toContainText('주소의 출처 또는 수집 ID');
    await expect(execute(page)).toHaveCount(0); await expect(page.getByRole('button', { name: '백테스트 실행', exact: true })).toHaveCount(0);
  }
  await source(page).selectOption('demo'); await expect(page).toHaveURL(/source=demo$/); expect(posts).toEqual([]);
});

test('180 합성 결과의 비용·체결 기준과 미실행 입력 실패가 구별된다', async ({ page }) => {
  const posts = await inventory(page);
  await page.route('**/api/backtest', route => route.fulfill({ json: { result: {
    equity: [10000000, 10000000], trades: [], returnPct: 0, maxDrawdown: 0, finalEquity: 10000000, fees: 0, slippageCost: 0,
    source: '합성 30봉 · 다음 봉 종가 체결 가정 · 세금 미포함',
  } } }));
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/backtest?source=demo');
  const submit = page.getByRole('button', { name: '백테스트 실행', exact: true });
  await submit.focus(); await page.keyboard.press('Enter');
  const result = page.getByRole('region', { name: '합성 실험 결과' }); await expect(result).toBeFocused();
  await expect(result).toContainText('합성 30봉 · 다음 봉 종가'); await expect(result).toContainText('수수료 1.5bp');
  await expect(result).toContainText('체결가에 포함된 슬리피지 0원');
  await page.getByLabel('단기 (봉)', { exact: true }).fill('21'); await expect(result).toHaveCount(0);
  await submit.click(); await expect(page.getByRole('main').getByRole('alert')).toContainText('단기 기간은 장기 기간보다 작아야');
  expect(posts).toEqual(['/api/backtest']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('180 입력 대조 중 새 주소로 이동해도 늦은 일봉 응답이 선택을 바꾸지 않는다', async ({ page }) => {
  const posts = await inventory(page); let started = false; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/data/daily', async route => {
    started = true; await gate; await route.fulfill({ json: { runs: [latest, run] } }).catch(() => {});
  });
  await page.goto(stableURL); await expect.poll(() => started).toBe(true);
  await expect(picker(page)).toHaveValue(''); await expect(execute(page)).toBeDisabled();
  await source(page).selectOption('demo'); release(); await expect(source(page)).toHaveValue('demo');
  await page.goBack(); await expect(picker(page)).toHaveValue(run.id); expect(posts).toEqual([]);
});

test('180 선택한 수집 기록이 바뀌어도 입력 비용과 선택 초점을 유지한다', async ({ page }) => {
  await inventory(page); await page.goto(stableURL);
  const policy = page.getByRole('combobox', { name: '수정주가 정책' });
  const fee = page.getByRole('spinbutton', { name: /수수료/ });
  await expect(policy).toHaveValue('raw'); await fee.fill('7.5');
  await policy.focus(); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
  await expect(picker(page)).toHaveValue(latest.id); await expect(policy).toBeFocused(); await expect(fee).toHaveValue('7.5');
});

test('180 DEMO 목록에 기본 종목이 없으면 표시 중인 종목만 계산하고 빈 목록을 차단한다', async ({ page }) => {
  const posts = await inventory(page), state = snapshot();
  const one = state.instruments.find(row => row.code !== '069500')!;
  let instruments = [one], submitted = '';
  await page.route('**/api/state', route => route.fulfill({ json: { ...state, instruments } }));
  await page.route('**/api/backtest', route => {
    submitted = route.request().postDataJSON().code;
    return route.fulfill({ status: 400, json: { error: '유효한 가격 표본이 부족합니다.' } });
  });
  await page.goto('/backtest?source=demo'); await expect(page.getByRole('combobox', { name: '대상', exact: true })).toHaveValue(one.code);
  const button = page.getByRole('button', { name: '백테스트 실행', exact: true });
  await button.click(); await expect(page.getByRole('main').getByRole('alert')).toContainText('가격 표본'); expect(submitted).toBe(one.code);
  instruments = []; await page.reload(); await expect(page.getByText('계산할 합성 종목이 없습니다.')).toBeVisible();
  await expect(button).toBeDisabled(); expect(posts).toEqual(['/api/backtest']);
});

test('180 고정 실험의 재현 불일치와 잘못된 응답을 각각 경고한다', async ({ page }) => {
  const { Store } = await import('../../server/store');
  const { createExperiment } = await import('../../server/backtest');
  const store = new Store(':memory:'), fixture = dailyFixture();
  let saved;
  try {
    store.saveDaily(fixture.run, fixture.bars);
    saved = createExperiment(store, fixture.input);
  } finally { store.close(); }
  await inventory(page);
  await page.route('**/api/backtest/experiments', route => route.fulfill({ json: { experiments: [{ id: saved.id, createdAt: saved.createdAt, input: fixture.input, bars: fixture.bars.length }] } }));
  await page.route('**/api/backtest/experiments/' + saved.id, route => route.fulfill({ json: { experiment: saved } }));
  await page.route('**/api/backtest/replay', route => route.fulfill({ json: { matches: false, result: saved.result, inputHash: saved.inputHash } }));
  await page.goto(stableURL); await page.getByRole('button', { name: '저장 실험 불러오기' }).click();
  const result = page.getByRole('region', { name: '저장 일봉 실험 결과' }), replay = result.getByRole('button', { name: '고정 입력으로 재현 검증' });
  await replay.click(); await expect(result.getByRole('alert')).toContainText('재현 불일치');
  await page.route('**/api/backtest/replay', route => route.fulfill({ json: { matches: true } }));
  await replay.click(); await expect(result.getByRole('alert')).toHaveText('재현 검증 실패 · 재현 응답 형식이 올바르지 않습니다.');
});
