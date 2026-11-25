import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../server/store.ts';
import { KisClient } from '../server/kis.ts';
import { startTestServer } from './test-server.ts';
import { paperEvent, recordConnection, recordKisEvent } from '../server/events.ts';
import { initialState } from '../shared/fixtures.ts';
import { disconnectedConnection } from '../shared/status.ts';
import { record } from '../server/engine.ts';
import { stateSnapshotSchema } from '../shared/contracts.ts';

const headers = { 'Content-Type': 'application/json', 'X-Workbench': 'local' };
test('audit events are stable, safe, nonduplicating and remain read after SQLite restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'events-')); const path = join(dir, 'state.sqlite'); let store = new Store(path); let calls = 0;
  const kis = new KisClient({ key: '', secret: '', account: '', product: '' }, async () => { calls++; throw new Error('unexpected broker request'); });
  const id = randomUUID();
  const audit = store.appendPaperAudit({ requestId: id, actor: 'local-user', action: 'recovery-confirm', before: 'unknown', after: 'accepted', recovery: { evidenceId: 'fixture-secret', brokerId: '12345678', organization: '87654321' }, evidence: { observedAt: new Date().toISOString(), tradeDate: '20261116', orders: [], balance: { cash: 123456789, totalEquity: 234567890, positions: [] } } });
  store.update(state => record(state, 'KIS 모의 주문 accepted', 'fixture-secret'));
  let srv = await startTestServer(store, kis);
  const read = async () => stateSnapshotSchema.parse(await (await fetch(`${srv.url}/api/state`, { headers: { Connection: 'close' } })).json());
  try {
    const first = (await read()).events; const projected = first.find(e => e.id === `paper:${audit.id}`);
    assert.ok(projected, 'audit must appear as an event'); assert.equal(projected.read, false); assert.match(projected.title, /복구/);
    assert.equal(first.filter(e => e.environment === 'kis-paper').length, 1);
    assert.ok(store.read().events.some(e => e.title === 'KIS 모의 주문 accepted'));
    assert.deepEqual((await read()).events, first); assert.equal(calls, 0);
    const output = JSON.stringify(first); for (const forbidden of ['fixture-secret', '12345678', '87654321', '234567890']) assert.ok(!output.includes(forbidden));
    const probe = new DatabaseSync(path);
    probe.exec("CREATE TRIGGER fail_read BEFORE INSERT ON paper_event_read BEGIN SELECT RAISE(ABORT, 'fixture-storage-secret'); END;");
    const failed = await fetch(`${srv.url}/api/events/read`, { method: 'POST', headers, body: JSON.stringify({ ids: first.map(e => e.id) }) });
    assert.equal(failed.status, 500); assert.match(await failed.text(), /저장에 실패/);
    assert.deepEqual((await read()).events, first);
    probe.exec('DROP TRIGGER fail_read'); probe.close();
    const unseen = store.appendPaperAudit({ requestId: id, actor: 'system', action: 'reconcile', before: 'accepted', after: 'unknown' });
    const marked = await fetch(`${srv.url}/api/events/read`, { method: 'POST', headers, body: JSON.stringify({ ids: first.map(e => e.id) }) }); assert.equal(marked.status, 200);
    assert.equal((await read()).events.find(e => e.id === `paper:${unseen.id}`)?.read, false);
    await srv.close(); store.close(); store = new Store(path);
    srv = await startTestServer(store, kis);
    assert.equal((await read()).events.find(e => e.id === projected.id)?.read, true);
    const next = store.appendPaperAudit({ requestId: id, actor: 'system', action: 'reconcile', before: 'accepted', after: 'filled' });
    const events = (await read()).events; assert.equal(events.filter(e => e.id === projected.id).length, 1);
    assert.equal(events.find(e => e.id === `paper:${next.id}`)?.read, false); assert.equal(calls, 0);
  } finally { await srv?.close(); store.close(); rmSync(dir, { recursive: true }); }
});

test('connection failures and blocked KIS actions produce safe events without duplicate retries', async () => {
  const store = new Store(':memory:'); const kis = new KisClient({ key: '', secret: '', account: '', product: '' });
  const { url, close } = await startTestServer(store, kis);
  const post = (path: string, body: object) => fetch(`${url}/api/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    await post('kis/check', {}); await post('kis/check', {});
    const id = randomUUID(); await post('kis/cancel', { id }); await post('kis/cancel', { id });
    const state = await (await fetch(`${url}/api/state`)).json();
    const connection = state.events.filter((e: any) => e.target === 'settings' && e.environment === 'kis-paper'); assert.equal(connection.length, 1); assert.match(connection[0].detail, /미주입/);
    const blocked = state.events.filter((e: any) => e.requestId === id); assert.equal(blocked.length, 1); assert.match(blocked[0].title, /차단/); assert.equal(blocked[0].target, 'paper');
    const probeId = randomUUID(); await post('kis/cancel-probe', { id: probeId });
    const probe = await (await fetch(`${url}/api/state`)).json();
    assert.ok(probe.events.some((e: any) => e.requestId === probeId && e.title === 'KIS 한정 취소 요청 차단'));
    await fetch(`${url}/api/kis/check`, { method: 'POST', headers, body: '{' });
    const malformed = await (await fetch(`${url}/api/state`)).json();
    const failure = malformed.events.find((e: any) => e.title === 'KIS 연결 확인 실패');
    assert.match(failure.detail, /전체 조회 미확인/); assert.doesNotMatch(failure.detail, /외부 서버 오류/);
  } finally { await close(); store.close(); }
});


test('connection state transitions retain recovery history but never external error text or account IDs', async () => {
  const store = new Store(':memory:'); let failed = true;
  const kis = new KisClient({ key: 'fixture-key', secret: 'fixture-secret', account: '12345678', product: '01' }, async url => {
    if (String(url).endsWith('/tokenP')) return Response.json({ access_token: 'fixture-token', expires_in: 86400 });
    if (failed) throw new Error('fixture-secret fixture-token 12345678');
    return Response.json({ rt_cd: '0', output1: [], output2: [{ dnca_tot_amt: '100000', tot_evlu_amt: '100000' }] });
  }, 0);
  const { url, close } = await startTestServer(store, kis);
  const check = () => fetch(`${url}/api/kis/check`, { method: 'POST', headers, body: '{}' });
  try {
    assert.equal((await check()).status, 400); failed = false;
    assert.equal((await check()).status, 200); assert.equal((await check()).status, 200); failed = true;
    assert.equal((await check()).status, 400);
    const state = await (await fetch(`${url}/api/state`)).json();
    const events = state.events.filter((e: any) => e.environment === 'kis-paper'); assert.equal(events.length, 3);
    assert.equal(events.filter((e: any) => e.title === 'KIS 연결·잔고 확인').length, 1);
    for (const value of ['fixture-secret', 'fixture-token', '12345678']) assert.ok(!JSON.stringify(events).includes(value));
    const reconcile = () => fetch(`${url}/api/kis/orders`, { method: 'POST', headers, body: '{}' });
    await reconcile(); failed = false; await reconcile(); await reconcile(); failed = true; await reconcile();
    const after = await (await fetch(`${url}/api/state`)).json();
    assert.equal(after.events.filter((e: any) => e.title.startsWith('KIS 주문 대조')).length, 3);
  } finally { await close(); store.close(); }
});


test('failure outcome overrides shared connection state and does not deduplicate against another request', () => {
  const state = initialState(); const connection = disconnectedConnection(); connection.status.phase = 'ready';
  recordConnection(state, connection, 'network');
  assert.equal(state.events[0].title, 'KIS 연결 확인 실패');
  recordKisEvent(state, 'KIS 주문 요청 차단', 'same cause', 'paper', randomUUID());
  recordKisEvent(state, 'KIS 주문 요청 차단', 'same cause', 'paper');
  assert.equal(state.events.filter(e => e.title === 'KIS 주문 요청 차단').length, 2);
});

test('cancel attempt with an unrecorded prior status never claims the original order was unsent', () => {
  const event = paperEvent({ id: randomUUID(), requestId: randomUUID(), at: new Date().toISOString(), actor: 'local-user', action: 'cancel-attempt', before: null, after: 'unknown' }, false);
  assert.doesNotMatch(event.detail, /미전송/);
});

test('read acknowledgement leaves an audit created after the visible snapshot unread', () => {
  const store = new Store(':memory:');
  try {
    const first = store.appendPaperAudit({ requestId: randomUUID(), actor: 'system', action: 'response', before: 'sending', after: 'accepted' });
    const next = store.appendPaperAudit({ requestId: randomUUID(), actor: 'system', action: 'response', before: 'sending', after: 'unknown' });
    store.update(() => store.markPaperEventsRead([`paper:${first.id}`]));
    assert.equal(store.events().find(e => e.id === `paper:${next.id}`)?.read, false);
  } finally { store.close(); }
});
