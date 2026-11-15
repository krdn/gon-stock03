import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.ts';
import { KisClient } from '../server/kis.ts';
import { makeServer } from '../server/http.ts';
import { parseMaster } from '../server/market-data.ts';
import { stateSnapshotSchema } from '../shared/contracts.ts';

const credentials = { key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' };
const output = { stck_prpr: '70000', prdy_ctrt: '-1.25', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N', sltr_yn: 'N', acml_vol: '123456', bstp_kor_isnm: '전기전자', stck_shrn_iscd: '005930' };
const master = (code = '005930', exchange: 'KOSPI' | 'KOSDAQ' = 'KOSPI') => {
  const tail = Array.from({ length: exchange === 'KOSPI' ? 227 : 221 }, () => ' ');
  tail[0] = 'S'; tail[1] = 'T'; tail[exchange === 'KOSPI' ? 60 : 55] = 'Y'; tail[exchange === 'KOSPI' ? 61 : 56] = 'N';
  return parseMaster(Buffer.from(code.padEnd(9) + 'KR7000000000' + 'Example'.padEnd(40) + tail.join('') + '\n'), exchange);
};

test('market master preserves official halt flags in both layouts and does not invent missing flags', () => {
  for (const exchange of ['KOSPI', 'KOSDAQ'] as const) {
    const row = master('00088K', exchange).rows[0];
    assert.equal(row.code, '00088K'); assert.equal(row.tradingHalted, true); assert.equal(row.liquidation, false);
  }
  const row = parseMaster(Buffer.from('005930   KR7000000000Example'.padEnd(61) + 'ST' + ' '.repeat(225)), 'KOSPI').rows[0];
  assert.equal(row.tradingHalted, undefined);
});

test('master removal is preserved across restart, atomic failures and reappearance without claiming confirmed delisting', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-market-')); const path = join(directory, 'data.sqlite'); let store = new Store(path);
  try {
    const initial = master(); store.saveMasters([initial]); store.saveMasters([{ ...initial, rows: [] }]);
    assert.equal(store.masterData().instruments.length, 0);
    assert.equal(store.masterData().removed?.[0].code, '005930');
    assert.ok(store.masterData().removed?.[0].removedAt);
    store.close(); store = new Store(path);
    const previous = store.masterData(); assert.equal(previous.removed?.[0].name, 'Example');
    assert.throws(() => store.saveMasters([{ ...initial, rows: [initial.rows[0], initial.rows[0]] }]));
    assert.deepEqual(store.masterData(), previous);
    store.saveMasters([initial]); assert.equal(store.masterData().instruments.length, 1); assert.deepEqual(store.masterData().removed, []);
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});

test('market quote exposes received volume/sector/liquidation and rejects corrupt values and mismatched codes', async () => {
  for (const change of [{}, { temp_stop_yn: 'Y', sltr_yn: 'Y' }]) {
    const client = new KisClient(credentials, async url => Response.json(String(url).endsWith('/tokenP') ? { access_token: 'fixture-token', expires_in: 86400 } : { rt_cd: '0', output: { ...output, ...change } }), 0);
    const q = await client.quote('005930');
    assert.equal(q.volume, 123456); assert.equal(q.sector, '전기전자'); assert.equal(q.change, -1.25);
    assert.equal(q.stopped, change.temp_stop_yn === 'Y'); assert.equal(q.liquidation, change.sltr_yn === 'Y');
  }
  for (const change of [{ acml_vol: '-1' }, { acml_vol: '9007199254740992' }, { stck_shrn_iscd: '000660' }, { temp_stop_yn: '?' }, { prdy_ctrt: '9'.repeat(400) }]) {
    const client = new KisClient(credentials, async url => Response.json(String(url).endsWith('/tokenP') ? { access_token: 'fixture-token', expires_in: 86400 } : { rt_cd: '0', output: { ...output, ...change } }), 0);
    await assert.rejects(client.quote('005930'), /현재가/);
  }
});

test('market HTTP reads only a requested master code, shares quote cache, persists alphanumeric watchlist and keeps DEMO intact', async () => {
  const store = new Store(':memory:'); const a = master(); store.saveMasters([{ ...a, rows: [...a.rows, master('00088K').rows[0]] }]);
  const calls: string[] = [];
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    const code = new URL(String(url)).searchParams.get('FID_INPUT_ISCD')!; calls.push(code);
    return Response.json({ rt_cd: '0', output: { ...output, stck_shrn_iscd: code } });
  }, 0);
  const server = makeServer(store, client, [4323]); server.listen(4323, '127.0.0.1'); await once(server, 'listening');
  const post = (path: string, input: unknown) => fetch('http://127.0.0.1:4323/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify(input) });
  try {
    const before = store.read();
    const response = await post('market/quote', { code: '005930' }); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.quote.code, '005930'); assert.equal(body.quote.volume, 123456);
    await post('market/quote', { code: '005930' }); assert.deepEqual(calls, ['005930']);
    for (const input of [{ code: 5930 }, { code: '5930' }, { code: '999999' }, { codes: ['005930', '00088K'] }]) assert.equal((await post('market/quote', input)).status, 400);
    assert.deepEqual(store.read(), before); assert.deepEqual(calls, ['005930']);
    assert.equal((await post('watchlist', { code: '00088K' })).status, 200);
    const snapshot = stateSnapshotSchema.parse(await (await fetch('http://127.0.0.1:4323/api/state')).json());
    assert.ok(snapshot.watchlist.includes('00088K')); assert.deepEqual(snapshot.instruments, before.instruments);
    store.saveMasters([{ ...a, rows: [] }]);
    assert.equal((await post('market/quote', { code: '005930' })).status, 400);
    assert.equal((await post('watchlist', { code: '00088K' })).status, 200); assert.ok(!store.read().watchlist.includes('00088K'));
    assert.equal((await post('watchlist', { code: '00088K' })).status, 400);
    assert.deepEqual(calls, ['005930']);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); }
});
