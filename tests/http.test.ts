import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';
import { KisClient } from '../server/kis.ts';

test('HTTP rejects foreign origins, rebinding host and missing custom header; valid request uses persisted state', async () => {
  const store = new Store(':memory:');
  const server = makeServer(store, new KisClient({ key: '', secret: '', account: '', product: '' }), [4319]);
  server.listen(4319, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = 'http://127.0.0.1:4319/api/risk/halt';
    const headers = { 'Content-Type': 'application/json', 'X-Workbench': 'local' };
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://evil.test' }, body: '{"halted":true}' })).status, 403);
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      const req = httpRequest(url, { method: 'POST', headers: { ...headers, Host: 'evil.test:4319' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end('{"halted":true}');
    });
    assert.equal(badHostStatus, 403);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"halted":true}' })).status, 403);
    assert.equal(store.read().risk.halted, false);
    assert.equal((await fetch(url, { method: 'POST', headers, body: '{"halted":true}' })).status, 200);
    const response = await fetch('http://127.0.0.1:4319/api/state'); const state = await response.json(); assert.equal(state.risk.halted, true);
    const invalid = await fetch(url, { method: 'POST', headers, body: '{"halted":"false"}' }); assert.equal(invalid.status, 400);
    assert.equal(store.read().risk.halted, true);
    const live = await fetch('http://127.0.0.1:4319/api/kis/check', { method: 'POST', headers, body: '{}' }); assert.equal(live.status, 400);
    store.savePaper({ requestId: 'persisted', code: '005930', side: 'buy', qty: 1, price: 70000, createdAt: '2026-11-14', tradeDate: '20261114', status: 'unknown', filled: 0, remaining: 1, message: '확인 필요' });
    const ledger = await (await fetch('http://127.0.0.1:4319/api/kis/ledger')).json();
    assert.equal(ledger.orders[0].status, 'unknown'); assert.equal(ledger.orders[0].requestId, 'persisted');
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); }
});

test('state API shares a validated status contract without broker I/O, secrets or DEMO mixing', async () => {
  const { stateSnapshotSchema } = await import('../shared/contracts.ts');
  const store = new Store(':memory:'); let calls = 0, fail = false;
  const kis = new KisClient({ key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' }, async url => {
    calls++;
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    if (fail) return new Response('<html>fixture-secret fixture-token</html>', { status: 502 });
    return Response.json({ rt_cd: '0', output1: [], output2: [{ dnca_tot_amt: '123456', tot_evlu_amt: '123456' }] });
  }, 0);
  const server = makeServer(store, kis, [4320]); server.listen(4320, '127.0.0.1'); await once(server, 'listening');
  const logs: unknown[][] = []; const oldLog = console.log, oldError = console.error;
  console.log = (...args) => { logs.push(args); }; console.error = (...args) => { logs.push(args); };
  try {
    const read = async () => stateSnapshotSchema.parse(await (await fetch('http://127.0.0.1:4320/api/state')).json());
    const before = await read(); assert.equal(calls, 0); assert.equal(before.connection.status.phase, 'disconnected');
    assert.equal(before.status.environment, 'demo'); assert.equal(before.status.source, 'synthetic');
    const post = () => fetch('http://127.0.0.1:4320/api/kis/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: '{}' });
    assert.equal((await post()).status, 200);
    const good = await read(); assert.equal(good.connection.status.phase, 'ready'); assert.equal(good.connection.balance?.cash, 123456); assert.equal(good.cash, before.cash);
    assert.equal(good.instanceId, before.instanceId); const requestCount = calls;
    await read(); await read(); assert.equal(calls, requestCount);
    fail = true; const failed = await post(); assert.equal(failed.status, 400);
    const body = await failed.text(); const stale = await read();
    assert.equal(stale.connection.status.phase, 'error'); assert.equal(stale.connection.status.complete, false); assert.equal(stale.connection.connected, false);
    assert.equal(stale.connection.balance?.cash, 123456); assert.equal(stale.connection.status.lastSuccessAt, good.connection.status.lastSuccessAt);
    for (const value of [body, JSON.stringify(stale), JSON.stringify(logs)]) for (const secret of ['fixture-key', 'fixture-secret', 'fixture-token', '00000000']) assert.ok(!value.includes(secret));
  } finally { console.log = oldLog; console.error = oldError; server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); }
});
