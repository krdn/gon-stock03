import type { DailyRun, StoredBar } from '../shared/market-data.ts';
import { emptyStatus } from '../shared/status.ts';
export function dailyFixture() {
  const dates = ['20260105','20260106','20260107','20260108','20260109','20260112','20260113','20260114','20260115','20260116','20260119','20260120','20260121','20260122','20260123'];
  const prices = [10,10,10,8,7,15,16,18,17,5,4,6,8,12,15];
  const at = '2026-01-24T01:00:00.000Z';
  const run: DailyRun = { id: '86b3f123-f72e-4d77-9091-72a057ce26e4', code: '00088K', from: dates[0], to: dates.at(-1)!, adjustment: 'raw',
    source: 'kis-rest', exchange: 'KRX', endpoint: '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    startedAt: at, captureDate: '20260124', coverageComplete: true, nextDate: null,
    calendar: { source: 'https://example.test/fixture-calendar', dates },
    status: { ...emptyStatus('kis-paper'), phase: 'ready', complete: true, observedAt: at, lastSuccessAt: at, pages: 1 },
    quality: { state: 'passed', missingDates: [], unexpectedDates: [], candidateMissingDates: [], duplicates: 0, emptyWindows: [] } };
  const bars: StoredBar[] = prices.map((close, i) => ({ date: dates[i], open: i === 6 ? 20 : i === 10 ? 6 : close, high: 25, low: 1, close, volume: 100000, code: run.code, adjustment: run.adjustment, source: run.source, collectedAt: at }));
  const input = { runId: run.id, source: 'kis-rest', code: run.code, from: run.from, to: run.to, adjustment: run.adjustment, fast: 2, slow: 4, capital: 100000, feeBps: 10, slippageBps: 5 };
  return { run, bars, input };
}
