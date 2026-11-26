import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyCalendar, krxTradingDates } from '../shared/krx-calendar.ts';

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { dailyRunSchema } from '../shared/data-inventory.ts';
import type { DailyRun } from '../shared/market-data.ts';
import { Store } from '../server/store.ts';
import { MarketDataSync } from '../server/market-sync.ts';
import { MarketData } from '../server/market-data.ts';
import { KisClient } from '../server/kis.ts';
import { startTestServer } from './test-server.ts';
import { defaultOncePolicy } from '../shared/trading-policy.ts';
import { saveTradingDraft, fixTradingDraft, readPreparedRun } from '../server/trading-plans.ts';

test('reference volume, missing special notice and snapshot expiry fail closed', () => {
  const dates = krxTradingDates('20261118', '20261120');
  const bars = dates.map((date) => ({ date, volume: 1 }));
  assert.equal(verifyCalendar('20261118', '20261120', bars).verified, true);
  assert.equal(verifyCalendar('20261118', '20261120', bars, () => undefined).verified, false);
  assert.equal(verifyCalendar('20251118', '20261120', bars).verified, false);
  assert.deepEqual(
    verifyCalendar(
      '20261118',
      '20261120',
      bars.map((b) => ({ ...b, volume: b.date === '20261119' ? 0 : 1 })),
    ).mismatch,
    ['20261119'],
  );
});

const creds = { key: 'test-key', secret: 'test-secret', account: '00000000', product: '01' };
function seed(store: Store) {
  store.saveMasters([
    {
      exchange: 'KOSPI',
      source: 'fixture',
      collectedAt: new Date().toISOString(),
      sha256: 'a'.repeat(64),
      rows: ['069500', '005930', '229200'].map((code) => ({
        code,
        exchange: 'KOSPI',
        kind: code === '005930' ? 'stock' : 'etf',
        isin: 'KR7000000000',
        name: code,
        group: code === '005930' ? 'ST' : 'EF',
        tradingHalted: false,
        liquidation: false,
      })),
    },
  ]);
}
const headers = { 'x-workbench': 'local', 'content-type': 'application/json' };
test('concurrent HTTP calls share one serial run with stale configured credentials and atomic morning projection', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-26T16:00:00+09:00') });
  const store = new Store(':memory:');
  seed(store);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const codes: string[] = [];
  let pending = 0,
    peak = 0,
    mismatch = false, failSymbol = false;
  const kis = new KisClient(
    creds,
    async (url) => {
      if (String(url).endsWith('/tokenP'))
        return Response.json({ access_token: 'fixture', expires_in: 3600 });
      const q = new URL(String(url)).searchParams;
      codes.push(q.get('FID_INPUT_ISCD')!);
      if (failSymbol && q.get('FID_INPUT_ISCD') === '229200') return new Response('', {status:503});
      peak = Math.max(peak, ++pending);
      assert.equal(Reflect.get(kis, 'pending'), 1);
      try {
        await gate;
        assert.equal(q.get('FID_INPUT_DATE_1'), '20260927');
        assert.equal(q.get('FID_INPUT_DATE_2'), '20261126');
        assert.equal(q.get('FID_ORG_ADJ_PRC'), '1');
        const dates = krxTradingDates('20260927', '20261126');
        return Response.json({
          rt_cd: '0',
          output2: dates.map((d, i) => ({
            stck_bsop_date: d,
            stck_oprc: '100',
            stck_clpr: '100',
            stck_hgpr: '100',
            stck_lwpr: '100',
            acml_vol: mismatch && !i ? '0' : '1',
          })),
        });
      } finally {
        pending--;
      }
    },
    0,
  );
  const original = kis.connection.bind(kis);
  t.mock.method(kis, 'connection', () => {
    const c = original();
    c.status.phase = 'stale';
    return c;
  });
  const server = await startTestServer(store, kis);
  const url = server.url + '/api/data/sync';
  const start = (trigger = 'post_close') =>
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ trigger, targetDate: '20261126', includeMaster: false }),
    });
  const finished = async () => {
    for (let n = 0; n < 200; n++) {
      const data = await (await fetch(url)).json();
      if (!data.active) return data.latest;
      await delay(5);
    }
    throw Error('sync timeout');
  };
  try {
    assert.equal((await (await fetch(url)).json()).morningScan, null);
    store.saveMorningScanSymbol('000001', '20261120', 'old', 'incomplete', []);
    store.saveMorningScanSymbol('000002', '20261125', 'a', 'passed', []);
    store.saveMorningScanSymbol('069500', '20261125', 'a', 'passed', []);
    t.mock.timers.tick(1000);
    const lastMorningCheck = new Date().toISOString();
    store.saveMorningScanSymbol('000003', '20261125', 'b', 'incomplete', []);
    assert.equal((await (await fetch(url)).json()).morningScan.targetCount, 3);
    t.mock.timers.tick(1000);
    const direct = await fetch(server.url + '/api/data/daily', {
      method: 'POST', headers, body: JSON.stringify({ id: randomUUID(), code: '000001',
        from: '20261125', to: '20261125', adjustment: 'raw' }),
    });
    const manual = dailyRunSchema.parse((await direct.json()).run);
    assert.equal(manual.triggerSource, 'manual');
    assert.equal(manual.syncRunId, undefined);
    const [a,b] = await Promise.all([start(),start()]);
    assert.equal(a.status, 202);
    assert.equal(b.status, 202);
    const first = await a.json(),
      second = await b.json();
    assert.equal(first.runId, second.runId);
    assert.deepEqual([first.deduplicated,second.deduplicated].sort(), [false,true]);
    const busy = await fetch(server.url+'/api/data/master/refresh',{method:'POST',headers,body:'{}'});
    assert.equal(busy.status,409);
    assert.equal(dailyRunSchema.parse(store.dailyRuns()[0]).triggerSource, 'post_close_sync');
    assert.equal(store.dailyRuns()[0].syncRunId, first.runId);
    release();
    const result = await finished();
    assert.equal(result.status, 'succeeded');
    assert.equal(result.succeededSymbols, 3);
    assert.equal(peak, 1);
    assert.deepEqual(codes, ['069500', '229200', '005930']);
    assert.ok(store.morningRecentBars('20260927', '20261127', '2100-01-01').size === 3);
    assert.deepEqual((await (await fetch(url)).json()).morningScan, {
      source: 'morning_scan', targetDate: '20261125', checkedAt: lastMorningCheck,
      targetCount: 2, passedCount: 1, incompleteCount: 1,
    });
    failSymbol=true;
    assert.equal((await start('manual')).status,202);
    const partial = await finished();
    assert.equal(partial.status,'partial');
    assert.equal(partial.succeededSymbols,2);
    assert.equal(store.dailyRuns().filter(r => r.syncRunId === partial.runId && r.triggerSource === 'manual_sync').length, 3);
    assert.deepEqual(partial.summary.failures,[{code:'229200',reason:'DAILY_FAILED'}]);
    failSymbol=false;
    mismatch = true;
    assert.equal((await start()).status, 202);
    assert.equal((await finished()).calendarVerified, false);
    assert.equal(store.dailyRuns().filter((r) => r.quality.state === 'unverified').length, 3);
  } finally {
    release();
    await server.close();
    store.close();
  }
});

test('expired calendar and absent special notice persist unverified raw bars only', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-27T10:00:00+09:00') });
  const store = new Store(':memory:');
  const client = new KisClient(creds, async () => {
    throw Error('unexpected network');
  });
  const market = new MarketData(store, client);
  const sync = new MarketDataSync(store, client, market, () => false);
  t.mock.method(client, 'dailyPage', async (_input: unknown, from: string, to: string) =>
    krxTradingDates(from, to).map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1 })),
  );
  try {
    seed(store);
    t.mock.method(market, 'noticeFor', () => undefined);
    for (const date of ['20260130', '20261126']) {
      assert.equal(sync.start({ targetDate: date, includeMaster: false, limit: 1 }).code, 202);
      for (let i = 0; sync.running && i < 100; i++) await delay(1);
      const run = sync.inventory(1).latest!;
      assert.equal(run.calendarVerified, false);
      assert.equal(run.summary.tier1Truncated, true);
      assert.deepEqual(run.summary.omitted, ['229200']);
      const daily = store.dailyRuns(1)[0];
      assert.equal(daily.quality.state, 'unverified');
      assert.ok(store.dailyBars(daily.id).length);
      assert.equal(store.morningRecentBars(daily.from, daily.to, '2100-01-01').size, 0);
    }
  } finally {
    store.close();
  }
});

test('dedicated approval returns 409 without sync ledger entries', async () => {
  const store = new Store(':memory:');
  const server = await startTestServer(store, new KisClient(creds), {
    date: '2026-11-26',
    requestId: randomUUID(),
  });
  try {
    const r = await fetch(server.url + '/api/data/sync', { method: 'POST', headers, body: '{}' });
    assert.equal(r.status, 409);
    assert.equal((await r.json()).reasonCode, 'DEDICATED_RUN_ACTIVE');
    assert.equal(store.syncRuns(1).length, 0);
  } finally {
    await server.close();
    store.close();
  }
});

test('restart migrates old metadata and records interrupted versus partial by persisted progress', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sync-restart-')),
    path = join(directory, 'test.db');
  try {
    const store = new Store(path);
    store.close();
    const db = new DatabaseSync(path);
    db.exec(
      "ALTER TABLE morning_scan_meta DROP COLUMN source; INSERT INTO morning_scan_meta VALUES ('005930','20261126','hash','passed','then')",
    );
    for (const [id, count, master] of [
      ['none', 0, 0],
      ['bars', 1, 0],
      ['master', 0, 1],
    ] as const)
      db.prepare(
        "INSERT INTO market_sync_runs(id,trigger,source_label,target_date,status,scope_limit,started_at,summary_json,succeeded_symbols,master_refreshed)VALUES (?,'manual','수동 실행','20261126','running',1,'now','{}',?,?)",
      ).run(id, count, master);
    db.close();
    const recovered = new Store(path);
    for (const run of recovered.syncRuns(5)) {
      assert.equal(run.status, run.runId === 'none' ? 'interrupted' : 'partial');
      assert.equal(run.reasonCode, 'SERVER_RESTART');
      assert.ok(run.finishedAt);
    }
    recovered.close();
    const reader = new DatabaseSync(path, { readOnly: true });
    assert.equal(reader.prepare('SELECT source FROM morning_scan_meta').get()?.source, 'morning_scan');
    reader.close();
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test('prepared checkInstrument reads committed ready master during download and WAL writer transaction', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-19T12:00:00+09:00') });
  const directory = mkdtempSync(join(tmpdir(), 'sync-reader-')),
    store = new Store(join(directory, 'source.sqlite'));
  const writer = new DatabaseSync(store.path);
  const kis = new KisClient(creds);
  try {
    seed(store);
    const date = '2026-11-19';
    const terms = {
      kind: 'once',
      date,
      code: '005930',
      orderType: 'limit',
      maxQty: 1,
      maxAmount: 200000,
      allowExistingHolding: false,
      cancelProbe: false,
      policy: defaultOncePolicy(date),
    };
    const draft = saveTradingDraft(store, { expectedId: null, terms }).draft;
    const pin = fixTradingDraft(store, kis, { kind: 'once', expectedId: draft.id }).draft;
    const file = join(directory, 'trading-runs', 'approval-' + draft.id, 'approval-' + pin.runId + '.json');
    const check = readPreparedRun(file, 'once').checkInstrument!;
    assert.equal(writer.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal');
    const market = new MarketData(store, kis, async (url) => {
      check();
      const exchange = String(url).includes('kospi') ? 'kospi' : 'kosdaq';
      return new Response(readFileSync(new URL('./fixtures/' + exchange + '-master.zip', import.meta.url)));
    });
    const exec = DatabaseSync.prototype.exec;
    let duringSwap = false,
      readerTimeout = 0;
    t.mock.method(DatabaseSync.prototype, 'exec', function (this: DatabaseSync, sql: string) {
      exec.call(this, sql);
      if (sql === 'DELETE FROM market_instruments') {
        assert.equal(this.prepare('PRAGMA busy_timeout').get()?.timeout, 5000);
        assert.equal(this.prepare('SELECT COUNT(*) AS n FROM market_instruments').get()?.n, 0);
        check();
        duringSwap = true;
      }
      if (sql === 'PRAGMA busy_timeout = 5000; BEGIN')
        readerTimeout = Number(this.prepare('PRAGMA busy_timeout').get()?.timeout);
    });
    await market.syncMastersAtomic();
    assert.ok(duringSwap);
    assert.equal(readerTimeout, 5000);
    assert.ok(store.masterData().sources.every((s) => s.phase === 'ready'));
  } finally {
    writer.close();
    store.close();
    rmSync(directory, { recursive: true });
  }
});

test('completed sync retention preserves usable bars, resumable runs, snapshot references and other groups', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sync-retention-'));
  const store = new Store(join(directory, 'test.db'));
  const db = new DatabaseSync(store.path);
  try {
    const market = new MarketData(store, new KisClient(creds, async () => { throw Error('unexpected fetch'); }));
    const manual = market.start({ id: randomUUID(), code: '005930', from: '20261101', to: '20261120', adjustment: 'raw' });
    const template: DailyRun = { ...manual, triggerSource: 'manual_sync', syncRunId: randomUUID(), nextDate: null,
      coverageComplete: true, quality: { ...manual.quality, state: 'passed' },
      status: { ...manual.status, phase: 'ready', complete: true } };
    const save = (overrides: Partial<DailyRun> = {}) => {
      const run = { ...template, id: randomUUID(), ...overrides };
      store.saveDaily(run, [{ date: run.to, code: run.code, adjustment: run.adjustment, source: 'kis-rest',
        collectedAt: run.startedAt, open: 1, low: 1, high: 1, close: 1, volume: 1 }]);
      return run.id;
    };
    const pinned = [randomUUID(), randomUUID()];
    db.prepare('INSERT INTO backtest_experiments VALUES (?,?)').run('fixture',
      JSON.stringify({ snapshot: { input: { runId: pinned[0] }, collection: { id: pinned[1] } } }));
    const protectedIds = [
      save({ id: manual.id, triggerSource: 'manual', syncRunId: undefined }),
      save({ triggerSource: undefined, syncRunId: undefined }),
      save({ nextDate: template.to, coverageComplete: false }),
      save({ status: { ...template.status, phase: 'loading' } }),
      save({ code: '000001' }), save({ adjustment: 'adjusted' }),
      ...pinned.map(id => save({ id })),
    ];
    const obsolete = Array.from({ length: 15 }, () => save());
    const freshest = save({ triggerSource: 'post_close_sync' });
    const historical = save({ to: '20261115' });
    const last = save({ quality: { ...template.quality, state: 'failed' }, status: { ...template.status, phase:'partial', complete:false } });
    assert.equal(store.dailyRuns().length, protectedIds.length + 2);
    for (const id of [...protectedIds, freshest, last]) {
      assert.ok(store.dailyRun(id));
      assert.equal(store.dailyBars(id).length, 1);
    }
    for (const id of [...obsolete, historical]) {
      assert.equal(store.dailyRun(id), undefined);
      assert.deepEqual(store.dailyBars(id), []);
    }
    // Force failure after the linked bars have been deleted.
    db.exec("CREATE TRIGGER fail_prune BEFORE DELETE ON daily_runs BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
    assert.throws(() => save(), /fixture rollback/);
    assert.equal(store.dailyRuns().length, protectedIds.length + 2);
    assert.equal(store.dailyBars(last).length, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_bars').get()?.n, protectedIds.length + 2);
  } finally {
    db.close(); store.close(); rmSync(directory, { recursive: true });
  }
});
