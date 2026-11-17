import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KisClient } from '../server/kis.ts';
import { stateSnapshotSchema } from '../shared/contracts.ts';
import { snapshot } from './snapshot.ts';

const credentials = { key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' };
const balance = { rt_cd: '0', output1: [], output2: [{ dnca_tot_amt: '123', tot_evlu_amt: '123' }] };
const token = () => Response.json({ access_token: 'fixture-token', expires_in: 86400 });
const settle = () => new Promise(resolve => setImmediate(resolve));
for (const stage of ['token', 'body', 'page', 'queue']) test(`balance deadline bounds ${stage}, prevents late writes and permits recovery`, async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  let hang = false, calls = 0, pages = 0;
  let release!: (value: Response) => void;
  const gate = new Promise<Response>(resolve => { release = resolve; });
  const client = new KisClient(credentials, async url => {
    calls++;
    if (String(url).endsWith('/tokenP')) return hang && stage === 'token' ? gate : token();
    if (!hang) return Response.json(balance);
    if (stage === 'queue' && String(url).includes('inquire-price')) return gate;
    if (stage === 'page' && ++pages === 1) return Response.json({ ...balance, ctx_area_fk100: 'next' }, { headers: { tr_cont: 'M' } });
    if (stage === 'body') return new Response(new ReadableStream({ start(controller) { gate.then(() => { controller.enqueue(new TextEncoder().encode(JSON.stringify(balance))); controller.close(); }); } }));
    return gate;
  }, 0);
  await client.balance(); const previous = client.connection();
  if (stage === 'token') t.mock.timers.tick(86_400_000);
  hang = true;
  const queued = stage === 'queue' ? client.quote('005930').catch(() => {}) : undefined;
  await settle();
  let done = false;
  const pending = client.balance().catch(() => {}).finally(() => { done = true; });
  const joined = client.balance().catch(() => {});
  await settle(); const atDeadline = calls;
  t.mock.timers.tick(120_000); await settle();
  try {
    assert.equal(done, true, 'deadline must settle the balance operation');
    assert.equal(client.connection().status.phase, stage === 'page' ? 'partial' : 'error');
    assert.equal(client.connection().connected, false);
    assert.deepEqual(client.connection().balance, previous.balance);
    assert.equal(client.connection().status.lastSuccessAt, previous.status.lastSuccessAt);
  } finally { release(Response.json(balance)); await settle(); await Promise.all([pending, joined, queued]); }
  assert.equal(calls, atDeadline, 'expired queued work and late response must not issue another page');
  assert.equal(client.connection().connected, false);
  hang = false;
  assert.equal((await client.balance()).connected, true, 'deadline must not persist on the client');
});

test('snapshot rejects malformed server start and retry timestamps', () => {
  const state = snapshot();
  assert.equal(stateSnapshotSchema.safeParse({ ...state, startedAt: 'bad' }).success, false);
  state.connection.authentication.retryAt = 'bad';
  assert.equal(stateSnapshotSchema.safeParse(state).success, false);
});

test('fresh balance deadline includes waiting for an earlier display query', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  let pages = 0, release!: (value: Response) => void;
  const gate = new Promise<Response>(resolve => { release = resolve; });
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return token();
    pages++; return gate;
  }, 0);
  const display = client.balance().catch(() => {}); await settle();
  t.mock.timers.tick(60_000);
  let done = false;
  const fresh = client.balance(true).catch(() => {}).finally(() => { done = true; });
  t.mock.timers.tick(60_000); await settle();
  assert.equal(pages, 2);
  t.mock.timers.tick(60_000); await settle();
  try { assert.equal(done, true, 'fresh wait plus its own read must share a single deadline'); }
  finally { release(Response.json(balance)); await Promise.all([display, fresh]); }
});

test('balance deadline covers pacing and never dispatches the expired queued request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'], now: 1_800_000_000_000 });
  let now = 0, calls = 0;
  t.mock.method(performance, 'now', () => now);
  const client = new KisClient(credentials, async () => { calls++; return token(); }, 200_000);
  const pending = assert.rejects(client.balance()); await settle();
  now = 120_000; t.mock.timers.tick(120_000); await pending;
  assert.equal(calls, 1); assert.equal(client.connection().status.phase, 'error');
  now = 200_000; t.mock.timers.tick(80_000); await settle();
  assert.equal(calls, 1);
});

test('multiple slow pages share one deadline and retain the last complete money', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_800_000_000_000 });
  let slow = false, pages = 0;
  const client = new KisClient(credentials, async url => {
    if (String(url).endsWith('/tokenP')) return token();
    if (!slow) return Response.json(balance);
    const page = ++pages;
    await new Promise(resolve => setTimeout(resolve, 40_000));
    return Response.json({ ...balance, ctx_area_fk100: String(page) }, { headers: { tr_cont: 'M' } });
  }, 0);
  await client.balance(); const previous = client.connection(); slow = true;
  const pending = assert.rejects(client.balance()); await settle();
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(40_000); await settle(); }
  await pending;
  assert.equal(pages, 3); assert.equal(client.connection().status.pages, 2);
  assert.equal(client.connection().status.phase, 'partial');
  assert.deepEqual(client.connection().balance, previous.balance);
  assert.equal(client.connection().status.lastSuccessAt, previous.status.lastSuccessAt);
});
