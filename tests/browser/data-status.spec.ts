import { test, expect, type Page } from '@playwright/test';
import type { DailyRun, StoredBar } from '../../shared/market-data';
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
const bars: StoredBar[] = ['20260102', '20260105'].map(date => ({ date, code: '005930', adjustment: 'adjusted', source: 'kis-rest', collectedAt: successAt, open: 100, high: 100, low: 100, close: 100, volume: 1 }));
const master = { instruments: [], removed: [], sources: [{ exchange: 'KOSPI', source: 'https://example.test/master', phase: 'error', observedAt: attemptAt, lastSuccessAt: successAt, error: '전체 교체 보류', sha256: 'fixture', count: 123 }] };
async function setup(page: Page, runs = [run()]) {
  await page.route('**/api/state', route => route.fulfill({ json: snapshot() }));
  await page.route('**/api/data/master', route => route.fulfill({ json: master }));
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
  await demo.getByRole('link', { name: /시장 탐색/ }).press('Enter');
  await expect(page).toHaveURL(/\/market$/);
  await expect(page.getByRole('heading', { name: '종목 마스터', exact: true })).toBeVisible();
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
