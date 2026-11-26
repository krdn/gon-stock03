import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.ts';
import { MarketData } from '../server/market-data.ts';
import { KisClient } from '../server/kis.ts';
import { dailyDetailSchema, dailyRunsSchema } from '../shared/data-inventory.ts';
import { startTestServer } from './test-server.ts';

test('inventory GET contracts preserve an earlier successful collection after a later failure without contacting KIS', async () => {
  const store = new Store(':memory:'); let failed = false, calls = 0;
  const kis = new KisClient({ key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' }, async url => {
    calls++;
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    if (failed) return new Response('', { status: 429 });
    return Response.json({ rt_cd: '0', output2: [{ stck_bsop_date: '20260102', stck_oprc: '100', stck_hgpr: '110', stck_lwpr: '90', stck_clpr: '105', acml_vol: '42' }] });
  }, 0);
  const service = new MarketData(store, kis);
  const config = { id: randomUUID(), code: '005930', from: '20260102', to: '20260102', adjustment: 'raw', calendar: { source: 'https://example.test/calendar', dates: ['20260102'] } };
  service.start(config); const success = await service.step(config.id);
  assert.ok(success.status.lastSuccessAt); failed = true;
  const later = service.start({ ...config, id: randomUUID() }); await service.step(later.id);
  const { url, close } = await startTestServer(store, kis);
  try {
    const beforeCalls = calls;
    const { runs } = dailyRunsSchema.parse(await (await fetch(`${url}/api/data/daily`)).json());
    assert.equal(runs[0].status.phase, 'error'); assert.equal(runs[0].status.lastSuccessAt, null);
    assert.equal(runs[1].status.lastSuccessAt, success.status.lastSuccessAt);
    const detail = dailyDetailSchema.parse(await (await fetch(`${url}/api/data/daily/${success.id}`)).json());
    assert.equal(detail.bars.length, 1); assert.equal(detail.bars[0].date, '20260102'); assert.equal(detail.run.adjustment, 'raw');
    assert.equal(calls, beforeCalls);
    assert.equal(dailyRunsSchema.safeParse({ runs: [{ ...success, source: 'synthetic' }] }).success, false);
    assert.equal(dailyDetailSchema.safeParse({ ...detail, bars: [{ ...detail.bars[0], collectedAt: 'bad date' }] }).success, false);
    const limited = dailyRunsSchema.parse(await (await fetch(`${url}/api/data/daily?limit=1`)).json());
    assert.equal(limited.runs.length, 1);
    assert.equal(limited.runs[0].id, later.id);
    assert.equal((await fetch(`${url}/api/data/daily?limit=999`)).status, 400);
  } finally { await close(); store.close(); }
});

test('sync inventory stores unconfigured skips and validates local POST and limits', async t => {
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-26T10:00:00+09:00')});
  const realFetch = globalThis.fetch;
  let externalCalls = 0;
  t.mock.method(globalThis, 'fetch', (url: string, init?: RequestInit) => {
    if (new URL(url).hostname !== '127.0.0.1') { externalCalls++; throw Error('unexpected network'); }
    return realFetch(url,init);
  });
  const store = new Store(':memory:');
  const server = await startTestServer(store, new KisClient({key:'',secret:'',account:'',product:''}, async () => { throw Error('unexpected transport'); }));
  const url = server.url + '/api/data/sync';
  const post = (limit: number, header = 'local') => fetch(url, {method:'POST', headers:{'content-type':'application/json','x-workbench':header}, body:JSON.stringify({targetDate:'20261102',limit})});
  try {
    assert.equal((await post(1,'other')).status,403);
    assert.equal((await post(51)).status,400);
    const response = await post(1);
    assert.equal(response.status,200);
    assert.equal((await response.json()).reasonCode,'KIS_UNCONFIGURED');
    assert.equal((await fetch(url+'?limit=101')).status,400);
    const data = await (await fetch(url)).json();
    assert.equal(data.runs.length,1);
    assert.equal(data.active,null);
    assert.equal(data.latest.status,'skipped');
    assert.equal(data.latest.masterRefreshed,false);
    assert.equal(data.scopeNotice,'우선 범위 수집 기준(범위 밖 미검증)');
    const early = await fetch(url,{method:'POST',headers:{'x-workbench':'local','content-type':'application/json'},body:'{}'});
    assert.equal(early.status,200);
    assert.equal((await early.json()).reasonCode,'BEFORE_CLOSE_BUFFER');
    assert.equal(externalCalls,0);
  } finally { await server.close(); store.close(); }
});
