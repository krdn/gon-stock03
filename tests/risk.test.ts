import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { KisClient, koreaDate } from '../server/kis.ts';
import { initialState } from '../shared/fixtures.ts';
import { equity } from '../shared/model.ts';
import { advanceTick, placeOrder } from '../server/engine.ts';
import { startTestServer } from './test-server.ts';

test('risk resume rejects unknown and sending, persists halt across restart, and never cancels accepted orders', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'stock03-risk-'));
  let store = new Store(join(dir, 'risk.sqlite')), calls = 0;
  const kis = new KisClient({ key: '', secret: '', account: '', product: '' }, async () => { calls++; throw new Error('unexpected broker call'); }, 0);
  let srv = await startTestServer(store, kis);
  const post = (path: string, data: unknown) => fetch(`${srv.url}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local', Connection: 'close' }, body: JSON.stringify(data) });
  const order = { requestId: 'risk-fixture', code: '005930', side: 'buy' as const, qty: 1, price: 70000, createdAt: new Date().toISOString(), tradeDate: koreaDate(), status: 'accepted' as const, filled: 0, remaining: 1, message: 'fixture' };
  try {
    store.savePaper(order);
    assert.equal((await post('risk/halt', { halted: true })).status, 200);
    assert.equal(store.paperOrders()[0].status, 'accepted');
    await srv.close(); store.close();
    store = new Store(join(dir, 'risk.sqlite')); srv = await startTestServer(store, kis);
    assert.equal(store.read().risk.halted, true);
    for (const status of ['unknown', 'sending'] as const) {
      store.savePaper({ ...order, status });
      const response = await post('risk/halt', { halted: false });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /불명|전송/);
      assert.equal(store.read().risk.halted, true);
    }
    store.savePaper({ ...order, status: 'cancelled', remaining: 0 });
    assert.equal((await post('risk/halt', { halted: false })).status, 200);
    assert.equal(store.read().risk.halted, false);
    assert.ok(store.read().strategies.every(s => !s.active));
    assert.equal(calls, 0);
  } finally { await srv?.close(); store.close(); rmSync(dir, { recursive: true }); }
});

test('risk snapshot is local-only and reading an unset loss baseline does not initialize it', async () => {
  const store = new Store(':memory:'); let calls = 0;
  const kis = new KisClient({ key: '', secret: '', account: '', product: '' }, async () => { calls++; throw new Error('unexpected broker call'); }, 0);
  const { url, close } = await startTestServer(store, kis);
  try {
    const read = async () => (await (await fetch(`${url}/api/state`)).json()).paperRisk;
    const first = await read();
    assert.equal(first.baselineEquity, null); assert.equal(first.orders, null); assert.equal(first.unresolvedCount, 0);
    store.paperBaseline(koreaDate(), 1234567);
    assert.equal((await read()).baselineEquity, 1234567);
    assert.equal(store.paperBaseline(koreaDate(), 999999), 1234567);
    assert.equal(calls, 0);
  } finally { await close(); store.close(); }
});

test('DEMO manual and actual strategy signals share order and position limits, loss halt and sell reservations', () => {
  for (const limit of ['maxOrder', 'maxPosition'] as const) {
    const state = initialState(); const stock = state.instruments[0];
    stock.price = 15000; stock.history = [10000, 10000, 10000, 8000, 7000]; state.positions = [];
    state.startingEquity = equity(state); state.risk[limit] = 10000;
    state.strategies = [{ id: 'risk-strategy', name: '한도 검사', code: stock.code, fast: 2, slow: 4, qty: 1, active: true, lastSignal: 'hold', lastTick: -1 }];
    assert.throws(() => placeOrder(state, { requestId: 'manual', code: stock.code, side: 'buy', qty: 1, price: 15000 }), /한도|투자금/);
    advanceTick(state);
    assert.equal(state.strategies[0].lastSignal, 'buy'); assert.equal(state.orders.length, 0);
    assert.ok(state.events.some(e => e.title === '전략 주문 차단' && /한도|투자금/.test(e.detail)));
  }
  const state = initialState(); state.positions = []; state.startingEquity = state.cash; state.cash -= state.risk.dailyLoss;
  state.strategies[0].active = true; advanceTick(state);
  assert.equal(state.risk.halted, true); assert.equal(state.orders.length, 0);
  for (const source of ['manual', 'risk-strategy']) {
    const state = initialState(); state.risk.maxOrder = 10000000;
    placeOrder(state, { requestId: source, code: '005930', side: 'sell', qty: 30, price: 72800 }, source);
    assert.throws(() => placeOrder(state, { requestId: source + '-extra', code: '005930', side: 'sell', qty: 1, price: 72800 }, source), /보유/);
  }
});
