import { portfolioValue } from '../shared/portfolio.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KisClient } from '../server/kis.ts';
import { KisNotSent } from '../server/kis.ts';
import { randomUUID } from 'node:crypto';

const credentials = { key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' };
const empty = { rt_cd: '0', output1: [], output2: [{ dnca_tot_amt: '1000000', tot_evlu_amt: '1071000' }] };
test('settings distinguishes missing and invalid injection without treating presence as authentication', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; throw new Error('must not send'); };
  const missing = new KisClient({ ...credentials, key: '' }, transport, 0);
  assert.equal(missing.connection().injection?.phase, 'missing');
  assert.deepEqual(missing.connection().injection?.missing, ['KIS_APP_KEY']);
  await assert.rejects(missing.balance(), /환경변수/);
  assert.equal(missing.connection().failure?.kind, 'missing');
  assert.equal(missing.connection().authentication?.phase, 'unverified');
  const invalid = new KisClient({ ...credentials, account: 'bad' }, transport, 0);
  assert.equal(invalid.connection().injection?.phase, 'invalid');
  await assert.rejects(invalid.balance()); assert.equal(invalid.connection().failure?.kind, 'invalid');
  const present = new KisClient(credentials, transport, 0).connection();
  assert.equal(present.injection?.phase, 'present'); assert.equal(present.authentication?.phase, 'unverified');
  assert.equal(present.connected, false); assert.equal(calls, 0);
});

test('settings shows authentication only after its response and balance only after every page', async () => {
  let releaseToken!: (response: Response) => void, releasePage!: (response: Response) => void, pages = 0;
  const token = new Promise<Response>(resolve => { releaseToken = resolve; }), secondPage = new Promise<Response>(resolve => { releasePage = resolve; });
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return token;
    if (++pages === 1) return Response.json({ ...empty, ctx_area_fk100: 'next', ctx_area_nk100: 'one' }, { headers: { tr_cont: 'M' } });
    return secondPage;
  }, 0);
  const pending = client.balance();
  assert.equal(client.connection().authentication?.phase, 'loading');
  assert.equal(client.connection().connected, false); assert.equal(client.connection().balance, undefined);
  releaseToken(Response.json({ access_token: 'fixture-token', expires_in: 86400 }));
  await new Promise(resolve => setImmediate(resolve));
  const middle = client.connection(); assert.equal(middle.authentication?.phase, 'ready');
  assert.equal(middle.status.phase, 'loading'); assert.equal(middle.status.pages, 1); assert.equal(middle.balance, undefined);
  assert.equal(middle.connected, false); assert.ok(middle.authentication?.lastSuccessAt);
  releasePage(Response.json(empty));
  const result = await pending; assert.equal(result.connected, true); assert.equal(result.status.pages, 2);
});

test('settings classifies authentication and account failures without echoing upstream fields', async () => {
  const cases = [
    { response: () => Response.json({ error_code: 'EGW00103', error_description: 'fixture-secret' }), kind: 'permission' },
    { response: () => new Response('fixture-secret', { status: 403 }), kind: 'permission' },
    { response: () => new Response('fixture-token', { status: 429 }), kind: 'rate-limit' },
    { response: () => Response.json({ error_code: 'EGW00133', error_description: 'fixture-secret' }, { status: 403 }), kind: 'rate-limit' },
    { response: () => Response.json({ rt_cd: '1', msg_cd: 'EGW00201', msg1: 'fixture-secret' }, { status: 500 }), kind: 'rate-limit' },
    { response: () => { throw new Error('fixture-key fixture-token'); }, kind: 'network' },
    { response: () => new Response('fixture-key', { status: 503 }), kind: 'upstream' },
    { response: () => new Response('fixture-secret'), kind: 'contract' },
    { response: () => Response.json({ rt_cd: '1', msg_cd: credentials.account, msg1: 'fixture-secret' }), kind: 'rejected' },
  ];
  for (const stage of ['authentication', 'balance']) for (const row of cases) {
    const client = new KisClient(credentials, async url => stage === 'balance' && String(url).endsWith('/tokenP') ? Response.json({ access_token: 'fixture-token', expires_in: 86400 }) : row.response(), 0);
    await assert.rejects(client.balance()); const state = client.connection();
    assert.equal(state.failure?.kind, row.kind, `${stage}: ${row.kind}`);
    assert.equal(state.authentication?.phase, stage === 'authentication' ? 'error' : 'ready');
    assert.equal(state.connected, false); assert.equal(state.balance, undefined);
    for (const value of ['fixture-key', 'fixture-secret', 'fixture-token', credentials.account]) assert.ok(!JSON.stringify(state).includes(value));
  }
});

test('settings exposes expiration and issuance cooldown then recovers with a new actual response', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 }); let expired = false, tokens = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) { tokens++; return Response.json({ access_token: 'fixture-token', expires_in: 120 }); }
    return expired ? Response.json({ rt_cd: '1', msg_cd: 'EGW00123' }, { status: 500 }) : Response.json(empty);
  }, 0);
  await client.balance(); expired = true; t.mock.timers.tick(1);
  await assert.rejects(client.balance());
  assert.equal(client.connection().authentication?.phase, 'expired');
  assert.equal(client.connection().failure?.kind, 'expired');
  assert.ok(client.connection().authentication?.retryAt); assert.equal(tokens, 1);
  expired = false; t.mock.timers.tick(60_000);
  const recovered = await client.balance(); assert.equal(tokens, 2);
  assert.equal(recovered.authentication?.phase, 'ready'); assert.equal(recovered.failure, null);
  assert.equal(recovered.authentication?.retryAt, null);
  t.mock.timers.tick(60_001); assert.equal(client.connection().authentication?.phase, 'expired');
});

test('invalid token validity cannot be cached or turn a later balance check into success', async () => {
  let balanceReads = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 1e20 });
    balanceReads++; return Response.json(empty);
  }, 0);
  await assert.rejects(client.balance());
  await assert.rejects(client.balance());
  assert.equal(client.connection().failure?.kind, 'contract');
  assert.equal(client.connection().authentication.phase, 'error');
  assert.equal(client.connection().connected, false); assert.equal(balanceReads, 0);
});

test('an old queued request expiring after renewal cannot overwrite the new authentication success', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let expired = false, tokens = 0, scheduled = false, second!: Promise<unknown>, trigger!: () => void;
  const triggered = new Promise<void>(resolve => { trigger = resolve; }); const events: string[] = [];
  const client = new KisClient(credentials, async (url, init) => {
    if (String(url).endsWith('/tokenP')) { events.push(`token-${++tokens}`); return Response.json({ access_token: `token-${tokens}`, expires_in: 86400 }); }
    const token = new Headers(init?.headers).get('authorization');
    if (expired && token === 'Bearer token-1') {
      events.push('old-token-expired');
      if (!scheduled) {
        scheduled = true; let microtasks = 3;
        const startConcurrentRead = () => { if (microtasks-- > 0) queueMicrotask(startConcurrentRead); else { second = client.quote('005930'); trigger(); } };
        queueMicrotask(startConcurrentRead);
      }
      return new Response('', { status: 401 });
    }
    return Response.json(String(url).includes('inquire-balance') ? empty : { rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
  }, 0);
  await client.balance(); t.mock.timers.tick(60_001); expired = true;
  const first = client.balance(); await triggered; await Promise.all([first, second]);
  assert.ok(events.lastIndexOf('old-token-expired') > events.indexOf('token-2'));
  assert.equal(tokens, 2); assert.equal(client.connection().authentication.phase, 'ready');
  assert.equal(client.connection().authentication.failure, null); assert.equal(client.connection().status.phase, 'ready');
});

test('KIS uses only VTS, caches token, paginates, removes zero holdings, never exposes credentials', async () => {
  const calls: { url: string; init?: RequestInit }[] = []; let page = 0;
  const transport: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    assert.ok(String(url).startsWith('https://openapivts.koreainvestment.com:29443/')); assert.equal(init?.redirect, 'error');
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    page += 1;
    if (page === 1) return Response.json({ ...empty, ctx_area_fk100: 'next', ctx_area_nk100: 'one' }, { headers: { tr_cont: 'M' } });
    return Response.json({ ...empty, output1: [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '1', pchs_avg_pric: '70000', prpr: '71000' }, { pdno: '000660', prdt_name: 'SK하이닉스', hldg_qty: '0', pchs_avg_pric: '0', prpr: '0' }] });
  };
  const client = new KisClient(credentials, transport, 0); const result = await client.balance(); await client.balance();
  assert.equal(result.balance?.positions.length, 1); assert.equal(result.balance?.cash, 1000000);
  assert.equal(result.balance?.totalEquity, 1071000);
  assert.equal(calls.filter(c => c.url.endsWith('/tokenP')).length, 1);
  assert.ok(calls[2].url.includes('CTX_AREA_NK100=one'));
  assert.equal(JSON.stringify(result).includes('fixture-'), false);
});
test('token acquisition failure before an order is classified as not sent', async () => {
  let orders = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/order-cash')) orders++;
    return Response.json({ invalid: 'token response' });
  }, 0);
  await assert.rejects(client.submit({ code: '005930', side: 'buy', qty: 1, price: 70000, requestId: randomUUID() }), KisNotSent);
  assert.equal(orders, 0);
});
test('KIS repeated pagination and incomplete response fail closed', async () => {
  const client = new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? Response.json({ access_token: 'token', expires_in: 300 }) : Response.json({ ...empty, ctx_area_fk100: 'same', ctx_area_nk100: 'same' }, { headers: { tr_cont: 'M' } }), 0);
  await assert.rejects(client.balance(), /반복/);
  const incomplete = new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? Response.json({ access_token: 'token', expires_in: 300 }) : Response.json({ rt_cd: '0', output1: [] }), 0);
  await assert.rejects(incomplete.balance(), /계약/);
});
test('KIS errors do not echo raw upstream messages or tokens, missing secrets make no request', async () => {
  const bad = new KisClient(credentials, async () => Response.json({ rt_cd: '1', msg_cd: 'EGW00123', msg1: 'fixture-secret fixture-token' }), 0);
  await assert.rejects(bad.balance(), error => error instanceof Error && error.message.includes('EGW00123') && !error.message.includes('fixture'));
  const missing = new KisClient({ ...credentials, key: '' }, async () => { assert.fail('must not send'); }, 0);
  await assert.rejects(missing.balance(), /환경변수/);
});
test('pre-send guard runs after pacing and blocks broker mutation when halted', async () => {
  let mutations = 0, halted = false;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) { setTimeout(() => { halted = true; }, 5); return Response.json({ access_token: 'token', expires_in: 300 }); }
    mutations += 1; return Response.json({ rt_cd: '0', output: { ODNO: '1', KRX_FWDG_ORD_ORGNO: '1' } });
  }, 50);
  await assert.rejects(client.submit({ code: '005930', side: 'buy', qty: 1, price: 70000, requestId: randomUUID() }, () => { if (halted) throw new KisNotSent('halted'); }), /halted/);
  assert.equal(mutations, 0);
});

test('account status distinguishes loading, complete, stale and partial without replacing last good money', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let fail = false, page = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    page++;
    if (fail && page % 2 === 0) return new Response('<html>fixture-secret</html>', { status: 502 });
    return Response.json({ ...empty, ctx_area_fk100: 'next', ctx_area_nk100: 'one' }, { headers: { tr_cont: fail ? 'M' : '' } });
  }, 0);
  assert.equal(client.connection().status.phase, 'disconnected');
  const pending = client.balance(); assert.equal(client.connection().status.phase, 'loading');
  const good = await pending;
  assert.equal(good.status.phase, 'ready'); assert.equal(good.status.complete, true); assert.equal(good.status.pages, 1);
  t.mock.timers.tick(60_001);
  assert.equal(client.connection().status.phase, 'stale'); assert.equal(client.connection().connected, false);
  fail = true; page = 0;
  await assert.rejects(client.balance(), /502/);
  const partial = client.connection();
  assert.equal(partial.status.phase, 'partial'); assert.equal(partial.status.complete, false); assert.equal(partial.status.pages, 1);
  assert.equal(partial.status.lastSuccessAt, good.status.lastSuccessAt); assert.notEqual(partial.status.observedAt, good.status.observedAt);
  assert.equal(partial.balance?.cash, 1_000_000); assert.equal(partial.connected, false);
  assert.ok(!JSON.stringify(partial).includes('fixture-'));
  fail = false;
  assert.equal((await client.balance()).status.phase, 'ready');
});

test('first partial balance has no fabricated zero balance and concurrent checks share the whole query', async () => {
  let auth = 0, calls = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) { auth++; return Response.json({ access_token: 'token', expires_in: 86400 }); }
    if (++calls === 2) throw new Error('fixture-secret');
    return Response.json({ ...empty, ctx_area_fk100: 'next', ctx_area_nk100: 'one' }, { headers: { tr_cont: 'M' } });
  }, 0);
  const results = await Promise.allSettled([client.balance(), client.balance(), client.balance()]);
  assert.ok(results.every(r => r.status === 'rejected'));
  assert.equal(auth, 1); assert.equal(calls, 2);
  assert.equal(client.connection().status.phase, 'partial'); assert.equal(client.connection().balance, undefined);
});

test('authentication refresh retries reads once, shares renewal and enforces the issuance cooldown', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let auth = 0, reads = 0, expire = false;
  const client = new KisClient(credentials, async (url, init) => {
    if (String(url).endsWith('/tokenP')) { auth++; return Response.json({ access_token: `token-${auth}`, expires_in: 86400 }); }
    reads++;
    const token = new Headers(init?.headers).get('authorization');
    if (expire && token === 'Bearer token-1') return Response.json({ rt_cd: '1', msg_cd: 'EGW00123', msg1: 'fixture-secret' });
    return Response.json(empty);
  }, 0);
  await client.balance(); t.mock.timers.tick(60_001); expire = true;
  await Promise.all([client.balance(), client.balance()]);
  assert.equal(auth, 2); assert.equal(reads, 3); assert.equal(client.connection().status.phase, 'ready');

  let badAuth = 0, badReads = 0;
  const rejected = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) { badAuth++; return Response.json({ access_token: `bad-${badAuth}`, expires_in: 86400 }); }
    badReads++;
    return new Response('', { status: 401 });
  }, 0);
  await assert.rejects(rejected.balance(), /만료되거나 거부/);
  assert.equal(badAuth, 1); assert.equal(badReads, 1);
  await assert.rejects(rejected.balance(), /만료되거나 거부/); assert.equal(badAuth, 1);
  t.mock.timers.tick(60_001);
  await assert.rejects(rejected.balance(), /만료되거나 거부/);
  assert.equal(badAuth, 2); assert.equal(badReads, 2);
});

test('expired access token renews once and failed token issuance is not hammered', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let auth = 0;
  const client = new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? (auth++, Response.json({ access_token: 'token', expires_in: 120 })) : Response.json(empty), 0);
  await client.balance(); await client.balance(); assert.equal(auth, 1);
  t.mock.timers.tick(60_001);
  await Promise.all([client.balance(), client.balance()]); assert.equal(auth, 2);
  let failed = 0;
  const bad = new KisClient(credentials, async () => { failed++; return new Response('fixture-secret', { status: 503 }); }, 0);
  await assert.rejects(bad.balance(), /503/); await assert.rejects(bad.balance(), /503/);
  assert.equal(failed, 1);
});

test('all KIS endpoints share pacing; reads do not retry 429 or 5xx and POST never retries auth failures', async () => {
  const starts: number[] = []; let auth = 0;
  const client = new KisClient(credentials, async url => {
    starts.push(Date.now());
    if (String(url).endsWith('/tokenP')) { auth++; return Response.json({ access_token: 'token', expires_in: 86400 }); }
    return new Response('fixture-secret', { status: String(url).includes('order-cash') ? 401 : 429 });
  }, 20);
  const results = await Promise.allSettled([client.balance(), client.quote('005930'), client.bars('005930')]);
  assert.ok(results.every(r => r.status === 'rejected'));
  assert.equal(auth, 1); assert.equal(starts.length, 4);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 19);
  await assert.rejects(client.submit({ code: '005930', side: 'buy', qty: 1, price: 70000, requestId: randomUUID() }), /401/);
  assert.equal(starts.length, 5); assert.equal(auth, 1);
});

test('pacing starts at transport after a slow pre-send guard, including a subsequent daily page', async () => {
  const starts: number[] = [];
  const client = new KisClient(credentials, async url => {
    starts.push(Date.now());
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 86400 });
    if (String(url).endsWith('/order-cash')) return Response.json({ rt_cd: '0', output: { ODNO: '1', KRX_FWDG_ORD_ORGNO: '1' } });
    return Response.json({ rt_cd: '0', output2: [] });
  }, 20);
  await client.submit({ code: '005930', side: 'buy', qty: 1, price: 70000, requestId: randomUUID() }, () => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40); });
  await client.dailyPage({ id: randomUUID(), code: '005930', from: '20260102', to: '20260102', adjustment: 'raw' }, '20260102', '20260102');
  assert.equal(starts.length, 3); assert.ok(starts[2] - starts[1] >= 20, `transport spacing: ${starts[2] - starts[1]}ms`);
});

test('quote requests coalesce and keep their observation time until the refresh interval; order checks bypass cache', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let quotes = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 86400 });
    quotes++;
    return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
  }, 0);
  const [first, concurrent] = await Promise.all([client.quote('005930'), client.quote('005930')]);
  t.mock.timers.tick(2999); const cached = await client.quote('005930');
  assert.equal(quotes, 1); assert.equal(first.receivedAt, concurrent.receivedAt); assert.equal(cached.receivedAt, first.receivedAt);
  t.mock.timers.tick(1); assert.notEqual((await client.quote('005930')).receivedAt, first.receivedAt); assert.equal(quotes, 2);
  await client.quote('005930', true); assert.equal(quotes, 3);
});

test('balance page cap and duplicate holdings cannot become a complete balance', async () => {
  let page = 0;
  const capped = new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? Response.json({ access_token: 'token', expires_in: 86400 }) : Response.json({ ...empty, ctx_area_fk100: String(++page), ctx_area_nk100: 'next' }, { headers: { tr_cont: 'M' } }), 0);
  await assert.rejects(capped.balance(), /전체 페이지/); assert.equal(page, 50); assert.equal(capped.connection().status.complete, false); assert.equal(capped.connection().balance, undefined);
  page = 0;
  const duplicate = new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? Response.json({ access_token: 'token', expires_in: 86400 }) : Response.json({ ...empty, ctx_area_fk100: String(++page), output1: [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '1', pchs_avg_pric: '70000', prpr: '71000' }] }, { headers: { tr_cont: page === 1 ? 'M' : '' } }), 0);
  await assert.rejects(duplicate.balance(), /중복/); assert.equal(duplicate.connection().status.phase, 'partial');
});

test('a second auth failure stops after one replay and changed page totals remain partial', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let tokens = 0, reads = 0, reject = false;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) { tokens++; return Response.json({ access_token: `token-${tokens}`, expires_in: 86400 }); }
    reads++; return reject ? new Response('', { status: 401 }) : Response.json(empty);
  }, 0);
  await client.balance(); t.mock.timers.tick(60_001); reject = true;
  await assert.rejects(client.balance(), /만료되거나 거부/); assert.equal(tokens, 2); assert.equal(reads, 3);
  await assert.rejects(client.balance(), /만료되거나 거부/); assert.equal(tokens, 2); assert.equal(reads, 3);
  let page = 0;
  const changed = new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? Response.json({ access_token: 'token', expires_in: 86400 }) : Response.json({ ...empty, output2: [{ dnca_tot_amt: String(++page), tot_evlu_amt: '1000000' }], ctx_area_fk100: 'next' }, { headers: { tr_cont: page === 1 ? 'M' : '' } }), 0);
  await assert.rejects(changed.balance(), /합계가 바뀌/); assert.equal(changed.connection().balance, undefined); assert.equal(changed.connection().status.phase, 'partial');
});

test('global pending bound rejects excess reads before transport instead of accumulating an unlimited queue', async () => {
  let reads = 0, release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 86400 });
    reads++; await gate;
    return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
  }, 0);
  const pending = Promise.allSettled(Array.from({ length: 35 }, (_, i) => client.quote(String(i).padStart(6, '0'))));
  await new Promise(resolve => setImmediate(resolve)); release!();
  const results = await pending; assert.equal(reads, 30); assert.equal(results.filter(r => r.status === 'rejected').length, 5);
  assert.equal((await client.quote('005930')).price, 70000);
});

test('fresh balance waits for a prior display query then performs its own account read', async () => {
  let reads = 0, release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 86400 });
    const cash = String(++reads * 10000); if (reads === 1) await gate;
    return Response.json({ ...empty, output2: [{ dnca_tot_amt: cash, tot_evlu_amt: cash }] });
  }, 0);
  const prior = client.balance(); await new Promise(resolve => setImmediate(resolve));
  const fresh = client.balance(true); release!();
  assert.equal((await prior).balance?.cash, 10000); assert.equal((await fresh).balance?.cash, 20000); assert.equal(reads, 2);
});

test('token issuance rejected by queue capacity does not start an unsent authentication cooldown', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let release: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 120 });
    if (String(url).includes('inquire-balance')) return Response.json(empty);
    await gate; return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
  }, 0);
  const reads = Promise.all(Array.from({ length: 30 }, (_, i) => client.quote(String(i).padStart(6, '0'))));
  await new Promise(resolve => setImmediate(resolve)); t.mock.timers.tick(60_001);
  await assert.rejects(client.balance(), /대기가 많습니다/);
  release!(); await reads;
  assert.equal((await client.balance()).status.phase, 'ready');
});

test('concurrent endpoints with an expired token share one renewal and replay each read once', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  let auth = 0, reads = 0, expired = false;
  const client = new KisClient(credentials, async (url, init) => {
    if (String(url).endsWith('/tokenP')) { auth++; return Response.json({ access_token: `token-${auth}`, expires_in: 86400 }); }
    reads++;
    if (expired && new Headers(init?.headers).get('authorization') === 'Bearer token-1') return new Response('', { status: 401 });
    if (String(url).includes('inquire-balance')) return Response.json(empty);
    return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
  }, 0);
  await client.balance(); t.mock.timers.tick(60_001); expired = true;
  const [balance, quote] = await Promise.all([client.balance(), client.quote('005930')]);
  assert.equal(balance.status.phase, 'ready'); assert.equal(quote.price, 70000); assert.equal(auth, 2); assert.equal(reads, 5);
});

test('failed renewal retains its latest safe failure rather than an older unauthorized response', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 }); let tokens = 0, expired = false;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return ++tokens === 1 ? Response.json({ access_token: 'token', expires_in: 86400 }) : new Response('fixture-secret', { status: 503 });
    return expired ? new Response('', { status: 401 }) : Response.json(empty);
  }, 0);
  await client.balance(); t.mock.timers.tick(60_001); expired = true;
  await assert.rejects(client.balance(), /503/); await assert.rejects(client.balance(), /503/); assert.equal(tokens, 2);
});

test('portfolio balance keeps every page once and represents missing or zero prices as unavailable', async () => {
  let page = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 86400 });
    page++;
    const row = (code: string, qty: string, price?: string | null) => ({ pdno: code, prdt_name: code, hldg_qty: qty, pchs_avg_pric: '100', prpr: price });
    return Response.json({ ...empty, output1: page === 1 ? [row('005930', '2', '110'), row('000660', '0', '0')] : [row('069500', '3'), row('035420', '1', ''), row('035720', '1', null), row('005380', '1', '0')], ctx_area_fk100: 'next', ctx_area_nk100: 'page' }, { headers: { tr_cont: page === 1 ? 'M' : '' } });
  }, 0);
  const result = await client.balance();
  assert.equal(result.status.pages, 2); assert.equal(result.status.complete, true);
  assert.deepEqual(result.balance?.positions.map(p => [p.code, p.qty, p.price]), [['005930', 2, 110], ['069500', 3, null], ['035420', 1, null], ['035720', 1, null], ['005380', 1, null]]);
  assert.equal(result.balance?.cash, 1000000);
});

test('portfolio sums priced holdings from all pages without duplicating account cash', async () => {
  let page = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'token', expires_in: 86400 });
    page++;
    return Response.json({ rt_cd: '0', output2: [{ dnca_tot_amt: '1000', tot_evlu_amt: '2000' }], output1: [{ pdno: page === 1 ? '005930' : '000660', prdt_name: '종목', hldg_qty: page === 1 ? '2' : '4', pchs_avg_pric: page === 1 ? '100' : '200', prpr: page === 1 ? '150' : '175' }], ctx_area_fk100: 'next', ctx_area_nk100: 'page' }, { headers: { tr_cont: page === 1 ? 'M' : '' } });
  }, 0);
  const { balance, status } = await client.balance();
  assert.equal(status.pages, 2); assert.equal(balance!.positions.length, 2);
  const p = portfolioValue(balance!.cash, balance!.positions);
  assert.equal(p.total, 2000); assert.equal(p.invested, 1000); assert.equal(p.profit, 0); assert.equal(p.cashWeight, 50);
});

test('malformed balance prices still reject the response and preserve the last complete balance', async () => {
  let price = '150';
  const client = new KisClient(credentials, async url => String(url).endsWith('/tokenP') ? Response.json({ access_token: 'token', expires_in: 86400 }) : Response.json({ ...empty, output1: [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '1', pchs_avg_pric: '100', prpr: price }] }), 0);
  await client.balance();
  for (price of ['-1', 'bad', 'NaN']) {
    await assert.rejects(client.balance(), /계약/);
    assert.equal(client.connection().balance!.positions[0].price, 150);
    assert.equal(client.connection().status.complete, false);
  }
});
