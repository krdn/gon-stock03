import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Store } from '../server/store.ts';
import { MarketData } from '../server/market-data.ts';
import { KisClient } from '../server/kis.ts';
import { makeServer } from '../server/http.ts';
import { dailyDetailSchema, dailyRunsSchema } from '../shared/data-inventory.ts';

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
  const server = makeServer(store, kis, [4328]); server.listen(4328, '127.0.0.1'); await once(server, 'listening');
  try {
    const beforeCalls = calls;
    const { runs } = dailyRunsSchema.parse(await (await fetch('http://127.0.0.1:4328/api/data/daily')).json());
    assert.equal(runs[0].status.phase, 'error'); assert.equal(runs[0].status.lastSuccessAt, null);
    assert.equal(runs[1].status.lastSuccessAt, success.status.lastSuccessAt);
    const detail = dailyDetailSchema.parse(await (await fetch(`http://127.0.0.1:4328/api/data/daily/${success.id}`)).json());
    assert.equal(detail.bars.length, 1); assert.equal(detail.bars[0].date, '20260102'); assert.equal(detail.run.adjustment, 'raw');
    assert.equal(calls, beforeCalls);
    assert.equal(dailyRunsSchema.safeParse({ runs: [{ ...success, source: 'synthetic' }] }).success, false);
    assert.equal(dailyDetailSchema.safeParse({ ...detail, bars: [{ ...detail.bars[0], collectedAt: 'bad date' }] }).success, false);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); store.close(); }
});
