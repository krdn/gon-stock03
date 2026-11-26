import { test, expect, type Page } from '@playwright/test';
import { scopeNotice, type DailyRun, type StoredBar, type SyncRun } from '../../shared/market-data';
import type { SyncInventory } from '../../shared/data-inventory';
import { emptyStatus } from '../../shared/status';
import { snapshot } from '../snapshot';

const successAt = '2026-11-12T02:00:00.000Z';
const attemptAt = '2026-11-13T03:00:00.000Z';
const run = (changes: Partial<DailyRun> = {}): DailyRun => ({
  id: '86b3f123-f72e-4d77-9091-72a057ce26e4', code: '005930', from: '20260101', to: '20260415', adjustment: 'adjusted',
  source: 'kis-rest', exchange: 'KRX', endpoint: '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
  startedAt: successAt, captureDate: '20261113', nextDate: '20260401', coverageComplete: false,
  status: { ...emptyStatus('kis-paper'), phase: 'partial', pages: 1, observedAt: attemptAt, error: 'KIS 호출 제한' },
  quality: { state: 'pending', missingDates: [], unexpectedDates: [], candidateMissingDates: [], duplicates: 2, emptyWindows: [] }, ...changes,
});
type SyncRunMock = SyncRun & { source?: string };
const syncRun = (changes: Partial<SyncRunMock> = {}): SyncRunMock => ({
  runId: '11111111-1111-4111-8111-111111111111',
  trigger: 'post_close',
  targetDate: '20261113',
  sourceLabel: '장후 동기화',
  status: 'succeeded',
  reasonCode: null,
  calendarSource: 'https://open.krx.co.kr/calendar',
  calendarVerified: true,
  scopeLimit: 30,
  totalSymbols: 30,
  succeededSymbols: 30,
  failedSymbols: 0,
  masterRefreshed: true,
  startedAt: '2026-11-13T06:40:00.000Z',
  finishedAt: '2026-11-13T06:45:00.000Z',
  summary: { scopeNotice, tier1: 12, tier2: 18, tier1Truncated: false, omitted: [], halted: [], mismatch: [], failures: [] },
  ...changes,
});
const syncInventory = (changes: Partial<SyncInventory> = {}): SyncInventory => ({
  active: null,
  latest: null,
  runs: [],
  scopeNotice,
  serverNow: '2026-11-13T06:55:00.000Z',
  ...changes,
});
const bars: StoredBar[] = ['20260102', '20260105'].map(date => ({ date, code: '005930', adjustment: 'adjusted', source: 'kis-rest', collectedAt: successAt, open: 100, high: 100, low: 100, close: 100, volume: 1 }));
const master = { instruments: [], removed: [], sources: [{ exchange: 'KOSPI', source: 'https://example.test/master', phase: 'error', observedAt: attemptAt, lastSuccessAt: successAt, error: '전체 교체 보류', sha256: 'fixture', count: 123 }] };
async function setup(page: Page, runs = [run()], sync: SyncInventory = syncInventory()) {
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/data/master', route => route.fulfill({ json: master }));
  await page.route('**/api/data/sync*', route => route.fulfill({ json: sync }));
  await page.route('**/api/data/daily', route => route.fulfill({ json: { runs } }));
  await page.route('**/api/data/daily/*', route => {
    const selected = runs.find(row => route.request().url().endsWith(row.id))!;
    return route.fulfill({ json: { run: selected, bars: bars.map(bar => ({ ...bar, code: selected.code, adjustment: selected.adjustment })) } });
  });
}

test('data inventory separates sources and shows partial ranges, stored trading days and preserved success', async ({ page }, testInfo) => {
  const previous = run({ id: '96b3f123-f72e-4d77-9091-72a057ce26e4', nextDate: null, coverageComplete: true,
    status: { ...emptyStatus('kis-paper'), phase: 'ready', complete: true, pages: 2, lastSuccessAt: successAt, observedAt: successAt },
    quality: { ...run().quality, state: 'passed' }, calendar: { source: 'https://example.test/calendar', dates: bars.map(bar => bar.date) } });
  await setup(page, [run(), previous]); const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') writes.push(request.url()); });
  await page.goto('/data');
  const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await expect(detail).toContainText('일부 수집'); await expect(detail).toContainText('2026-04-01 ~ 2026-04-15');
  await expect(detail).toContainText('저장 2봉'); await expect(detail).toContainText('수정주가');
  await expect(detail).toContainText('누락 일수 미확인');
  await expect(detail).not.toContainText('누락 0일');
  await detail.getByText('품질 상세 펼치기', { exact: true }).click();
  await expect(detail.getByText(/중복 제거 2건/)).toBeVisible(); await expect(detail).toContainText('KIS 호출 제한');
  await detail.getByText('수집 시각·출처·기록 ID', { exact: true }).click();
  await expect(detail.getByTestId('daily-last-success').locator('time')).toHaveAttribute('datetime', successAt);
  await expect(detail.getByTestId('daily-last-success')).toContainText('2026-11-12 11:00:00 KST');
  await page.getByRole('combobox', { name: '일봉 수집 기록' }).selectOption(previous.id);
  await expect(detail).toContainText('수집 후 오래됨');
  await page.getByRole('combobox', { name: '일봉 수집 기록' }).selectOption(run().id);
  await detail.getByText('저장 거래일 펼치기').click(); await expect(detail).toContainText('2026-01-02');
  const masterRegion = page.getByRole('region', { name: '공개 마스터 상태' });
  await expect(masterRegion).toContainText('수집 실패'); await expect(masterRegion.locator('time').first()).toHaveAttribute('datetime', successAt);
  await expect(masterRegion).toContainText('기준 거래일 미확인');
  const demo = page.getByRole('region', { name: 'DEMO 합성 데이터' });
  await expect(demo).toContainText('실제 과거 아님'); await expect(demo).toContainText('120');
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: testInfo.outputPath('data-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.sidebar')).not.toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('data-mobile.png'), fullPage: true });
  expect(writes).toEqual([]);
});

test('data quality distinguishes missing candidates, calendar mismatch and empty windows from verified history', async ({ page }) => {
  const unverified = run({ nextDate: null, coverageComplete: true, status: { ...run().status, error: null },
    quality: { ...run().quality, state: 'unverified', candidateMissingDates: ['20260101', '20260106'], emptyWindows: [{ from: '20260401', to: '20260415' }] } });
  await setup(page, [unverified]); await page.goto('/data'); const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await expect(detail).toContainText('구간 수집 종료'); await expect(detail).toContainText('달력 미검증');
  await expect(detail).toContainText('평일 누락 후보 2일'); await expect(detail).toContainText('휴장·상장 전·정지를 판정하지 않습니다');
  await detail.getByText('품질 상세 펼치기').click(); await expect(detail).toContainText('2026-01-06'); await expect(detail).toContainText('2026-04-01 ~ 2026-04-15');
  const mismatch = { ...unverified, calendar: { source: 'https://example.test/calendar', dates: ['20260102', '20260106'] }, quality: { ...unverified.quality, state: 'failed', missingDates: ['20260106'], unexpectedDates: ['20260105'], candidateMissingDates: [] } };
  await setup(page, [mismatch as DailyRun]); await page.reload();
  await expect(detail).toContainText('입력 달력 불일치'); await expect(detail).toContainText('누락 1일'); await expect(detail).toContainText('예상 밖 거래일 1일');
  await expect(detail).toContainText('출처 진위·공식 달력 인증 아님');
});

test('data refresh failures preserve previous data and do not become empty or fresh', async ({ page }) => {
  await setup(page); await page.goto('/data'); const detail = page.getByRole('region', { name: '일봉 수집 상세' }); await expect(detail).toContainText('저장 2봉');
  await page.route('**/api/data/**', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '일봉 목록 조회 실패' })).toContainText('이전 표시');
  await expect(detail).toContainText('상세 조회 실패'); await expect(detail).toContainText('저장 2봉');
  await expect(page.getByText('저장된 KIS 일봉이 없습니다', { exact: true })).toHaveCount(0);
  await page.reload();
  const firstError = page.getByRole('alert').filter({ hasText: '일봉 목록 조회 실패' });
  await expect(firstError).toBeVisible();
  await expect(firstError).not.toContainText('이전 표시');
  await expect(page.getByText('저장된 KIS 일봉이 없습니다', { exact: true })).toHaveCount(0);
});

test('data empty store and malformed responses are explicit and do not crash the page', async ({ page }) => {
  await setup(page, []); await page.goto('/data');
  await expect(page.getByText('저장된 KIS 일봉이 없습니다', { exact: true })).toBeVisible();
  await page.route('**/api/data/daily', route => route.fulfill({ json: { runs: [{ id: 'bad' }] } }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '일봉 목록 조회 실패' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'DEMO 합성 데이터' })).toBeVisible();
  await setup(page);
  await page.route('**/api/data/daily/*', route => route.fulfill({ json: { run: run({ id: '96b3f123-f72e-4d77-9091-72a057ce26e4' }), bars } }));
  await page.reload();
  await expect(page.getByRole('region', { name: '일봉 수집 상세' })).toContainText('상세 조회 실패');
  await expect(page.getByRole('region', { name: '일봉 수집 상세' })).not.toContainText('저장 2봉');
});

test('data run selection ignores delayed detail from the previous selection', async ({ page }) => {
  const second = run({ id: '96b3f123-f72e-4d77-9091-72a057ce26e4', code: '00088K', adjustment: 'raw' });
  await setup(page, [run(), second]); let release!: () => void, started = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/data/daily/' + run().id, async route => { started = true; await gate; await route.fulfill({ json: { run: run(), bars } }).catch(() => {}); });
  await page.goto('/data'); await expect.poll(() => started).toBe(true);
  await page.getByRole('combobox', { name: '일봉 수집 기록' }).selectOption(second.id);
  const detail = page.getByRole('region', { name: '일봉 수집 상세' }); await expect(detail).toContainText('00088K');
  release(); await expect(detail).toContainText('원주가'); await expect(detail).not.toContainText('005930');
});

test('a successful detail refresh advances last success even when the run list refresh fails', async ({ page }) => {
  await setup(page); await page.goto('/data'); const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await expect(detail).toContainText('저장 2봉');
  const completed = run({ nextDate: null, coverageComplete: true, status: { ...run().status, phase: 'ready', complete: true, error: null, lastSuccessAt: successAt }, quality: { ...run().quality, state: 'passed' } });
  await page.route('**/api/data/daily', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.route('**/api/data/daily/*', route => route.fulfill({ json: { run: completed, bars } }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(detail).toContainText('구간 수집 종료');
  await detail.getByText('수집 시각·출처·기록 ID', { exact: true }).click();
  await expect(detail.getByTestId('daily-last-success').locator('time')).toHaveAttribute('datetime', successAt);
  await expect(detail.getByTestId('daily-last-success')).toContainText('2026-11-12 11:00:00 KST');
  await expect(page.getByRole('alert').filter({ hasText: '일봉 목록 조회 실패' })).toBeVisible();
});

test('a newly created collection has no stored bars and is marked as not collected yet', async ({ page }) => {
  const pending = run({ nextDate: '20260101', status: { ...emptyStatus('kis-paper'), phase: 'partial' } });
  await setup(page, [pending]);
  await page.route('**/api/data/daily/*', route => route.fulfill({ json: { run: pending, bars: [] } }));
  await page.goto('/data'); const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await expect(detail).toContainText('저장 0봉');
  await expect(detail.locator('.badge')).toContainText(['수집 전', '대조 대기', '저장 없음']);
});

test('keyboard selection survives reload, source navigation and history on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const second = run({ id: '96b3f123-f72e-4d77-9091-72a057ce26e4', code: '00088K', adjustment: 'raw' });
  await setup(page, [run(), second]);
  await page.goto('/data');
  const picker = page.getByRole('combobox', { name: '일봉 수집 기록' });
  await expect(picker).toHaveValue(run().id);
  const jump = page.getByRole('link', { name: 'KIS 일봉', exact: true });
  await jump.focus();
  await jump.press('Enter');
  await expect(page.getByRole('region', { name: 'KIS 저장 일봉', exact: true })).toBeFocused();
  await expect(picker).toBeInViewport();
  await picker.focus();
  await picker.press('End');
  await expect(picker).toBeFocused();
  await expect(page).toHaveURL(new RegExp('run=' + second.id));
  await page.reload();
  await expect(picker).toHaveValue(second.id);
  const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await expect(detail).toContainText('00088K · 원주가');
  const quality = detail.getByText('품질 상세 펼치기', { exact: true });
  await quality.focus();
  await quality.press('Space');
  await expect(detail.getByText(/중복 제거 2건/)).toBeVisible();
  await quality.press('Enter');
  await expect(quality).toBeFocused();
  const next = detail.getByRole('link', { name: /백테스트/ });
  await next.press('Enter');
  await expect(page).toHaveURL(new RegExp('/backtest.*run=' + second.id));
  await page.goBack();
  await expect(picker).toHaveValue(second.id);
  await page.goBack();
  await expect(picker).toHaveValue(run().id);
  await page.goForward();
  await expect(picker).toHaveValue(second.id);
});

test('unavailable record link never loads a different record and recovers explicitly', async ({ page }) => {
  await setup(page);
  const details: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/data/daily/')) details.push(request.url()); });
  await page.goto('/data?run=missing');
  await expect(page.getByText(/요청한 수집 기록을 찾을 수 없습니다/)).toBeVisible();
  await expect(page.getByRole('region', { name: '일봉 수집 상세' })).toHaveCount(0);
  expect(details).toHaveLength(0);
  await page.getByRole('button', { name: '최근 기록 보기' }).press('Enter');
  await expect(page.getByRole('combobox', { name: '일봉 수집 기록' })).toBeFocused();
  await expect(page).toHaveURL(new RegExp('run=' + run().id));
  await expect(page.getByRole('region', { name: '일봉 수집 상세' })).toContainText('저장 2봉');
});

test('missing master exchange, empty snapshots and unconfirmed DEMO stay distinct', async ({ page }) => {
  await setup(page, []);
  await page.route('**/api/state', route => route.fulfill({ status: 503 }));
  await page.goto('/data');
  const masterPanel = page.getByRole('region', { name: '공개 마스터 상태' });
  await expect(masterPanel.getByText('KOSDAQ · 저장 상태 미확인')).toBeVisible();
  const demo = page.getByRole('region', { name: 'DEMO 합성 데이터' });
  await expect(demo.getByText('로컬 합성 자료 미확인')).toBeVisible();
  await expect(demo).not.toContainText('120봉');
  await page.route('**/api/data/master', route => route.fulfill({ json: { sources: [], instruments: [] } }));
  await page.getByRole('button', { name: '저장 상태 새로고침' }).click();
  await expect(masterPanel.getByText('저장된 마스터가 없습니다')).toBeVisible();
  await expect(page.getByText('저장된 KIS 일봉이 없습니다')).toBeVisible();
});

test('DEMO source links lead to the backtest source picker and official market', async ({ page }) => {
  await setup(page);
  const masterOnly = { code: '00123K', name: '마스터 전용 예시', isin: 'fixture', exchange: 'KOSPI', kind: 'stock', group: 'ST', removedAt: successAt };
  const sources = ['KOSPI', 'KOSDAQ'].map(exchange => ({
    ...master.sources[0], exchange, phase: 'ready', observedAt: successAt, count: 0, error: null,
  }));
  await page.route('**/api/data/master', route => route.fulfill({ json: { sources, instruments: [], removed: [masterOnly] } }));
  const writes: string[] = [];
  page.on('request', req => { if (req.method() !== 'GET') writes.push(req.url()); });
  await page.goto('/data#inventory-demo');
  const demo = page.getByRole('region', { name: 'DEMO 합성 데이터' });
  await expect(demo).toContainText('추가 재생 0회');
  await expect(demo.getByRole('heading')).toBeInViewport();
  await page.reload();
  await expect(demo.getByRole('heading')).toBeInViewport();
  const backtest = demo.getByRole('link', { name: /백테스트/ });
  await backtest.press('Enter');
  await expect(page).toHaveURL(/\/backtest\?source=demo$/);
  await page.getByRole('combobox', { name: '데이터 출처' }).selectOption('demo');
  await expect(page.getByText(/현재 저장된 합성 봉/)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/data#inventory-demo$/);
  await expect(demo.getByRole('heading')).toBeInViewport();
  await demo.getByRole('link', { name: /시장 탐색/ }).press('Enter');
  await expect(page).toHaveURL(/\/market$/);
  const search = page.getByRole('textbox', { name: '종목명 또는 코드 검색' });
  const row = page.getByRole('row').filter({ hasText: masterOnly.name });
  await expect(row).toContainText(masterOnly.code);
  await search.fill('005930');
  await expect(page.getByText(/현재 마스터에 없는 코드입니다/)).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: '005930' })).toHaveCount(0);
  await search.fill(masterOnly.code);
  await expect(row).toBeVisible();
  await expect(row).toContainText('마스터 제외');
  expect(writes).toEqual([]);
});

test('mobile DEMO shortcut keeps its results in view after a delayed daily detail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/data/daily/*', async route => {
    await gate;
    await route.fulfill({ json: { run: run(), bars } }).catch(() => {});
  });
  await page.goto('/data');
  const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await expect(detail.getByRole('status')).toHaveText('상세 조회 중');
  const demo = page.getByRole('region', { name: 'DEMO 합성 데이터' });
  const backtest = demo.getByRole('link', { name: /백테스트/ });
  await page.getByRole('link', { name: 'DEMO 합성', exact: true }).press('Enter');
  await expect(demo).toBeFocused();
  await expect(backtest).toBeInViewport();
  release();
  await expect(detail).toContainText('저장 2봉');
  await expect(backtest).toBeInViewport();
  await expect(demo).toBeFocused();
});

test('market data sync succeeded summary renders source badge, symbol counts, scope notice and stays read-only', async ({ page }) => {
  const succeeded = syncRun({
    sourceLabel: '장후 동기화',
    totalSymbols: 30,
    succeededSymbols: 30,
    failedSymbols: 0,
    finishedAt: '2026-11-13T06:45:00.000Z',
  });
  await setup(page, [run()], syncInventory({ latest: succeeded, runs: [succeeded], serverNow: '2026-11-13T06:55:00.000Z' }));
  const posts: string[] = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  await page.goto('/data');
  const summary = page.getByTestId('sync-summary');
  await expect(summary.getByTestId('sync-source-badge')).toHaveText('장후 동기화');
  await expect(summary.getByTestId('sync-symbol-counts')).toContainText('30종목 중 30종목 통과');
  await expect(summary.getByTestId('sync-scope-notice')).toHaveText('우선 범위 수집 기준(범위 밖 미검증)');
  await expect(summary).toContainText('서버 기준 10분 전');
  await expect(summary.getByTestId('sync-warning-badge')).toHaveCount(0);
  const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await detail.getByText('수집 시각·출처·기록 ID', { exact: true }).click();
  await expect(detail.getByTestId('daily-source-badge')).toHaveText('수동 실행');
  await expect(detail.getByTestId('daily-scope-notice')).toHaveText('우선 범위 수집 기준(범위 밖 미검증)');
  await expect(detail.locator('.badge')).toHaveCount(3);
  expect(posts).toEqual([]);
});

test('sync warning badge covers skipped/partial/interrupted/failed and maps all three source badges', async ({ page }) => {
  const skipped = syncRun({
    runId: '22222222-2222-4222-8222-222222222222',
    trigger: 'post_close',
    sourceLabel: '장후 동기화',
    status: 'skipped',
    reasonCode: 'KIS_UNCONFIGURED',
    totalSymbols: 0,
    succeededSymbols: 0,
    masterRefreshed: false,
    startedAt: '2026-11-13T06:42:00.000Z',
    finishedAt: '2026-11-13T06:42:00.000Z',
  });
  const partial = syncRun({
    runId: '33333333-3333-4333-8333-333333333333',
    trigger: 'post_close',
    source: 'morning_scan',
    sourceLabel: '',
    status: 'partial',
    reasonCode: 'CALENDAR_UNVERIFIED',
    totalSymbols: 30,
    succeededSymbols: 24,
    failedSymbols: 6,
    finishedAt: '2026-11-13T06:30:00.000Z',
  });
  const interrupted = syncRun({
    runId: '44444444-4444-4444-8444-444444444444',
    trigger: 'manual',
    sourceLabel: '수동 실행',
    status: 'interrupted',
    reasonCode: 'SERVER_RESTART',
    totalSymbols: 10,
    succeededSymbols: 0,
    finishedAt: '2026-11-13T06:20:00.000Z',
    summary: { ...syncRun().summary, message: '동기화 중 서버가 재시작됐습니다. 완료 종목만 보존했습니다.' },
  });
  const failed = syncRun({
    runId: '55555555-5555-4555-8555-555555555555',
    trigger: 'post_close',
    sourceLabel: '',
    status: 'failed',
    reasonCode: 'REFERENCE_UNAVAILABLE',
    totalSymbols: 10,
    succeededSymbols: 0,
    failedSymbols: 10,
    finishedAt: '2026-11-13T06:10:00.000Z',
  });
  const running = syncRun({
    runId: '66666666-6666-4666-8666-666666666666',
    trigger: 'manual',
    sourceLabel: '수동 실행',
    status: 'running',
    reasonCode: null,
    totalSymbols: 30,
    succeededSymbols: 5,
    finishedAt: null,
  });

  await setup(page, [run()], syncInventory({ latest: skipped, runs: [skipped, partial, interrupted, failed] }));
  await page.goto('/data');
  const summary = page.getByTestId('sync-summary');
  await expect(summary.getByTestId('sync-scope-notice')).toHaveText(scopeNotice);
  await expect(summary.getByTestId('sync-source-badge')).toHaveText('장후 동기화');
  const warning = summary.getByTestId('sync-warning-badge');
  await expect(warning).toContainText('스킵');
  await expect(warning).toContainText('KIS_UNCONFIGURED');
  await expect(warning.getByTestId('sync-warning-time')).toHaveAttribute('datetime', '2026-11-13T06:42:00.000Z');
  await expect(warning.getByTestId('sync-warning-time')).toHaveText('2026-11-13 15:42:00 KST');

  await summary.getByText('최근 동기화 이력 (4건)', { exact: true }).click();
  await expect(summary.getByTestId('sync-run-source-badge')).toHaveText(['장후 동기화', '장전 스캔', '수동 실행', '장후 동기화']);

  await page.route('**/api/data/sync*', route => route.fulfill({ json: syncInventory({ latest: partial, runs: [partial] }) }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(summary.getByTestId('sync-source-badge')).toHaveText('장전 스캔');
  await expect(warning).toContainText('부분 완료');
  await expect(warning).toContainText('CALENDAR_UNVERIFIED');
  await expect(summary.getByTestId('sync-symbol-counts')).toContainText('30종목 중 24종목 통과');

  await page.route('**/api/data/sync*', route => route.fulfill({ json: syncInventory({ latest: interrupted, runs: [interrupted] }) }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(summary.getByTestId('sync-source-badge')).toHaveText('수동 실행');
  await expect(warning).toContainText('중단');
  await expect(warning).toContainText('SERVER_RESTART');
  await expect(warning).toContainText('동기화 중 서버가 재시작됐습니다.');

  await page.route('**/api/data/sync*', route => route.fulfill({ json: syncInventory({ latest: failed, runs: [failed] }) }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(summary.getByTestId('sync-source-badge')).toHaveText('장후 동기화');
  await expect(warning).toContainText('실패');
  await expect(warning).toContainText('REFERENCE_UNAVAILABLE');

  await page.route('**/api/data/sync*', route => route.fulfill({ json: syncInventory({ active: running, latest: failed, runs: [running, failed] }) }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(summary.getByTestId('sync-source-badge')).toHaveText('수동 실행');
  await expect(summary.getByTestId('sync-warning-badge')).toHaveCount(0);
});

test('sync handles 503 fallback, malformed JSON, empty history, mobile 390px layout and keyboard focus', async ({ page }) => {
  const succeeded = syncRun({ totalSymbols: 30, succeededSymbols: 30 });
  await setup(page, [run()], syncInventory({ latest: succeeded, runs: [succeeded] }));
  await page.goto('/data');
  const summary = page.getByTestId('sync-summary');
  await expect(summary.getByTestId('sync-symbol-counts')).toContainText('30종목 중 30종목 통과');

  await page.route('**/api/data/sync*', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  const alert = summary.getByRole('alert');
  await expect(alert).toContainText('시세 동기화 조회 실패');
  await expect(alert).toContainText('이전 표시는 최신 확인값이 아닙니다.');
  await expect(summary.getByTestId('sync-symbol-counts')).toContainText('30종목 중 30종목 통과');
  await expect(summary.getByTestId('sync-scope-notice')).toHaveText(scopeNotice);

  await page.route('**/api/data/sync*', route => route.fulfill({ json: { active: { bad: true }, runs: 'not-array' } }));
  await page.reload();
  await expect(summary.getByRole('alert')).toContainText('시세 동기화 조회 실패');
  await expect(summary.getByTestId('sync-scope-notice')).toHaveText(scopeNotice);
  await expect(page.getByRole('region', { name: 'DEMO 합성 데이터' })).toBeVisible();

  await page.route('**/api/data/sync*', route => route.fulfill({ json: syncInventory({ active: null, latest: null, runs: [] }) }));
  await page.reload();
  await expect(summary.getByText('기록된 시세 동기화가 없습니다', { exact: true })).toBeVisible();
  await expect(summary.getByTestId('sync-scope-notice')).toHaveText(scopeNotice);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const jump = page.getByRole('link', { name: '시세 동기화', exact: true });
  await jump.focus();
  await jump.press('Enter');
  await expect(page.getByRole('region', { name: '최근 시세 동기화', exact: true })).toBeFocused();
});

test('DailyDetail renders triggerSource badges for post_close_sync, manual_sync, manual and omitted', async ({ page }) => {
  const postCloseRun = run({
    id: '10000000-0000-4000-8000-000000000001',
    code: '005930',
    triggerSource: 'post_close_sync',
    syncRunId: '11111111-1111-4111-8111-111111111111',
  });
  const manualSyncRun = run({
    id: '10000000-0000-4000-8000-000000000002',
    code: '000660',
    triggerSource: 'manual_sync',
    syncRunId: '22222222-2222-4222-8222-222222222222',
  });
  const manualRun = run({
    id: '10000000-0000-4000-8000-000000000003',
    code: '035420',
    triggerSource: 'manual',
  });
  const legacyRun = run({
    id: '10000000-0000-4000-8000-000000000004',
    code: '069500',
  });

  await setup(page, [postCloseRun, manualSyncRun, manualRun, legacyRun]);
  await page.goto('/data');
  const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  const picker = page.getByRole('combobox', { name: '일봉 수집 기록' });

  const cases = [
    { id: postCloseRun.id, label: '장후 동기화', cls: /sync-source-chip--post-close/ },
    { id: manualSyncRun.id, label: '수동 실행', cls: /sync-source-chip--manual/ },
    { id: manualRun.id, label: '수동 실행', cls: /sync-source-chip--manual/ },
    { id: legacyRun.id, label: '수동 실행', cls: /sync-source-chip--manual/ },
  ];

  for (const item of cases) {
    await picker.selectOption(item.id);
    await expect(detail.locator('.toolbar .badge')).toHaveCount(3);
    await detail.getByText('수집 시각·출처·기록 ID', { exact: true }).click();
    const badge = detail.getByTestId('daily-source-badge');
    await expect(badge).toHaveText(item.label);
    await expect(badge).toHaveClass(item.cls);
    await expect(detail.getByTestId('daily-scope-notice')).toHaveText(scopeNotice);
  }
});

test('morningScan summary renders with badge, targetDate, counts, KST time and stays visible when displayRun is absent', async ({ page }) => {
  const succeeded = syncRun({ totalSymbols: 30, succeededSymbols: 30 });
  const scanWithIncomplete = {
    source: 'morning_scan' as const,
    targetDate: '20261112',
    checkedAt: '2026-11-12T23:35:00.000Z',
    targetCount: 30,
    passedCount: 27,
    incompleteCount: 3,
  };
  await setup(page, [run()], syncInventory({ morningScan: scanWithIncomplete, latest: succeeded, runs: [succeeded] }));
  await page.goto('/data');

  const summary = page.getByTestId('sync-summary');
  const scanBox = summary.getByTestId('morning-scan-summary');
  await expect(scanBox).toBeVisible();
  const scanBadge = scanBox.getByTestId('morning-scan-source-badge');
  await expect(scanBadge).toHaveText('장전 스캔');
  await expect(scanBadge).toHaveClass(/sync-source-chip--morning-scan/);
  await expect(scanBox).toContainText('기준일 2026-11-12');
  await expect(scanBox).toContainText('30종목 중 27종목 통과');
  await expect(scanBox).toContainText('미완료 3종목');
  await expect(scanBox.locator('time')).toHaveAttribute('datetime', '2026-11-12T23:35:00.000Z');
  await expect(scanBox.locator('time')).toHaveText('2026-11-13 08:35:00 KST');

  const scanAllPassed = {
    source: 'morning_scan' as const,
    targetDate: '20261113',
    checkedAt: '2026-11-13T00:05:00.000Z',
    targetCount: 20,
    passedCount: 20,
    incompleteCount: 0,
  };
  await page.route('**/api/data/sync*', route => route.fulfill({
    json: syncInventory({ morningScan: scanAllPassed, active: null, latest: null, runs: [] }),
  }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(scanBox).toBeVisible();
  await expect(scanBadge).toHaveText('장전 스캔');
  await expect(scanBox).toContainText('기준일 2026-11-13');
  await expect(scanBox).toContainText('20종목 중 20종목 통과');
  await expect(scanBox).not.toContainText('미완료');
  await expect(scanBox.locator('time')).toHaveText('2026-11-13 09:05:00 KST');
  await expect(summary).toContainText('기록된 시세 동기화가 없습니다');
});

test('running active sync coexists with previous warning block without false active failure and stays overflow-free on 390px mobile', async ({ page }, testInfo) => {
  const running = syncRun({
    runId: '66666666-6666-4666-8666-666666666666',
    trigger: 'manual',
    sourceLabel: '수동 실행',
    status: 'running',
    reasonCode: null,
    totalSymbols: 30,
    succeededSymbols: 5,
    finishedAt: null,
  });
  const failedLatest = syncRun({
    runId: '55555555-5555-4555-8555-555555555555',
    trigger: 'post_close',
    sourceLabel: '장후 동기화',
    status: 'failed',
    reasonCode: 'REFERENCE_UNAVAILABLE_LONG_REASON_CODE',
    totalSymbols: 30,
    succeededSymbols: 0,
    failedSymbols: 30,
    startedAt: '2026-11-13T06:05:00.000Z',
    finishedAt: '2026-11-13T06:10:00.000Z',
    summary: { ...syncRun().summary, message: '기준 종목 069500 일봉 조회에 실패했습니다.' },
  });
  const morningScan = {
    source: 'morning_scan' as const,
    targetDate: '20261113',
    checkedAt: '2026-11-12T23:35:00.000Z',
    targetCount: 30,
    passedCount: 28,
    incompleteCount: 2,
  };
  await setup(page, [run({ triggerSource: 'post_close_sync' })], syncInventory({
    morningScan,
    active: running,
    latest: failedLatest,
    runs: [running, failedLatest],
  }));
  await page.goto('/data');

  const summary = page.getByTestId('sync-summary');
  await expect(summary.getByTestId('sync-source-badge')).toHaveText('수동 실행');
  await expect(summary).toContainText('동기화 중');
  await expect(summary.getByTestId('sync-warning-badge')).toHaveCount(0);

  const prevWarning = summary.getByTestId('sync-previous-warning');
  await expect(prevWarning).toBeVisible();
  await expect(prevWarning).toContainText('직전 실행');
  await expect(prevWarning).toContainText('실패');
  await expect(prevWarning).toContainText('REFERENCE_UNAVAILABLE_LONG_REASON_CODE');
  await expect(prevWarning.locator('time')).toHaveAttribute('datetime', '2026-11-13T06:10:00.000Z');
  await expect(prevWarning.locator('time')).toHaveText('2026-11-13 15:10:00 KST');
  await expect(prevWarning).toContainText('기준 종목 069500 일봉 조회에 실패했습니다.');

  const detail = page.getByRole('region', { name: '일봉 수집 상세' });
  await detail.getByText('수집 시각·출처·기록 ID', { exact: true }).click();
  await expect(detail.getByTestId('daily-source-badge')).toHaveText('장후 동기화');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('sync-issue-221-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const jump = page.getByRole('link', { name: '시세 동기화', exact: true });
  await jump.focus();
  await jump.press('Enter');
  await expect(page.getByRole('region', { name: '최근 시세 동기화', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('sync-issue-221-mobile.png'), fullPage: true });

  const succeededLatest = syncRun({
    runId: '77777777-7777-4777-8777-777777777777',
    status: 'succeeded',
    reasonCode: null,
  });
  await page.route('**/api/data/sync*', route => route.fulfill({
    json: syncInventory({ active: running, latest: succeededLatest, runs: [running, succeededLatest] }),
  }));
  await page.getByRole('button', { name: '저장 상태 새로고침', exact: true }).click();
  await expect(summary.getByTestId('sync-previous-warning')).toHaveCount(0);
  await expect(summary.getByTestId('sync-warning-badge')).toHaveCount(0);
});
