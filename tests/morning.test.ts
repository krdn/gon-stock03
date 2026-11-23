import { request as httpRequest } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.ts';
import { parseNews } from '../server/morning-news.ts';
import { buildMorning } from '../server/morning.ts';
import { MorningScan } from '../server/morning-scan.ts';
import { MarketData } from '../server/market-data.ts';
import { compareMorningPolicies, researchDecision } from '../server/morning-replay.ts';
import { disconnectedConnection } from '../shared/status.ts';
import { masterUrl, addDays } from '../shared/market-data.ts';
import { dailyFixture } from './backtest-fixture.ts';
import { startTestServer } from './test-server.ts';

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
  const { KisClient } = await import('../server/kis.ts');
  const now = new Date();
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const key = 'unconfigured',
    store = new Store(':memory:');
  const report = buildMorning(store, disconnectedConnection(false), Date.parse(day + 'T08:00:00+09:00'), [], []);
  store.saveMorning(key, report);
  const srv = await startTestServer(
    store,
    new KisClient({ key: '', secret: '', account: '', product: '' }),
    undefined,
    {
      config: {
        approvalKey: '',
        htsId: '',
        session: { date: day, open: '00:00', close: '15:30', verified: true },
      },
    },
  );
  try {
    const response = await fetch(`${srv.url}/api/morning/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workbench': 'local' },
      body: '{}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).report.id, report.id);
  } finally {
    await srv.close();
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

test('매매 순기여는 실제 모의 체결금액과 종가에 양방향 비용을 적용하며 미확인 체결은 미측정', async () => {
  const { tradingContribution } = await import('../server/morning-close.ts');
  const { randomUUID } = await import('node:crypto');
  const local = {
    code: '005930',
    side: 'buy' as const,
    qty: 2,
    price: 120,
    status: 'filled' as const,
    requestId: randomUUID(),
    createdAt: '2026-11-20T01:00:00Z',
    tradeDate: '20261120',
    brokerId: '001',
    organization: '01',
    filled: 2,
    remaining: 0,
    message: '',
  };
  const row = {
    code: local.code,
    side: local.side,
    qty: 2,
    price: 120,
    date: local.tradeDate,
    filled: 2,
    remaining: 0,
    brokerId: '1',
    organization: '1',
    cancelled: false,
    name: 'fixture',
    fillAmount: 200,
  };
  const prices = new Map([[row.code, 125]]);
  assert.deepEqual(tradingContribution([local], [row], prices, { buy: 50, sell: 10 }), {
    gross: 50,
    estimatedCost: 1,
    net: 49,
    fills: 1,
  });
  assert.equal(tradingContribution([local], [], prices, undefined), null);
  assert.equal(tradingContribution([local], [row], prices, undefined)?.net, null);
});

test('MorningScan은 전용 테이블에 저장하고 incomplete 종목을 캐시하며 buildMorning으로 연결한다', async (t) => {
  const { KisClient } = await import('../server/kis.ts');
  const now = Date.parse('2026-02-02T08:50:00+09:00');
  t.mock.timers.enable({ apis: ['Date'], now });
  const store = new Store(':memory:');
  const fetchedCodes: string[] = [];
  const dates = Array.from({ length: 21 }, (_, i) => addDays('20260110', i));
  try {
    const kis = new KisClient(
      { key: 'k', secret: 's', account: '00000000', product: '01' },
      async (url) => {
        const u = String(url);
        if (u.endsWith('/tokenP')) return Response.json({ access_token: 't', expires_in: 86400 });
        const code = new URL(u).searchParams.get('FID_INPUT_ISCD')!;
        fetchedCodes.push(code);
        if (code === '00088K') {
          return Response.json({
            rt_cd: '0',
            output2: [
              {
                stck_bsop_date: dates[0],
                stck_oprc: '100',
                stck_hgpr: '110',
                stck_lwpr: '90',
                stck_clpr: '105',
                acml_vol: '50',
              },
            ],
          });
        }
        return Response.json({
          rt_cd: '0',
          output2: dates.map((d, i) => ({
            stck_bsop_date: d,
            stck_oprc: '12',
            stck_hgpr: '20',
            stck_lwpr: '10',
            stck_clpr: i === 20 ? '20' : '12',
            acml_vol: i === 20 ? '200' : '100',
          })),
        });
      },
      0,
    );
    const market = {
      refreshMaster: async () => {
        const at = new Date(now).toISOString();
        store.saveMasters([
          {
            exchange: 'KOSPI',
            collectedAt: at,
            sha256: 'a'.repeat(64),
            source: masterUrl('KOSPI'),
            rows: [
              { code: '005930', isin: 'KR7005930003', name: '삼성전자', exchange: 'KOSPI', kind: 'stock', group: 'ST', tradingHalted: false, liquidation: false },
              { code: '069500', isin: 'KR7069500007', name: 'KODEX 200', exchange: 'KOSPI', kind: 'etf', group: 'EF', tradingHalted: false, liquidation: false },
              { code: '00088K', isin: 'KR700088K001', name: '한화3우B', exchange: 'KOSPI', kind: 'stock', group: 'ST', tradingHalted: false, liquidation: false },
            ],
          },
          {
            exchange: 'KOSDAQ',
            collectedAt: at,
            sha256: 'b'.repeat(64),
            source: masterUrl('KOSDAQ'),
            rows: [],
          },
        ]);
        return store.masterData();
      },
    } as unknown as MarketData;
    const scan = new MorningScan(store, kis, market);
    await scan.collect('2026-02-02', '09:00');
    assert.equal(store.dailyRuns().length, 0);
    assert.ok(fetchedCodes.includes('005930'));
    assert.ok(fetchedCodes.includes('00088K'));
    const beforeSecond = fetchedCodes.length;
    await scan.collect('2026-02-02', '09:00');
    assert.deepEqual(fetchedCodes.slice(beforeSecond), ['069500']);

    const c = disconnectedConnection(true);
    c.balance = { cash: 1000000, totalEquity: 1000000, positions: [] };
    c.status = { ...c.status, complete: true, phase: 'ready', lastSuccessAt: new Date(now).toISOString() };
    const report = buildMorning(store, c, now, [], []);
    assert.ok(report.evaluated >= 2);
    assert.ok(report.candidates.some((item) => item.code === '005930'));
  } finally {
    store.close();
  }
});

test('장 개시 직전 시작한 generateMorning이 09:00 이후 끝나면 승인 불가 경고를 추가한다', async (t) => {
  const { KisClient } = await import('../server/kis.ts');
  const day = '2026-02-02';
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(day + 'T08:59:59+09:00') });
  const store = new Store(':memory:');
  let ticked = false;
  t.mock.method(globalThis, 'fetch', async () => {
    if (!ticked) {
      ticked = true;
      t.mock.timers.tick(2000);
    }
    return new Response('<rss></rss>', { status: 200 });
  });
  const srv = await startTestServer(
    store,
    new KisClient({ key: '', secret: '', account: '', product: '' }),
    undefined,
    {
      config: {
        approvalKey: '',
        htsId: '',
        session: { date: day, open: '09:00', close: '15:30', verified: true },
      },
    },
  );
  const postJson = (path: string, body: unknown) =>
    new Promise<{ status: number; data: any }>((resolve, reject) => {
      const req = httpRequest(
        `${srv.url}${path}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-workbench': 'local', connection: 'close' },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, data: JSON.parse(Buffer.concat(chunks).toString()) }));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
  try {
    const generated = await postJson('/api/morning/generate', {});
    assert.equal(generated.status, 200);
    assert.ok(generated.data.report.gaps.some((g: string) => g.includes('당일 승인 불가')));
    const approved = await postJson('/api/morning/approve', { id: generated.data.report.id });
    assert.equal(approved.status, 400);
  } finally {
    await srv.close();
    store.close();
  }
});

test('parseNews는 이스케이프된 HTML 엔티티와 태그를 정리한다', () => {
  const xml =
    '<rss><item><pubDate>2026-11-15T00:00:00Z</pubDate><link>https://source.test/r</link>' +
    '<title>제목&amp;확인</title>' +
    '<description>&lt;p&gt;공시&#39;내용&amp;요약&lt;/p&gt;</description></item></rss>';
  const items = parseNews(xml, { publisher: 'fixture', url: 'https://source.test/rss' }, Date.parse('2026-11-16'));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, '제목&확인');
  assert.equal(items[0].summary, "공시'내용&요약");
});

test('/api/morning 저장소 오류는 장전 포트폴리오 전용 500 메시지를 반환한다', async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { KisClient } = await import('../server/kis.ts');
  const dir = mkdtempSync(join(tmpdir(), 'morning-err-'));
  const path = join(dir, 'state.sqlite');
  const store = new Store(path);
  const db = new DatabaseSync(path);
  t.mock.method(globalThis, 'fetch', async () => new Response('<rss></rss>', { status: 200 }));
  const srv = await startTestServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }));
  try {
    db.exec("CREATE TRIGGER fail_morning_insert BEFORE INSERT ON morning_reports BEGIN SELECT RAISE(ABORT, 'disk fail'); END");
    const res = await new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = httpRequest(
        `${srv.url}/api/morning/generate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-workbench': 'local', connection: 'close' },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (c) => chunks.push(c));
          response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) }));
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(res.status, 500);
    assert.match(res.body.error, /장전 포트폴리오/);
    assert.doesNotMatch(res.body.error, /매매 설정/);
  } finally {
    db.close();
    await srv.close();
    store.close();
    rmSync(dir, { recursive: true });
  }
});

test('무효 장전 스캔 봉(거래량 0)은 과거 daily_runs로 폴백하지 않으며 후속 incomplete 판정 시 이전 바가 제거된다', (t) => {
  const now = Date.parse('2026-02-02T08:55:00+09:00');
  t.mock.timers.enable({ apis: ['Date'], now });
  const store = new Store(':memory:');
  try {
    const at = new Date(now - 60000).toISOString();
    const { run, bars } = dailyFixture();
    const dates = Array.from({ length: 21 }, (_, i) => addDays('20260110', i));
    const oldBars = dates.map((d, i) => ({
      ...bars[0],
      code: '005930',
      date: d,
      collectedAt: at,
      high: 20,
      low: 10,
      close: i === 20 ? 20 : 12,
      volume: i === 20 ? 200 : 100,
    }));
    store.saveDaily(
      { ...run, code: '005930', to: dates[20], status: { ...run.status, lastSuccessAt: at } },
      oldBars,
    );
    store.saveDaily(
      { ...run, id: 'run-000660', code: '000660', to: dates[20], status: { ...run.status, lastSuccessAt: at } },
      oldBars.map((b) => ({ ...b, code: '000660' })),
    );
    store.saveMasters([
      {
        exchange: 'KOSPI',
        collectedAt: at,
        sha256: 'a'.repeat(64),
        source: masterUrl('KOSPI'),
        rows: [
          { code: '005930', kind: 'stock', group: 'ST', isin: 'KR7005930003', exchange: 'KOSPI', name: '삼성전자', liquidation: false, tradingHalted: false },
          { code: '000660', kind: 'stock', group: 'ST', isin: 'KR7000660001', exchange: 'KOSPI', name: 'SK하이닉스', liquidation: false, tradingHalted: false },
        ],
      },
      { exchange: 'KOSDAQ', collectedAt: at, sha256: 'b'.repeat(64), source: masterUrl('KOSDAQ'), rows: [] },
    ]);
    // 1) 최신 장전 스캔 봉 중 마지막 거래량이 0이면 과거 daily_runs로 폴백되지 않는다.
    const invalidScanBars = oldBars.map((b, i) => (i === 20 ? { ...b, volume: 0 } : b));
    store.saveMorningScanSymbol('005930', dates[20], 'cal-1', 'passed', invalidScanBars);
    // 2) 이전에 passed였던 종목이 이후 incomplete로 바뀌면 이전 바가 제거되어 후보에서 빠진다.
    store.saveMorningScanSymbol(
      '000660',
      dates[19],
      'cal-0',
      'passed',
      oldBars.map((b) => ({ ...b, code: '000660' })),
    );
    store.saveMorningScanSymbol('000660', dates[20], 'cal-1', 'incomplete', []);

    const c = disconnectedConnection(true);
    c.balance = { cash: 1000000, totalEquity: 1000000, positions: [] };
    c.status = { ...c.status, complete: true, phase: 'ready', lastSuccessAt: at };
    const report = buildMorning(store, c, now, [], []);
    assert.equal(report.candidates.some((p) => p.code === '005930'), false);
    assert.equal(report.candidates.some((p) => p.code === '000660'), false);
    assert.equal(report.watch.some((p) => p.code === '000660'), false);
  } finally {
    store.close();
  }
});

test('POST /api/morning/approve는 gaps에 당일 승인 불가가 있으면 createdAt이 장전이어도 차단한다', async (t) => {
  const { KisClient } = await import('../server/kis.ts');
  const day = '2026-02-02';
  const beforeOpen = Date.parse(day + 'T08:59:59+09:00');
  t.mock.timers.enable({ apis: ['Date'], now: beforeOpen });
  const store = new Store(':memory:');
  const kis = new KisClient({ key: 'k', secret: 's', account: '00000000', product: '01' }, async () => {
    throw new Error('unexpected kis call');
  }, 0);
  const srv = await startTestServer(store, kis, undefined, {
    config: { approvalKey: 'key', htsId: 'hts', session: { date: day, open: '09:00', close: '15:30', verified: true } },
  });
  try {
    const c = disconnectedConnection(true);
    c.balance = { cash: 1000000, totalEquity: 1000000, positions: [] };
    c.status = { ...c.status, complete: true, phase: 'ready', lastSuccessAt: new Date(beforeOpen).toISOString() };
    const report = buildMorning(store, c, beforeOpen, [], ['장전 마감 후 열람용 보고서 · 당일 승인 불가']);
    store.saveMorning(kis.accountFingerprint(), report);
    const res = await fetch(`${srv.url}/api/morning/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workbench': 'local', connection: 'close' },
      body: JSON.stringify({ id: report.id }),
    });
    assert.equal(res.status, 400);
  } finally {
    await srv.close();
    store.close();
  }
});

test('POST /api/morning/carry/start는 감시 불가 상태에서 KIS 이월 바인딩을 호출하지 않고 조기 차단한다', async (t) => {
  const { KisClient } = await import('../server/kis.ts');
  const day = '2026-02-02';
  const now = Date.parse(day + 'T09:10:00+09:00');
  t.mock.timers.enable({ apis: ['Date'], now });
  const store = new Store(':memory:');
  let kisCalls = 0;
  const kis = new KisClient(
    { key: 'k', secret: 's', account: '00000000', product: '01' },
    async () => {
      kisCalls++;
      return Response.json({ rt_cd: '0', output2: [] });
    },
    0,
  );
  const account = kis.accountFingerprint();
  const c = disconnectedConnection(true);
  const report = buildMorning(store, c, now - 3 * 86400000, [], []);
  Object.assign(report, {
    equity: 10000000,
    cash: 9000000,
    retainedCash: 8900000,
    candidates: [{ code: '005930', name: '삼성전자', held: 1, reference: 72000, exit: 70000, limit: 100000, relativeVolume: 2, closes: [], asOf: '20260130' }],
    exposureComplete: true,
  });
  store.saveMorning(account, report);
  store.approveMorning(account, report.day, report.id, new Date(now - 3 * 86400000).toISOString());
  store.saveCarry(account, 'next:2026-01-30', report.id, [{ code: '005930', qty: 1 }]);

  const srv = await startTestServer(store, kis, undefined, {
    // approvalKey 누락으로 canMonitorCarry가 false가 되도록 구성
    config: { approvalKey: '', htsId: 'hts', session: { date: day, open: '09:00', close: '15:30', verified: true } },
  });
  try {
    const res = await fetch(`${srv.url}/api/morning/carry/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workbench': 'local', connection: 'close' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    assert.equal(kisCalls, 0);
    assert.equal(store.pendingCarry(account), true);
  } finally {
    await srv.close();
    store.close();
  }
});

test('MorningScan에서 개장 시각 이후 발생한 KisDataError(contract)는 incomplete로 저장하지 않고 중단한다', async (t) => {
  const { KisClient } = await import('../server/kis.ts');
  const day = '2026-02-02';
  const beforeOpen = Date.parse(day + 'T08:59:59+09:00');
  t.mock.timers.enable({ apis: ['Date'], now: beforeOpen });
  const store = new Store(':memory:');
  const dates = Array.from({ length: 21 }, (_, i) => addDays('20260110', i));
  const at = new Date(beforeOpen - 60000).toISOString();
  const prevBars = dates.map((d) => ({
    code: '005930',
    date: d,
    open: 12,
    high: 20,
    low: 10,
    close: 15,
    volume: 100,
    adjustment: 'raw' as const,
    source: 'kis-rest' as const,
    collectedAt: at,
  }));
  store.saveMorningScanSymbol('005930', dates[19], 'prev-cal', 'passed', prevBars);
  try {
    const kis = new KisClient(
      { key: 'k', secret: 's', account: '00000000', product: '01' },
      async (url) => {
        const u = String(url);
        if (u.endsWith('/tokenP')) return Response.json({ access_token: 't', expires_in: 86400 });
        const code = new URL(u).searchParams.get('FID_INPUT_ISCD')!;
        if (code === '005930') {
          t.mock.timers.tick(2000);
          return Response.json({ rt_cd: '0', output2: 'invalid-contract' });
        }
        return Response.json({
          rt_cd: '0',
          output2: dates.map((d) => ({
            stck_bsop_date: d,
            stck_oprc: '12',
            stck_hgpr: '20',
            stck_lwpr: '10',
            stck_clpr: '15',
            acml_vol: '100',
          })),
        });
      },
      0,
    );
    const market = {
      refreshMaster: async () => {
        store.saveMasters([
          {
            exchange: 'KOSPI',
            collectedAt: at,
            sha256: 'a'.repeat(64),
            source: masterUrl('KOSPI'),
            rows: [
              { code: '005930', isin: 'KR7005930003', name: '삼성전자', exchange: 'KOSPI', kind: 'stock', group: 'ST', tradingHalted: false, liquidation: false },
              { code: '069500', isin: 'KR7069500007', name: 'KODEX 200', exchange: 'KOSPI', kind: 'etf', group: 'EF', tradingHalted: false, liquidation: false },
            ],
          },
          { exchange: 'KOSDAQ', collectedAt: at, sha256: 'b'.repeat(64), source: masterUrl('KOSDAQ'), rows: [] },
        ]);
        return store.masterData();
      },
    } as unknown as MarketData;
    const scan = new MorningScan(store, kis, market);
    await assert.rejects(() => scan.collect(day, '09:00'), /장전 마감/);
    const cal = (await import('node:crypto')).createHash('sha256').update(dates.join(',')).digest('hex');
    assert.equal(store.morningScannedCodes(addDays(day.replaceAll('-', ''), -1), cal).has('005930'), false);
    assert.equal(store.morningIncompleteMeta(day.replaceAll('-', ''), new Date(beforeOpen).toISOString()).has('005930'), false);
    assert.equal(store.morningRecentBars(dates[0], day.replaceAll('-', ''), new Date(beforeOpen).toISOString()).get('005930')?.length, 21);
  } finally {
    store.close();
  }
});

test('MorningScan에서 close()로 중지된 뒤 발생한 KisDataError(contract)는 incomplete로 저장하지 않고 중단한다', async (t) => {
  const { KisClient } = await import('../server/kis.ts');
  const day = '2026-02-02';
  const beforeOpen = Date.parse(day + 'T08:50:00+09:00');
  t.mock.timers.enable({ apis: ['Date'], now: beforeOpen });
  const store = new Store(':memory:');
  const dates = Array.from({ length: 21 }, (_, i) => addDays('20260110', i));
  const at = new Date(beforeOpen - 60000).toISOString();
  const prevBars = dates.map((d) => ({
    code: '005930',
    date: d,
    open: 12,
    high: 20,
    low: 10,
    close: 15,
    volume: 100,
    adjustment: 'raw' as const,
    source: 'kis-rest' as const,
    collectedAt: at,
  }));
  store.saveMorningScanSymbol('005930', dates[19], 'prev-cal', 'passed', prevBars);
  let scan!: MorningScan;
  try {
    const kis = new KisClient(
      { key: 'k', secret: 's', account: '00000000', product: '01' },
      async (url) => {
        const u = String(url);
        if (u.endsWith('/tokenP')) return Response.json({ access_token: 't', expires_in: 86400 });
        const code = new URL(u).searchParams.get('FID_INPUT_ISCD')!;
        if (code === '005930') {
          scan.close();
          return Response.json({ rt_cd: '0', output2: 'invalid-contract' });
        }
        return Response.json({
          rt_cd: '0',
          output2: dates.map((d) => ({
            stck_bsop_date: d,
            stck_oprc: '12',
            stck_hgpr: '20',
            stck_lwpr: '10',
            stck_clpr: '15',
            acml_vol: '100',
          })),
        });
      },
      0,
    );
    const market = {
      refreshMaster: async () => {
        store.saveMasters([
          {
            exchange: 'KOSPI',
            collectedAt: at,
            sha256: 'a'.repeat(64),
            source: masterUrl('KOSPI'),
            rows: [
              { code: '005930', isin: 'KR7005930003', name: '삼성전자', exchange: 'KOSPI', kind: 'stock', group: 'ST', tradingHalted: false, liquidation: false },
              { code: '069500', isin: 'KR7069500007', name: 'KODEX 200', exchange: 'KOSPI', kind: 'etf', group: 'EF', tradingHalted: false, liquidation: false },
            ],
          },
          { exchange: 'KOSDAQ', collectedAt: at, sha256: 'b'.repeat(64), source: masterUrl('KOSDAQ'), rows: [] },
        ]);
        return store.masterData();
      },
    } as unknown as MarketData;
    scan = new MorningScan(store, kis, market);
    await scan.collect(day, '09:00');
    const cal = (await import('node:crypto')).createHash('sha256').update(dates.join(',')).digest('hex');
    assert.equal(store.morningScannedCodes(addDays(day.replaceAll('-', ''), -1), cal).has('005930'), false);
    assert.equal(store.morningIncompleteMeta(day.replaceAll('-', ''), new Date(beforeOpen).toISOString()).has('005930'), false);
    assert.equal(store.morningRecentBars(dates[0], day.replaceAll('-', ''), new Date(beforeOpen).toISOString()).get('005930')?.length, 21);
  } finally {
    store.close();
  }
});

test('POST /api/morning/carry/start는 400 차단 시 next: 이월 원장을 bindNextSession으로 변경하지 않는다', async (t) => {
  const { EventEmitter } = await import('node:events');
  const { KisClient } = await import('../server/kis.ts');
  const day = '2026-02-02';
  const prevDay = '2026-01-30';
  const now = Date.parse(day + 'T09:05:00+09:00');
  t.mock.timers.enable({ apis: ['Date'], now });
  const store = new Store(':memory:');
  let dailyCalls = 0;
  const kis = new KisClient(
    { key: 'k', secret: 's', account: '00000000', product: '01' },
    async (url) => {
      const u = String(url);
      if (u.endsWith('/tokenP')) return Response.json({ access_token: 't', expires_in: 86400 });
      if (u.includes('inquire-balance')) return new Response('', { status: 500 });
      if (u.includes('inquire-daily-ccld')) return Response.json({ rt_cd: '0', output1: [] });
      dailyCalls++;
      return Response.json({
        rt_cd: '0',
        output2: [
          {
            stck_bsop_date: prevDay.replaceAll('-', ''),
            stck_oprc: '100',
            stck_hgpr: '110',
            stck_lwpr: '90',
            stck_clpr: '105',
            acml_vol: '1000',
          },
        ],
      });
    },
    0,
  );
  const account = kis.accountFingerprint();
  const c = disconnectedConnection(true);
  const r1 = buildMorning(store, c, Date.parse('2026-01-30T08:50:00+09:00'), [], []);
  Object.assign(r1, {
    equity: 10000000,
    cash: 9000000,
    retainedCash: 8900000,
    candidates: [{ code: '000660', name: 'SK하이닉스', held: 1, reference: 72000, exit: 70000, limit: 100000, relativeVolume: 2, closes: [], asOf: '20260129' }],
    exposureComplete: true,
  });
  store.saveMorning(account, r1);
  store.approveMorning(account, r1.day, r1.id, '2026-01-30T08:51:00+09:00');
  store.saveCarry(account, 'next:' + prevDay, r1.id, [{ code: '000660', qty: 1 }]);

  const rToday = buildMorning(store, c, Date.parse(day + 'T08:50:00+09:00'), [], []);
  Object.assign(rToday, {
    equity: 10000000,
    cash: 9000000,
    retainedCash: 8900000,
    candidates: [{ code: '005930', name: '삼성전자', held: 0, reference: 72000, exit: 70000, limit: 100000, relativeVolume: 2, closes: [], asOf: '20260130' }],
    exposureComplete: true,
  });
  store.saveMorning(account, rToday);

  class StubSocket extends EventEmitter {
    send() {}
    pong() {}
    terminate() {
      this.emit('close');
    }
  }
  const sockets: StubSocket[] = [];
  const srv = await startTestServer(store, kis, undefined, {
    config: { approvalKey: 'key', htsId: 'hts', session: { date: day, open: '09:00', close: '15:30', verified: true } },
    connect: () => {
      const ws = new StubSocket();
      sockets.push(ws);
      return ws as any;
    },
    now: () => now,
  });
  try {
    const approveRes = await fetch(`${srv.url}/api/morning/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workbench': 'local', connection: 'close' },
      body: JSON.stringify({ id: rToday.id }),
    });
    assert.equal(approveRes.status, 200);
    // 소켓 ack 후 autoReconcile 실패로 morningArmed=false가 되지만 socket은 005930으로 연결된 상태를 만든다.
    const ws = sockets.at(-1)!;
    ws.emit('open');
    ws.emit('message', Buffer.from(JSON.stringify({ header: { tr_id: 'H0STCNT0', tr_key: '005930' }, body: { rt_cd: '0' } })), false);
    ws.emit(
      'message',
      Buffer.from(
        JSON.stringify({
          header: { tr_id: 'H0STCNI9', tr_key: 'hts' },
          body: { rt_cd: '0', output: { key: '0123456789abcdef0123456789abcdef', iv: '0123456789abcdef' } },
        }),
      ),
      false,
    );
    await new Promise((r) => setTimeout(r, 30));

    const carryRes = await fetch(`${srv.url}/api/morning/carry/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-workbench': 'local', connection: 'close' },
      body: JSON.stringify({}),
    });
    assert.equal(carryRes.status, 400);
    assert.equal(dailyCalls, 1);
    assert.equal(store.pendingCarry(account), true);
    assert.equal(store.carry(account, day).length, 0);
  } finally {
    await srv.close();
    store.close();
  }
});
