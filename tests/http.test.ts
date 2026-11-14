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
