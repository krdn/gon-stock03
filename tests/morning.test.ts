import { once } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { parseNews } from '../server/morning-news.ts';
import { buildMorning } from '../server/morning.ts';
import { compareMorningPolicies, researchDecision } from '../server/morning-replay.ts';
import { disconnectedConnection } from '../shared/status.ts';
import { masterUrl, addDays } from '../shared/market-data.ts';
import { dailyFixture } from './backtest-fixture.ts';

test('장전 보고서는 공식 마스터·당시 저장한 일봉으로 산출하고 미래 뉴스·합성 시세를 제외한다', () => {
  const store = new Store(':memory:');
  try {
    const now = Date.parse('2026-02-02T08:55:00+09:00'),
      at = new Date(now).toISOString();
    const { run, bars } = dailyFixture();
    const rows = Array.from({ length: 21 }, (_, i) => ({
      ...bars[0],
      date: addDays('20260110', i),
      collectedAt: at,
      high: 20,
      low: 10,
      close: i === 20 ? 20 : 12,
      volume: i === 20 ? 200 : 100,
    }));
    store.saveDaily({ ...run, to: rows[20].date, status: { ...run.status, lastSuccessAt: at } }, rows);
    store.saveMasters([
      {
        exchange: 'KOSPI',
        collectedAt: at,
        sha256: 'a'.repeat(64),
        source: masterUrl('KOSPI'),
        rows: [
          {
            code: run.code,
            kind: 'stock',
            group: 'ST',
            isin: 'KR7000000000',
            exchange: 'KOSPI',
            name: '검증 종목',
            liquidation: false,
            tradingHalted: false,
          },
        ],
      },
    ]);
    const c = disconnectedConnection(true);
    c.balance = { cash: 1000000, totalEquity: 1000000, positions: [] };
    c.status = { ...c.status, complete: true, phase: 'ready', lastSuccessAt: at };
    const report = buildMorning(store, c, now, [], []);
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0].reference, 20);
    assert.equal(report.retainedCash! + report.candidates[0].limit, 1000000);
    const stale = buildMorning(store, c, now + 120000, [], []);
    assert.equal(stale.cash, null);
    store.saveMorning('A', report);
    store.saveMorning('A', stale);
    assert.throws(() => store.approveMorning('A', report.day, report.id, at));
    store.approveMorning('A', report.day, stale.id, at);
    assert.equal(store.morning('A', report.day)?.id, stale.id);
    assert.equal(store.morning('B', report.day), null);
    assert.equal(store.morningStopped('A', report.day, true), true);
    assert.equal(store.morningStopped('A', report.day), true);
    assert.equal(store.morningStopped('B', report.day), false);
    store.saveCarry('A', '2026-02-03', stale.id, [{ code: run.code, qty: 1 }]);
    assert.equal(store.claimCarry('A', '2026-02-03', stale.id, run.code), true);
    assert.equal(store.claimCarry('A', '2026-02-03', stale.id, run.code), false);
  } finally {
    store.close();
  }
});
test('공개 시각과 출처가 맞는 뉴스만 사용', () => {
  const xml =
    '<rss>' +
    ['2026-11-15', '2026-11-20']
      .map(
        (d) =>
          '<item><pubDate>' +
          d +
          'T00:00:00Z</pubDate><link>https://source.test/r</link><title>자료</title></item>',
      )
      .join('') +
    '</rss>';
  assert.equal(
    parseNews(xml, { publisher: 'fixture', url: 'https://source.test/rss' }, Date.parse('2026-11-16')).length,
    1,
  );
});
test('같은 가격·신호로 중단 기준을 비교하고 비용·미사용 기간·미래 신호를 구별한다', () => {
  const days = ['2026-11-16', '2026-11-17'].map((date) => ({
    date,
    cash: 1000,
    holdings: { '005930': 1 },
    open: { '005930': 100 },
    close: { '005930': 200 },
    events: [
      { at: date + 'T01:01:00Z', signalAt: date + 'T01:00:00Z', code: '005930', price: 80, side: 'buy', qty: 1 },
    ],
  }));
  const input = { source: '격리 합성 관측', feeBps: 10, slippageBps: 10, testFrom: days[1].date, days };
  const result = compareMorningPolicies(input);
  assert.equal(result.samples[0].fixed, result.samples[0].hold);
  assert.ok(result.samples[0].unrestricted > result.samples[0].fixed);
  assert.ok(
    result.samples[0].unrestricted <
      compareMorningPolicies({ ...input, feeBps: 0, slippageBps: 0 }).samples[0].unrestricted,
  );
  assert.equal(researchDecision(input, '2026-11-18').verified, false);
  assert.throws(() => researchDecision(input, '2026-11-17'));
  days[0].events[0].signalAt = days[0].events[0].at;
  assert.throws(() => compareMorningPolicies(input));
});

test('새 ETF의 구성 조회 실패는 해당 ETF만 보류하고, 기존 보유 ETF 확인 실패는 신규 배분을 보류한다', async () => {
  const { applyExposure } = await import('../server/morning-exposure.ts');
  const { KisClient } = await import('../server/kis.ts');
  const store = new Store(':memory:');
  const client = new KisClient(
    { key: 'test', secret: 'test', account: '00000000', product: '01' },
    async () => {
      throw new Error('offline fixture');
    },
    0,
  );
  const instrument = {
    exchange: 'KOSPI' as const,
    isin: 'KR0000000000',
    name: '종목',
    group: 'ST',
    kind: 'stock' as const,
  };
  const report = buildMorning(store, disconnectedConnection(false), Date.now(), [], []);
  const term = {
    code: '005930',
    name: '종목',
    held: 0,
    closes: [],
    asOf: '20261120',
    reference: 10,
    exit: 8,
    limit: 100,
    relativeVolume: 2,
  };
  try {
    store.saveMasters([
      {
        exchange: 'KOSPI',
        source: masterUrl('KOSPI'),
        collectedAt: new Date().toISOString(),
        sha256: 'b'.repeat(64),
        rows: [
          { ...instrument, code: '005930' },
          { ...instrument, code: '069500', group: 'EF', kind: 'etf' },
        ],
      },
    ]);
    report.cash = 1000;
    report.candidates = [{ ...term }, { ...term, code: '069500' }];
    await applyExposure(report, store, client);
    assert.equal(report.exposureComplete, true);
    assert.deepEqual(
      report.candidates.map((p) => p.limit),
      [100, 0],
    );
    report.holdings = [{ code: '069500', name: '기존 ETF', qty: 1, value: 100 }];
    await applyExposure(report, store, client);
    assert.equal(report.exposureComplete, false);
    assert.deepEqual(
      report.candidates.map((p) => p.limit),
      [0, 0],
    );
  } finally {
    store.close();
  }
});
test('장후 다시 작성해도 승인 가능한 장전 원본을 보존한다', async () => {
  const { makeServer } = await import('../server/http.ts');
  const { KisClient } = await import('../server/kis.ts');
  const now = new Date();
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const key = 'unconfigured',
    store = new Store(':memory:');
  const report = buildMorning(store, disconnectedConnection(false), Date.parse(day + 'T08:00:00+09:00'), [], []);
  store.saveMorning(key, report);
  const server = makeServer(
    store,
    new KisClient({ key: '', secret: '', account: '', product: '' }),
    [47839],
    undefined,
    {
      config: {
        approvalKey: '',
        htsId: '',
        session: { date: day, open: '00:00', close: '15:30', verified: true },
      },
    },
  );
  server.listen(47839, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch('http://127.0.0.1:47839/api/morning/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workbench': 'local' },
      body: '{}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).report.id, report.id);
  } finally {
    server.close();
    await once(server, 'close');
    store.close();
  }
});

test('전문가 판단의 인용이 원문에 없는 경우 보고서에서 제외한다', async () => {
  const { verifiedAnalysis } = await import('../server/morning-analysis.ts');
  const docs = [
    {
      item: {
        publisher: '연구진',
        title: '공개 보고서',
        url: 'https://example.test/report',
        publishedAt: '2026-11-20T00:00:00Z',
      },
      text: 'Demand expanded in October.',
    },
  ];
  const raw = {
    takeaway: '수요 증가를 관측했어.',
    views: [{ index: 0, finding: '10월 수요 증가', quote: 'Demand expanded' }],
    counter: null,
  };
  assert.equal(verifiedAnalysis(raw, docs, 'test').views[0].url, docs[0].item.url);
  assert.throws(() =>
    verifiedAnalysis({ ...raw, counter: { ...raw.views[0], quote: 'Unexpected decline' } }, docs, 'test'),
  );
});
