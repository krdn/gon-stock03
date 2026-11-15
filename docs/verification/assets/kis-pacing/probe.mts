import { KisClient } from '../../../../server/kis.ts';
import { randomUUID } from 'node:crypto';
const credentials = { key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' };
const samples: { iteration: number; wall: number; monotonic: number }[] = [];
for (let iteration = 0; iteration < 100; iteration++) {
  const starts: { wall: number; mono: number }[] = [];
  const client = new KisClient(credentials, async url => {
    starts.push({ wall: Date.now(), mono: performance.now() });
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 86400 });
    if (String(url).endsWith('/order-cash')) return Response.json({ rt_cd: '0', output: { ODNO: '1', KRX_FWDG_ORD_ORGNO: '1' } });
    return Response.json({ rt_cd: '0', output2: [] });
  }, 20);
  await client.submit({ code: '005930', side: 'buy', qty: 1, price: 70000, requestId: randomUUID() }, () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40); });
  await client.dailyPage({ id: randomUUID(), code: '005930', from: '20260102', to: '20260102', adjustment: 'raw' }, '20260102', '20260102');
  samples.push({ iteration, wall: starts[2].wall - starts[1].wall, monotonic: starts[2].mono - starts[1].mono });
}
console.log(JSON.stringify({ samples: samples.length, wallUnder20: samples.filter(s => s.wall < 20).length, monotonicUnder20: samples.filter(s => s.monotonic < 20).length, minMonotonic: Math.min(...samples.map(s => s.monotonic)), evidence: samples.filter(s => s.wall < 20 || s.monotonic < 20).slice(0, 10) }, null, 2));
