import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';
import { KisClient } from '../server/kis.ts';
import { placeOrder, cancelOrder, advanceTick } from '../server/engine.ts';
import { initialState } from '../shared/fixtures.ts';
import { paperLedgerSchema } from '../shared/contracts.ts';

const input = () => ({ requestId: randomUUID(), code: '005930', side: 'buy' as const, qty: 1, price: 80000 });

test('DEMO cancel-first never fills, fill-first refuses cancel, and a cancelled sell frees reserved holdings', () => {
  const state = initialState(); const cash = state.cash, held = state.positions.find(p => p.code === '005930')!.qty;
  const cancelled = placeOrder(state, input()); cancelOrder(state, cancelled.id); advanceTick(state);
  assert.equal(cancelled.status, 'cancelled'); assert.equal(state.cash, cash); assert.equal(state.positions.find(p => p.code === '005930')!.qty, held);
  assert.throws(() => cancelOrder(state, cancelled.id), /미체결/);
  const filled = placeOrder(state, input()); advanceTick(state); const after = structuredClone(state);
  assert.throws(() => cancelOrder(state, filled.id), /미체결/); assert.deepEqual(state, after);
  state.risk.maxOrder = 10000000;
  const sale = { ...input(), side: 'sell' as const, qty: held + 1, price: 100000 };
  const pending = placeOrder(state, sale);
  assert.throws(() => placeOrder(state, { ...sale, requestId: randomUUID(), qty: 1 }), /보유/);
  cancelOrder(state, pending.id);
  assert.equal(placeOrder(state, { ...sale, requestId: randomUUID() }).status, 'pending');
});

test('ledger GET survives restart with original dates and unknown state without broker I/O or mutation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'orders-ledger-')); const path = join(directory, 'state.sqlite'); let store = new Store(path); let calls = 0;
  const kis = new KisClient({ key: 'fixture-key', secret: 'fixture-secret', account: '12345678', product: '01' }, async () => { calls++; throw new Error('unexpected broker I/O'); });
  const order = { ...input(), createdAt: '2026-11-13T01:00:00.000Z', tradeDate: '20261113', status: 'unknown' as const, filled: 0, remaining: 1, message: 'pending comparison' };
  store.savePaper(order); store.close(); store = new Store(path);
  const server = makeServer(store, kis, [4401]); server.listen(4401, '127.0.0.1'); await once(server, 'listening');
  try {
    const before = structuredClone(store.paperOrders()), state = structuredClone(store.read());
    for (let i = 0; i < 2; i++) {
      const response = await fetch('http://127.0.0.1:4401/api/kis/ledger'); assert.equal(response.status, 200);
      const result = paperLedgerSchema.parse(await response.json());
      assert.equal(result.orders[0].tradeDate, '20261113'); assert.equal(result.orders[0].status, 'unknown');
      assert.equal(result.orders[0].remaining, 1); assert.equal(result.orders[0].requestId, order.requestId);
    }
    assert.deepEqual(store.paperOrders(), before); assert.deepEqual(store.read(), state); assert.equal(calls, 0);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); rmSync(directory, { recursive: true }); }
});

test('ledger display contract rejects invalid quantities and strips broker messages and extra evidence', () => {
  const order = { ...input(), createdAt: '2026-11-13T01:00:00.000Z', tradeDate: '20261113', status: 'accepted', filled: 0, remaining: 1, message: 'private-text', evidence: 'private-evidence' };
  const result = paperLedgerSchema.parse({ orders: [order] });
  assert.ok(!JSON.stringify(result).includes('private-'));
  for (const patch of [{ remaining: -1 }, { filled: 2 }, { status: 'anything' }, { createdAt: 'bad-date' }]) assert.equal(paperLedgerSchema.safeParse({ orders: [{ ...order, ...patch }] }).success, false);
});
