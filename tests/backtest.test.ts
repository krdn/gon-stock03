import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';
import { KisClient } from '../server/kis.ts';
import { dailyFixture } from './backtest-fixture.ts';

async function serve(store: Store) {
  let calls = 0;
  const kis = new KisClient({ key: '', secret: '', account: '', product: '' }, async () => { calls++; throw new Error('No upstream calls permitted'); }, 0);
  const server = makeServer(store, kis, [4331]); server.listen(4331, '127.0.0.1'); await once(server, 'listening');
  return { calls: () => calls, async request(path: string, input?: unknown) {
    const response = await fetch('http://127.0.0.1:4331/api/' + path, input === undefined ? { headers: { Connection: 'close' } } : { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify(input) });
    return { status: response.status, data: await response.json() as any };
  }, async close() { server.closeAllConnections(); server.close(); await once(server, 'close'); } };
}

test('stored daily experiment uses next open, exact costs/drawdown and no broker or demo mutations', async () => {
  const store = new Store(':memory:'), { run, bars, input } = dailyFixture(); store.saveDaily(run, bars);
  const api = await serve(store), before = store.read();
  try {
    const response = await api.request('backtest/daily', input); assert.equal(response.status, 200);
    const { experiment } = response.data, result = experiment.result;
    assert.equal(result.trades[0].bar, 6); assert.equal(result.trades[0].date, bars[6].date); assert.equal(result.trades[0].signalDate, bars[5].date);
    assert.equal(result.trades[0].price, 20 * 1.0005); assert.equal(result.trades[0].qty, 4992); assert.equal(result.trades[0].fee, 100);
    let cash = input.capital, qty = 0, fees = 0, slippage = 0, peak = input.capital, mdd = 0;
    bars.forEach((bar, i) => {
      for (const t of result.trades.filter((t: any) => t.bar === i)) {
        const cost = Math.ceil(t.price * t.qty * input.feeBps / 10000); assert.equal(t.fee, cost);
        cash += (t.side === 'buy' ? -1 : 1) * t.price * t.qty - cost; qty += (t.side === 'buy' ? 1 : -1) * t.qty; fees += cost;
        slippage += Math.abs(t.price - bar.open) * t.qty;
      }
      const value = cash + qty * bar.close; assert.equal(result.equity[i], value); peak = Math.max(peak, value); mdd = Math.max(mdd, (peak - value) / peak * 100);
    });
    assert.equal(result.finalEquity, cash + qty * bars.at(-1)!.close); assert.equal(result.fees, fees); assert.equal(result.slippageCost, slippage); assert.equal(result.maxDrawdown, mdd);
    assert.equal(result.returnPct, (result.finalEquity / input.capital - 1) * 100);
    assert.equal(experiment.inputHash.length, 64); assert.equal(experiment.snapshot.bars.length, bars.length);
    assert.equal(api.calls(), 0); assert.deepEqual(store.read(), before); assert.deepEqual(store.paperOrders(), []);
  } finally { await api.close(); store.close(); }
});

test('selected range excludes future bars and changing future observations cannot rewrite earlier trades', async () => {
  const store = new Store(':memory:'), first = dailyFixture(); store.saveDaily(first.run, first.bars);
  const second = dailyFixture(); second.run.id = '96b3f123-f72e-4d77-9091-72a057ce26e4';
  second.bars = second.bars.map((b, i) => i < 10 ? b : { ...b, close: 1000 + i, open: 900, high: 2000 }); store.saveDaily(second.run, second.bars);
  const api = await serve(store);
  try {
    const a = await api.request('backtest/daily', first.input), b = await api.request('backtest/daily', { ...first.input, runId: second.run.id });
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    assert.deepEqual(a.data.experiment.result.trades.filter((t: any) => t.bar < 10), b.data.experiment.result.trades.filter((t: any) => t.bar < 10));
    assert.deepEqual(a.data.experiment.result.equity.slice(0, 10), b.data.experiment.result.equity.slice(0, 10));
    const c = await api.request('backtest/daily', { ...first.input, to: first.bars[9].date }); assert.equal(c.status, 200);
    assert.equal(c.data.experiment.snapshot.bars.length, 10); assert.deepEqual(c.data.experiment.result.trades, a.data.experiment.result.trades.filter((t: any) => t.bar < 10));
  } finally { await api.close(); store.close(); }
});

test('rejects partial, unverified calendar, missing/duplicate/mismatched bars, insufficient sample and invalid inputs', async () => {
  for (const kind of ['partial','calendar','missing','duplicate','mismatch','zero','future','sample','range','policy','cost','period']) {
    const store = new Store(':memory:'), f = dailyFixture();
    if (kind === 'partial') f.run.coverageComplete = false;
    if (kind === 'calendar') delete f.run.calendar;
    if (kind === 'missing') f.bars.splice(7, 1);
    if (kind === 'duplicate') f.bars[7].date = f.bars[6].date;
    if (kind === 'mismatch') f.bars[6].adjustment = 'adjusted';
    if (kind === 'zero') f.bars[6].open = 0;
    if (kind === 'future') f.run.captureDate = f.run.to;
    if (kind === 'sample') f.input.to = f.bars[4].date;
    if (kind === 'range') f.input.from = '20250101';
    if (kind === 'policy') f.input.adjustment = 'adjusted';
    if (kind === 'cost') delete (f.input as any).feeBps;
    if (kind === 'period') f.input.fast = f.input.slow;
    if (kind === 'duplicate') { assert.throws(() => store.saveDaily(f.run, f.bars), /UNIQUE/); store.close(); continue; }
    store.saveDaily(f.run, f.bars); const api = await serve(store);
    try { const response = await api.request('backtest/daily', f.input); assert.equal(response.status, 400, kind); assert.ok(response.data.error, kind); }
    finally { await api.close(); store.close(); }
  }
});

test('same input is idempotent and immutable experiment survives restart and collection changes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-backtest-')), path = join(directory, 'store.sqlite');
  let store = new Store(path), api = await serve(store); const f = dailyFixture(); store.saveDaily(f.run, f.bars);
  try {
    const first = await api.request('backtest/daily', f.input); assert.equal(first.status, 200);
    const repeat = await api.request('backtest/daily', f.input); assert.deepEqual(repeat.data, first.data);
    const saved = first.data.experiment; await api.close(); store.close(); store = new Store(path); api = await serve(store);
    store.saveDaily({ ...f.run, quality: { ...f.run.quality, state: 'failed' } });
    const loaded = await api.request('backtest/experiments/' + saved.id); assert.equal(loaded.status, 200); assert.deepEqual(loaded.data.experiment, saved);
    const replay = await api.request('backtest/replay', { id: saved.id }); assert.equal(replay.status, 200); assert.equal(replay.data.matches, true); assert.deepEqual(replay.data.result, saved.result);
    const list = await api.request('backtest/experiments'); assert.equal(list.data.experiments.length, 1);
    assert.equal(api.calls(), 0);
  } finally { await api.close(); store.close(); rmSync(directory, { recursive: true }); }
});


test('failed experiment writes are not reported as saved; input corruption and result drift are detected', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-backtest-failure-')), path = join(directory, 'store.sqlite');
  const store = new Store(path), db = new DatabaseSync(path), f = dailyFixture(); store.saveDaily(f.run, f.bars); const api = await serve(store);
  try {
    db.exec("CREATE TRIGGER reject_experiment BEFORE INSERT ON backtest_experiments BEGIN SELECT RAISE(ABORT, 'fixture disk failure'); END");
    const failure = await api.request('backtest/daily', f.input); assert.equal(failure.status, 500); assert.match(failure.data.error, /저장/);
    assert.equal(store.experiments().length, 0); db.exec('DROP TRIGGER reject_experiment');
    const created = await api.request('backtest/daily', f.input); assert.equal(created.status, 200); const saved = created.data.experiment;
    const altered = structuredClone(saved); altered.result.fees += 1;
    db.prepare('UPDATE backtest_experiments SET body=? WHERE id=?').run(JSON.stringify(altered), saved.id);
    assert.equal((await api.request('backtest/replay', { id: saved.id })).data.matches, false);
    altered.snapshot.bars[6].open += 1;
    db.prepare('UPDATE backtest_experiments SET body=? WHERE id=?').run(JSON.stringify(altered), saved.id);
    const corrupt = await api.request('backtest/replay', { id: saved.id }); assert.equal(corrupt.status, 400); assert.match(corrupt.data.error, /해시/);
  } finally { await api.close(); db.close(); store.close(); rmSync(directory, { recursive: true }); }
});

test('adjusted policy is frozen separately and a no-trade experiment remains reproducible', async () => {
  const store = new Store(':memory:'), f = dailyFixture();
  f.run.adjustment = 'adjusted'; f.input.adjustment = 'adjusted';
  f.bars = f.bars.map(bar => ({ ...bar, adjustment: 'adjusted', open: 10, close: 10 })); store.saveDaily(f.run, f.bars); const api = await serve(store);
  try {
    const { status, data } = await api.request('backtest/daily', f.input); assert.equal(status, 200);
    assert.deepEqual(data.experiment.result.trades, []); assert.equal(data.experiment.result.fees, 0); assert.equal(data.experiment.result.slippageCost, 0);
    assert.equal(data.experiment.result.finalEquity, f.input.capital); assert.equal(data.experiment.result.maxDrawdown, 0); assert.equal(data.experiment.result.returnPct, 0);
    assert.equal(data.experiment.snapshot.collection.adjustment, 'adjusted');
    assert.equal((await api.request('backtest/replay', { id: data.experiment.id })).data.matches, true);
  } finally { await api.close(); store.close(); }
});
