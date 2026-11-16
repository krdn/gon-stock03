import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';
import { KisClient } from '../server/kis.ts';
import { stateSnapshotSchema } from '../shared/contracts.ts';

test('전략 HTTP 계약은 환경·기간을 검증하고 KIS 우회 시작을 거부하며 조회/저장은 네트워크를 호출하지 않는다', async () => {
  const store = new Store(':memory:'); let calls = 0;
  const kis = new KisClient({ key: '', secret: '', account: '', product: '' }, async () => { calls++; throw new Error('network forbidden'); }, 0);
  const server = makeServer(store, kis, [4347]); server.listen(4347, '127.0.0.1'); await once(server, 'listening');
  const post = (path: string, data: unknown) => fetch('http://127.0.0.1:4347/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local', Connection: 'close' }, body: JSON.stringify(data) });
  const input = { name: 'KIS 전략', code: '005930', fast: 2, slow: 3, qty: 1, environment: 'kis-paper' };
  try {
    for (const invalid of [{ environment: 'real' }, { fast: 3 }, { qty: 0 }, { code: '999999' }, { revision: 10 }]) assert.equal((await post('strategies', { ...input, ...invalid })).status, 400);
    assert.equal((await post('strategies', input)).status, 200);
    const strategy = store.read().strategies.at(-1)!;
    assert.equal(strategy.active, false); assert.equal(strategy.revision, 1); assert.equal(strategy.environment, 'kis-paper');
    assert.equal((await post('strategies/toggle', { id: strategy.id })).status, 400);
    assert.equal((await post('kis/strategies/run', { id: strategy.id, active: true })).status, 400);
    assert.equal((await post('kis/strategies/run', { id: strategy.id, active: 'true' })).status, 400);
    assert.equal((await post('kis/strategies/run', { id: strategy.id, active: false })).status, 200);
    assert.equal((await post('kis/strategies/run', { id: strategy.id, active: false })).status, 200);
    const response = await fetch('http://127.0.0.1:4347/api/state');
    const state = stateSnapshotSchema.parse(await response.json());
    assert.equal(state.strategies.at(-1)?.environment, 'kis-paper');
    assert.equal(state.strategies.at(-1)?.run, 0); assert.equal(calls, 0);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); }
});
