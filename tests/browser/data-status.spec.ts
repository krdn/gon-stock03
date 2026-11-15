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
  await expect(detail).toContainText('중복 제거 2건'); await expect(detail).toContainText('KIS 호출 제한');
  await expect(detail.getByTestId('daily-last-success')).toContainText(successAt);
  await page.getByRole('combobox', { name: '일봉 수집 기록' }).selectOption(previous.id);
  await expect(detail).toContainText('수집 후 오래됨');
  await page.getByRole('combobox', { name: '일봉 수집 기록' }).selectOption(run().id);
  await detail.getByText('저장 거래일 펼치기').click(); await expect(detail).toContainText('2026-01-02');
  const masterRegion = page.getByRole('region', { name: '공개 마스터 상태' });
  await expect(masterRegion).toContainText('수집 실패'); await expect(masterRegion).toContainText(successAt);
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
  await page.reload(); await expect(page.getByRole('alert').filter({ hasText: '일봉 목록 조회 실패' })).toBeVisible();
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
  await expect(detail.getByTestId('daily-last-success')).toContainText(successAt);
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
