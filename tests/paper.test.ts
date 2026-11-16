import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { KisClient, koreaDate } from '../server/kis.ts';
import { PaperBroker } from '../server/paper.ts';
import { Store } from '../server/store.ts';
import { once } from 'node:events';
import { makeServer } from '../server/http.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function fixture(mode: 'success' | 'timeout' | 'reject' | 'unauthorized' | 'error-code-only', spacing = 0, approval?: { date: string; requestId: string; cancelProbe?: true; code?: '069500' | '005930'; maxAmount?: number; allowExistingHolding?: true }) {
  let submits = 0;
  const response = { cancelMode: 'success', cash: '10000000', totalEquity: '10000000', nonCreditCash: '10000000', positions: [] as Record<string, string>[], price: '70000', upper: '91000', tick: '100', rows: [] as Record<string, string>[], before: async (_path: string) => {}, receipt: { rt_cd: '0', output: { ODNO: '001', KRX_FWDG_ORD_ORGNO: '12345' } } as unknown };
  const requests: { url: URL; init: RequestInit | undefined; startedAt: number }[] = [];
  const transport: typeof fetch = async (url, init) => {
    requests.push({ url: new URL(String(url)), init, startedAt: performance.now() });
    const path = new URL(String(url)).pathname;
    await response.before(path);
    if (path.endsWith('/tokenP')) return Response.json({ access_token: 'test-token', expires_in: 86400 });
    if (path.endsWith('/inquire-balance')) return Response.json({ rt_cd: '0', output1: response.positions, output2: [{ dnca_tot_amt: response.cash, tot_evlu_amt: response.totalEquity }] });
    if (path.endsWith('/inquire-price')) return Response.json({ rt_cd: '0', output: { stck_prpr: response.price, prdy_ctrt: '1.0', stck_mxpr: response.upper, stck_llam: '49000', aspr_unit: response.tick, temp_stop_yn: 'N' } });
    if (path.endsWith('/inquire-psbl-order')) return Response.json({ rt_cd: '0', output: { nrcvb_buy_qty: '100', nrcvb_buy_amt: response.nonCreditCash, ord_psbl_cash: '10000000' } });
    if (path.endsWith('/inquire-daily-ccld')) return Response.json({ rt_cd: '0', output1: response.rows.filter(row => row.ord_dt === new URL(String(url)).searchParams.get('INQR_STRT_DT')) });
    if (path.endsWith('/order-rvsecncl')) {
      if (response.cancelMode === 'timeout') throw new Error('secret transport error');
      if (response.cancelMode === 'unauthorized') return new Response('secret upstream', { status: 401 });
      if (response.cancelMode === 'error-code-only') return Response.json({ error_code: 'EGW00103', error_description: 'secret upstream' });
      if (response.cancelMode === 'reject') return Response.json({ rt_cd: '1', msg_cd: 'CANCEL_REJECT', msg1: 'secret upstream' });
      if (response.cancelMode === 'malformed') return Response.json({ rt_cd: '0' });
      return Response.json({ rt_cd: '0', output: { ODNO: '002', KRX_FWDG_ORD_ORGNO: '12345' } });
    }
    if (path.endsWith('/order-cash')) {
      submits += 1;
      if (mode === 'unauthorized') return new Response('fixture-secret', { status: 401 });
      if (mode === 'timeout') throw new Error('network timeout after broker accepted');
      if (mode === 'reject') return Response.json({ rt_cd: '1', msg_cd: 'TEST_REJECT', msg1: 'secret upstream text' });
      if (mode === 'error-code-only') return Response.json({ error_code: 'EGW00103', error_description: 'secret upstream text' });
      return Response.json(response.receipt);
    }
    assert.fail(`unexpected endpoint: ${path}`);
  };
  const store = new Store(':memory:');
  const client = new KisClient({ key: 'key', secret: 'secret', account: '00000000', product: '01' }, transport, spacing);
  return { store, client, broker: new PaperBroker(store, client, approval), count: () => submits, response, requests };
}
const input = () => ({ code: '005930', side: 'buy' as const, qty: 1, price: 70000, requestId: randomUUID() });
const brokerRow = (overrides: Record<string, string> = {}) => ({ odno: '0000000001', ord_dt: koreaDate(), pdno: '005930', prdt_name: '삼성전자', sll_buy_dvsn_cd: '02', ord_qty: '1', ord_unpr: '70000', tot_ccld_qty: '0', rmn_qty: '1', cncl_yn: 'N', ord_gno_brno: '12345', ...overrides });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

test('external refresh waits for the complete submit preflight without internal refresh deadlock', { timeout: 3000 }, async () => {
  const f = fixture('success', 20);
  const quoteEntered = deferred(), releaseQuote = deferred();
  f.response.before = async path => { if (path.endsWith('/inquire-price')) { quoteEntered.resolve(); await releaseQuote.promise; } };
  try {
    const submission = f.broker.submit(input()); await quoteEntered.promise;
    const refresh = f.broker.refresh(); releaseQuote.resolve();
    await Promise.all([submission, refresh]);
    const paths = f.requests.map(r => r.url.pathname.split('/').at(-1));
    const post = paths.indexOf('order-cash');
    assert.ok(paths.lastIndexOf('inquire-daily-ccld') > post, `external refresh interleaved: ${paths.join(',')}`);
    assert.equal(f.count(), 1);
    for (let i = 1; i < f.requests.length; i++) assert.ok(f.requests[i].startedAt - f.requests[i - 1].startedAt >= 20, 'submit/refresh transport spacing');
  } finally { releaseQuote.resolve(); f.store.close(); }
});

test('paced unknown recovery preserves request spacing and never resends the order', async () => {
  const f = fixture('timeout', 20);
  try {
    const order = input();
    assert.equal((await f.broker.submit(order)).status, 'unknown');
    assert.equal((await f.broker.submit(order)).status, 'unknown');
    f.response.rows = [brokerRow()];
    const preview = await f.broker.inspectRecovery(order.requestId);
    const confirm = { id: order.requestId, evidenceId: preview.evidenceId, brokerId: '001', organization: '12345', confirmed: true as const };
    f.response.rows = [brokerRow({ tot_ccld_qty: '1', rmn_qty: '0' })];
    const recovered = await Promise.all([f.broker.confirmRecovery(confirm), f.broker.confirmRecovery(confirm)]);
    assert.deepEqual(recovered.map(row => row.status), ['filled', 'filled']);
    assert.equal(f.count(), 1);
    assert.equal(f.store.paperAudit(order.requestId).filter(row => row.action === 'recovery-confirm').length, 1);
    for (let i = 1; i < f.requests.length; i++) assert.ok(f.requests[i].startedAt - f.requests[i - 1].startedAt >= 20, 'recovery transport spacing');
  } finally { f.store.close(); }
});

test('a receipt without success code or a valid broker identity stays unknown and is never resent', async () => {
  for (const receipt of [{ output: { ODNO: '001', KRX_FWDG_ORD_ORGNO: '12345' } }, { rt_cd: '0', output: { ODNO: '0', KRX_FWDG_ORD_ORGNO: '12345' } }, { rt_cd: '0', output: { ODNO: 'fixture-secret', KRX_FWDG_ORD_ORGNO: '12345' } }]) {
    const f = fixture('success'); try {
      f.response.receipt = receipt; const order = input();
      assert.equal((await f.broker.submit(order)).status, 'unknown');
      assert.equal((await f.broker.submit(order)).status, 'unknown'); assert.equal(f.count(), 1);
    } finally { f.store.close(); }
  }
});

test('non-credit buying power uses the documented quantity query and lower available cash', async () => {
  const f = fixture('success'); try {
    f.response.nonCreditCash = '60000';
    await assert.rejects(f.broker.submit(input()), /미수 없는/); assert.equal(f.count(), 0);
    const query = f.requests.find(row => row.url.pathname.endsWith('/inquire-psbl-order'))!.url.searchParams;
    assert.equal(query.get('ORD_DVSN'), '01'); assert.equal(query.get('CMA_EVLU_AMT_ICLD_YN'), 'N'); assert.equal(query.get('OVRS_ICLD_YN'), 'N');
  } finally { f.store.close(); }
});

test('partial fills and contradictory cancellation snapshots cannot regress confirmed fills', async () => {
  const f = fixture('success'); try {
    await f.broker.submit({ ...input(), qty: 3 });
    f.response.rows = [brokerRow({ ord_qty: '3', tot_ccld_qty: '1', rmn_qty: '2' })];
    assert.equal((await f.broker.refresh()).orders[0].status, 'partial');
    f.response.rows = [brokerRow({ ord_qty: '3', rmn_qty: '3' })];
    let order = (await f.broker.refresh()).orders[0]; assert.equal(order.status, 'unknown'); assert.equal(order.filled, 1);
    f.response.rows = [brokerRow({ ord_qty: '3', tot_ccld_qty: '1', rmn_qty: '2', cncl_yn: 'Y' })];
    assert.equal((await f.broker.refresh()).orders[0].status, 'unknown');
    f.response.rows = [brokerRow({ ord_qty: '3', tot_ccld_qty: '2', rmn_qty: '0', cncl_yn: 'Y' })];
    order = (await f.broker.refresh()).orders[0]; assert.equal(order.status, 'cancelled'); assert.equal(order.filled, 2); assert.equal(f.count(), 1);
    const audited = f.store.paperAudit(order.requestId).filter(row => row.action === 'reconcile');
    assert.deepEqual(audited.map(row => row.after), ['partial', 'unknown', 'cancelled']);
  } finally { f.store.close(); }
});

test('reconciliation rejects a reused broker ID with different price or organization', async () => {
  for (const mismatch of [{ ord_unpr: '70100' }, { ord_gno_brno: '54321' }] as Record<string, string>[]) {
    const f = fixture('success'); try {
      await f.broker.submit(input()); f.response.rows = [brokerRow(mismatch)];
      assert.equal((await f.broker.refresh()).orders[0].status, 'unknown');
      await assert.rejects(f.broker.submit(input()), /불명/); assert.equal(f.count(), 1);
    } finally { f.store.close(); }
  }
});

test('impossible fill quantities and duplicate broker rows cannot release an unknown order', async () => {
  for (const rows of [[brokerRow({ tot_ccld_qty: '2', rmn_qty: '0' })], [brokerRow(), brokerRow()]]) {
    const f = fixture('success'); try {
      const order = await f.broker.submit(input()); f.store.savePaper({ ...order, status: 'unknown' }); f.response.rows = rows;
      await assert.rejects(f.broker.refresh(), /계약|중복|수량/);
      assert.equal(f.store.paperOrders()[0].status, 'unknown');
    } finally { f.store.close(); }
  }
});

test('next trading day reconciles the original order date and never infers cancellation from absence', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-13T02:00:00Z') });
  const f = fixture('success'); try {
    const order = await f.broker.submit(input());
    t.mock.timers.tick(3 * 86400000);
    assert.equal((await f.broker.refresh()).orders[0].status, 'unknown');
    assert.ok(f.requests.some(r => r.url.searchParams.get('INQR_STRT_DT') === '20261113'));
    assert.ok(f.requests.some(r => r.url.searchParams.get('INQR_STRT_DT') === '20261116'));
    f.response.rows = [brokerRow({ ord_dt: order.tradeDate, rmn_qty: '0', cncl_yn: 'Y' })];
    assert.equal((await f.broker.refresh()).orders[0].status, 'cancelled'); assert.equal(f.count(), 1);
  } finally { f.store.close(); }
});

let apiPort = 4349;
async function apiFixture(run: (f: ReturnType<typeof fixture>, post: (path: string, body: unknown) => Promise<Response>, get: (path: string) => Promise<Response>) => Promise<void>) {
  const f = fixture('timeout'); const port = apiPort++;
  const server = makeServer(f.store, f.client, [port]); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}/api/kis/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify(body) });
  try { await run(f, post, path => fetch(`http://127.0.0.1:${port}/api/kis/${path}`)); }
  finally { server.closeAllConnections(); server.close(); await once(server, 'close'); f.store.close(); }
}

test('unsupported VTS cancel and revise fail closed without authentication or broker traffic', async () => {
  await apiFixture(async (f, post, get) => {
    const capabilities = await get('capabilities'); assert.equal(capabilities.status, 200);
    assert.equal((await capabilities.json()).changeOrders.status, 'blocked');
    const order = { ...input(), status: 'partial' as const, filled: 1, qty: 3, remaining: 2, brokerId: '001', organization: '12345', tradeDate: koreaDate(), createdAt: new Date().toISOString(), message: '부분체결' }; f.store.savePaper(order);
    for (const action of ['cancel', 'revise']) {
      const responses = await Promise.all([post(action, { id: order.requestId }), post(action, { id: order.requestId })]);
      assert.deepEqual(responses.map(r => r.status), [409, 409]);
      for (const response of responses) assert.match((await response.json()).error, /모의.*미지원/);
    }
    assert.equal(f.requests.length, 0); assert.deepEqual(f.store.paperOrders()[0], order);
  });
});

test('blocked duplicate cancellation racing with a fill only changes the ledger through REST evidence', async () => {
  await apiFixture(async (f, post) => {
    const order = { ...input(), status: 'partial' as const, filled: 1, qty: 3, remaining: 2, brokerId: '001', organization: '12345', tradeDate: koreaDate(), createdAt: new Date().toISOString(), message: '부분체결' }; f.store.savePaper(order);
    f.response.rows = [brokerRow({ ord_qty: '3', tot_ccld_qty: '3', rmn_qty: '0' })];
    const responses = await Promise.all([post('orders', {}), post('cancel', { id: order.requestId }), post('cancel', { id: order.requestId })]);
    assert.deepEqual(responses.map(r => r.status), [200, 409, 409]);
    assert.equal(f.store.paperOrders()[0].status, 'filled'); assert.equal(f.store.paperOrders()[0].filled, 3);
    assert.equal(f.store.paperAudit(order.requestId).at(-1)!.action, 'reconcile');
    assert.equal(f.requests.filter(row => row.init!.method === 'POST' && !row.url.pathname.endsWith('/tokenP')).length, 0);
  });
});

test('numberless unknown recovery requires recorded inspection and explicit fresh confirmation; duplicates are idempotent', async () => {
  await apiFixture(async (f, post, get) => {
    const order = input(); assert.equal((await f.broker.submit(order)).status, 'unknown');
    f.response.rows = [brokerRow()];
    await f.broker.refresh(); assert.equal(f.store.paperOrders()[0].status, 'unknown');
    const response = await post('recovery/inspect', { id: order.requestId }); assert.equal(response.status, 200);
    const preview = await response.json(); assert.equal(preview.candidates.length, 1); assert.equal(preview.order.status, 'unknown');
    const confirm = { id: order.requestId, evidenceId: preview.evidenceId, brokerId: '001', organization: '12345', confirmed: true };
    assert.equal((await post('recovery/confirm', { ...confirm, confirmed: false })).status, 400);
    f.response.rows = [brokerRow({ tot_ccld_qty: '1', rmn_qty: '0' })];
    const responses = await Promise.all([post('recovery/confirm', confirm), post('recovery/confirm', confirm)]);
    assert.deepEqual(responses.map(r => r.status), [200, 200]);
    assert.equal(f.store.paperOrders()[0].status, 'filled'); assert.equal(f.count(), 1);
    assert.equal((await post('recovery/confirm', { ...confirm, brokerId: '002' })).status, 400);
    const audit = (await (await get(`audit?requestId=${order.requestId}`)).json()).audit;
    const recovered = audit.filter((row: { action: string }) => row.action === 'recovery-confirm');
    assert.equal(recovered.length, 1); assert.equal(recovered[0].actor, 'local-user'); assert.ok(Date.parse(recovered[0].at));
    assert.equal(recovered[0].before, 'unknown'); assert.equal(recovered[0].after, 'filled');
    assert.equal(recovered[0].evidence.orders[0].filled, 1); assert.equal(recovered[0].evidence.balance.totalEquity, 10000000);
    assert.equal(recovered[0].recovery.evidenceId, preview.evidenceId);
    assert.ok(!JSON.stringify(audit).includes('test-token'));
  });
});

test('empty, ambiguous or changed recovery evidence leaves unknown and sends nothing', async () => {
  await apiFixture(async (f, post) => {
    const order = input(); await f.broker.submit(order);
    for (const rows of [[], [brokerRow(), brokerRow({ odno: '002' })]]) {
      f.response.rows = rows;
      const response = await post('recovery/inspect', { id: order.requestId }); assert.equal(response.status, 200);
      const preview = await response.json();
      assert.equal((await post('recovery/confirm', { id: order.requestId, evidenceId: preview.evidenceId, brokerId: '001', organization: '12345', confirmed: true })).status, 400);
      assert.equal(f.store.paperOrders()[0].status, 'unknown');
    }
    f.response.rows = [brokerRow()];
    const preview = await (await post('recovery/inspect', { id: order.requestId })).json();
    f.response.rows = [brokerRow({ ord_unpr: '71000' })];
    assert.equal((await post('recovery/confirm', { id: order.requestId, evidenceId: preview.evidenceId, brokerId: '001', organization: '12345', confirmed: true })).status, 400);
    assert.equal(f.store.paperOrders()[0].status, 'unknown'); assert.equal(f.count(), 1);
  });
});

test('recovery evidence expires, cannot bind another local order, and never clears on a read failure', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-16T02:00:00Z') });
  const f = fixture('timeout'); try {
    const order = await f.broker.submit(input()); f.response.rows = [brokerRow()];
    const inspect = await f.broker.inspectRecovery(order.requestId);
    const confirm = { id: order.requestId, evidenceId: inspect.evidenceId, brokerId: '001', organization: '12345', confirmed: true as const };
    t.mock.timers.tick(300001); await assert.rejects(f.broker.confirmRecovery(confirm), /유효기간/);
    const next = await f.broker.inspectRecovery(order.requestId);
    f.store.savePaper({ ...order, requestId: randomUUID(), status: 'accepted', brokerId: '1', organization: '12345' });
    await assert.rejects(f.broker.confirmRecovery({ ...confirm, evidenceId: next.evidenceId }), /다른 로컬 주문/);
    f.response.before = async path => { if (path.endsWith('/inquire-daily-ccld')) throw new Error('fixture-secret'); };
    await assert.rejects(f.broker.confirmRecovery({ ...confirm, evidenceId: next.evidenceId }), /통신/);
    assert.equal(f.store.paperOrders().find(row => row.requestId === order.requestId)!.status, 'unknown');
    assert.equal(f.count(), 1); assert.equal(f.store.paperAudit(order.requestId).filter(row => row.action === 'recovery-confirm').length, 0);
  } finally { f.store.close(); }
});

test('restart persists recovery evidence and atomic audit, and audit failure rolls back the recovery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock03-recovery-')); const path = join(directory, 'state.sqlite');
  const f = fixture('success'); let store = new Store(path); let db: DatabaseSync | undefined;
  try {
    const inputOrder = input();
    store.savePaper({ ...inputOrder, status: 'sending', tradeDate: koreaDate(), createdAt: new Date().toISOString(), filled: 0, remaining: 1, message: '전송 중' });
    store.close(); store = new Store(path);
    assert.equal(store.paperOrders()[0].status, 'unknown'); assert.equal(f.requests.length, 0);
    assert.equal(store.paperAudit(inputOrder.requestId)[0].action, 'restart');
    f.response.rows = [brokerRow()]; let broker = new PaperBroker(store, f.client);
    const preview = await broker.inspectRecovery(inputOrder.requestId);
    store.close(); store = new Store(path); broker = new PaperBroker(store, f.client);
    assert.equal(store.paperAudit(inputOrder.requestId).filter(row => row.action === 'restart').length, 1);
    db = new DatabaseSync(path); db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON paper_audit BEGIN SELECT RAISE(FAIL, 'audit full'); END;");
    const confirm = { id: inputOrder.requestId, evidenceId: preview.evidenceId, brokerId: '001', organization: '12345', confirmed: true as const };
    await assert.rejects(broker.confirmRecovery(confirm), /audit full/);
    assert.equal(store.paperOrders()[0].status, 'unknown'); assert.equal(store.paperAudit(inputOrder.requestId).length, 2);
    db.exec('DROP TRIGGER fail_audit');
    const recovered = await broker.confirmRecovery(confirm); assert.equal(recovered.status, 'accepted');
    store.close(); store = new Store(path);
    assert.equal(store.paperOrders()[0].brokerId, '0000000001'); assert.equal(store.paperAudit(inputOrder.requestId).at(-1)!.action, 'recovery-confirm');
    assert.equal(f.count(), 0);
  } finally { db?.close(); store.close(); f.store.close(); rmSync(directory, { recursive: true }); }
});

test('paper order, queries and recovery only use the documented mock domain and TR IDs without fallback', async () => {
  const f = fixture('timeout'); try {
    const order = await f.broker.submit(input()); f.response.rows = [brokerRow()];
    const preview = await f.broker.inspectRecovery(order.requestId);
    await f.broker.confirmRecovery({ id: order.requestId, evidenceId: preview.evidenceId, brokerId: '001', organization: '12345', confirmed: true });
    const allowed = new Map([['inquire-balance', 'VTTC8434R'], ['inquire-daily-ccld', 'VTTC0081R'], ['inquire-price', 'FHKST01010100'], ['inquire-psbl-order', 'VTTC8908R'], ['order-cash', 'VTTC0012U']]);
    for (const request of f.requests) {
      assert.equal(request.url.origin, 'https://openapivts.koreainvestment.com:29443'); assert.equal(request.init!.redirect, 'error');
      const endpoint = request.url.pathname.split('/').at(-1)!;
      if (endpoint !== 'tokenP') assert.equal(new Headers(request.init!.headers).get('tr_id'), allowed.get(endpoint));
    }
    const sends = f.requests.filter(row => row.url.pathname.endsWith('/order-cash')); assert.equal(sends.length, 1);
    const body = JSON.parse(String(sends[0].init!.body)); assert.equal(body.EXCG_ID_DVSN_CD, 'KRX'); assert.equal(body.ORD_DVSN, '00');
    assert.equal(body.ORD_QTY, '1'); assert.equal(body.ORD_UNPR, '70000');
  } finally { f.store.close(); }
});
test('paper order retries and concurrent duplicate requests send once and persist receipt', async () => {
  const f = fixture('success'); try {
    const order = input(); const [first, second] = await Promise.all([f.broker.submit(order), f.broker.submit(order)]);
    assert.equal(first.status, 'accepted'); assert.equal(second.brokerId, '001'); assert.equal(f.count(), 1); assert.equal(f.store.paperOrders().length, 1);
    await assert.rejects(f.broker.submit({ ...order, qty: 2 }), /동일/);
  } finally { f.store.close(); }
});
test('paper loss guard uses broker total equity rather than unsettled cash', async () => {
  const f = fixture('success'); try {
    f.store.paperBaseline(koreaDate(), 10000000);
    f.response.totalEquity = '9600000';
    await assert.rejects(f.broker.submit(input()), /손실/); assert.equal(f.count(), 0);
    f.response.cash = '9000000'; f.response.totalEquity = '10000000';
    assert.equal((await f.broker.submit(input())).status, 'accepted');
  } finally { f.store.close(); }
});
test('paper reconciliation matches numeric broker IDs and closes partial fills with no remainder', async () => {
  const f = fixture('success'); try {
    const order = { ...input(), qty: 3 }; await f.broker.submit(order);
    f.response.rows = [{ odno: '0000000001', ord_dt: koreaDate(), pdno: '005930', prdt_name: '삼성전자', sll_buy_dvsn_cd: '02', ord_qty: '3', ord_unpr: '70000', tot_ccld_qty: '1', rmn_qty: '2', cncl_yn: 'N', ord_gno_brno: '12345' }];
    assert.equal((await f.broker.refresh()).orders[0].status, 'partial');
    f.response.rows[0].rmn_qty = '0';
    const final = (await f.broker.refresh()).orders[0];
    assert.equal(final.status, 'cancelled'); assert.equal(final.filled, 1); assert.equal(final.remaining, 0);
    f.response.rows = []; assert.equal((await f.broker.refresh()).orders[0].status, 'cancelled');
  } finally { f.store.close(); }
});
test('missing or mismatched broker order remains unknown and prevents another send', async () => {
  const f = fixture('success'); try {
    await f.broker.submit(input());
    f.response.rows = [{ odno: '001', ord_dt: koreaDate(), pdno: '000660', prdt_name: '다른 종목', sll_buy_dvsn_cd: '02', ord_qty: '1', ord_unpr: '70000', tot_ccld_qty: '1', rmn_qty: '0', cncl_yn: 'N', ord_gno_brno: '12345' }];
    assert.equal((await f.broker.refresh()).orders[0].status, 'unknown');
    await assert.rejects(f.broker.submit(input()), /응답 불명/); assert.equal(f.count(), 1);
  } finally { f.store.close(); }
});
test('ambiguous paper send stays unknown, same ID does not resend, new orders are blocked', async () => {
  const f = fixture('timeout'); try {
    const order = input(); assert.equal((await f.broker.submit(order)).status, 'unknown');
    assert.equal((await f.broker.submit(order)).status, 'unknown'); assert.equal(f.count(), 1);
    await assert.rejects(f.broker.submit(input()), /응답 불명/); assert.equal(f.count(), 1);
  } finally { f.store.close(); }
});
test('broker rejection is distinct from unknown and never leaks upstream body', async () => {
  const f = fixture('reject'); try {
    const result = await f.broker.submit(input()); assert.equal(result.status, 'rejected'); assert.match(result.message, /TEST_REJECT/); assert.ok(!result.message.includes('secret'));
  } finally { f.store.close(); }
});
test('an undocumented order error_code-only response stays unknown and blocks retransmission', async () => {
  const f = fixture('error-code-only'); try {
    const order = input(); const result = await f.broker.submit(order);
    assert.equal(result.status, 'unknown'); assert.ok(!result.message.includes('secret'));
    assert.equal((await f.broker.submit(order)).status, 'unknown'); assert.equal(f.count(), 1);
    await assert.rejects(f.broker.submit(input()), /응답 불명/); assert.equal(f.count(), 1);
  } finally { f.store.close(); }
});
test('paper risk limits fail before broker mutation and sell cannot exceed holdings', async () => {
  const f = fixture('success'); try {
    f.store.update(state => { state.risk.halted = true; }); await assert.rejects(f.broker.submit(input()), /정지/); assert.equal(f.count(), 0);
    f.store.update(state => { state.risk.halted = false; }); await assert.rejects(f.broker.submit({ ...input(), side: 'sell' }), /보유/); assert.equal(f.count(), 0);
    await assert.rejects(f.broker.submit({ ...input(), qty: 20 }), /주문 한도/); assert.equal(f.count(), 0);
  } finally { f.store.close(); }
});

test('HTTP 401 on the order POST preserves unknown classification and prevents automatic resend', async () => {
  const f = fixture('unauthorized'); try {
    const order = input(); const result = await f.broker.submit(order);
    assert.equal(result.status, 'unknown'); assert.ok(!result.message.includes('fixture-secret'));
    await f.broker.submit(order); assert.equal(f.count(), 1);
    await assert.rejects(f.broker.submit(input()), /응답 불명/); assert.equal(f.count(), 1);
  } finally { f.store.close(); }
});

const approvedInput = () => ({ ...input(), code: '069500' });
const approvalFor = (order: ReturnType<typeof input>) => ({ date: '2026-11-16', requestId: order.requestId });

test('approved paper run allows only the fixed ID, symbol, buy, one share and 100000 ceiling', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, approvalFor(order));
  try {
    for (const invalid of [{ ...order, code: '005930' }, { ...order, qty: 2 }, { ...order, side: 'sell' as const }, { ...order, price: 100001 }, { ...order, requestId: randomUUID() }]) {
      await assert.rejects(f.broker.submit(invalid), /승인/);
    }
    assert.equal(f.requests.length, 0);
    assert.equal((await f.broker.submit(order)).status, 'accepted'); assert.equal(f.count(), 1);
    assert.equal(f.store.read().risk.halted, true);
    assert.equal((await f.broker.submit(order)).status, 'accepted'); assert.equal(f.count(), 1);
    await assert.rejects(f.broker.submit({ ...order, requestId: randomUUID() }), /승인/);
    await assert.rejects(new PaperBroker(f.store, f.client, approvalFor(order)).submit({ ...order, price: 70100 }), /동일/);
    assert.throws(() => new PaperBroker(f.store, f.client, { ...approvalFor(order), requestId: randomUUID() }), /승인/);
  } finally { f.store.close(); }
});

test('approved paper run checks the actual send window again after quote and buying-power wait', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T08:59:59+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, approvalFor(order));
  try {
    await assert.rejects(f.broker.submit(order), /시간/); assert.equal(f.requests.length, 0);
    t.mock.timers.setTime(new Date('2026-11-16T15:29:59+09:00').getTime());
    f.response.before = async path => { if (path.endsWith('/inquire-psbl-order')) t.mock.timers.tick(1001); };
    assert.equal((await f.broker.submit(order)).status, 'rejected');
    assert.equal(f.count(), 0); assert.equal(f.store.read().risk.halted, true);
  } finally { f.store.close(); }
});

test('approved paper run admits the regular session and rejects pre-open, close and wrong dates', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T09:00:00+09:00') });
  for (const [at, allowed] of [
    ['2026-11-16T08:59:59.999+09:00', false], ['2026-11-16T09:00:00+09:00', true],
    ['2026-11-16T10:10:00+09:00', true], ['2026-11-16T12:00:00+09:00', true],
    ['2026-11-16T15:29:59.999+09:00', true], ['2026-11-16T15:30:00+09:00', false],
    ['2026-11-15T12:00:00+09:00', false], ['2026-11-17T12:00:00+09:00', false],
  ] as const) {
    t.mock.timers.setTime(new Date(at).getTime());
    const order = approvedInput(); const f = fixture('success', 0, approvalFor(order));
    try {
      if (allowed) {
        assert.equal((await f.broker.submit(order)).status, 'accepted', at);
        assert.equal(f.count(), 1); assert.equal(f.store.read().risk.halted, true);
        await f.broker.submit(order); assert.equal(f.count(), 1);
      } else {
        await assert.rejects(f.broker.submit(order), /시간/, at); assert.equal(f.requests.length, 0, at);
      }
    } finally { f.store.close(); }
  }
});

test('cancel probe cannot send after regular-session close even within its 120-second budget', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T15:29:58+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, { ...approvalFor(order), cancelProbe: true });
  try {
    await f.broker.submit(order);
    t.mock.timers.setTime(new Date('2026-11-16T15:30:00+09:00').getTime());
    await assert.rejects(f.broker.cancelProbe(order.requestId), /시간/);
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 0);
    assert.equal(f.store.paperOrders()[0].status, 'accepted');
  } finally { f.store.close(); }
});

test('approved paper run rejects stale quote and never retries a failed preflight', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, approvalFor(order));
  try {
    f.response.before = async path => { if (path.endsWith('/inquire-psbl-order')) t.mock.timers.tick(5001); };
    assert.equal((await f.broker.submit(order)).status, 'rejected');
    assert.equal(f.count(), 0); assert.equal(f.store.read().risk.halted, true);
    await f.broker.submit(order); assert.equal(f.count(), 0);
  } finally { f.store.close(); }
});

test('approved paper run rejects existing holdings, pending orders, cash equality and invalid quote ticks', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  for (const scenario of ['holding', 'pending', 'cash', 'power', 'price', 'tick', 'slow-quote']) {
    const order = approvedInput(); const f = fixture('success', 0, approvalFor(order));
    try {
      if (scenario === 'holding') f.response.positions = [{ pdno: '069500', prdt_name: 'fixture', hldg_qty: '1', pchs_avg_pric: '70000' }];
      if (scenario === 'pending') f.response.rows = [brokerRow()];
      if (scenario === 'cash') f.response.cash = '70000';
      if (scenario === 'power') f.response.nonCreditCash = '70000';
      if (scenario === 'price') f.response.price = '70100';
      if (scenario === 'tick') f.response.tick = '300';
      if (scenario === 'slow-quote') f.response.before = async path => { if (path.endsWith('/inquire-price')) t.mock.timers.tick(5001); };
      await assert.rejects(f.broker.submit(order), /승인/); assert.equal(f.count(), 0, scenario);
      assert.equal(f.store.read().risk.halted, true);
      f.store.update(state => { state.risk.halted = false; });
      await assert.rejects(new PaperBroker(f.store, f.client, approvalFor(order)).submit(order), /사용/);
      assert.equal(f.count(), 0);
    } finally { f.store.close(); }
  }
});

test('approved paper run halts after success, rejection or unknown and stops all KIS reads at 120 seconds', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  for (const mode of ['success', 'reject', 'timeout'] as const) {
    const order = approvedInput(); const f = fixture(mode, 0, approvalFor(order));
    try {
      const result = await f.broker.submit(order);
      assert.equal(result.status, mode === 'success' ? 'accepted' : mode === 'reject' ? 'rejected' : 'unknown');
      assert.equal(f.store.read().risk.halted, true); assert.equal(f.count(), 1);
      f.response.rows = [brokerRow({ pdno: '069500', tot_ccld_qty: '1', rmn_qty: '0' })];
      await f.broker.refresh();
      t.mock.timers.tick(120000); const calls = f.requests.length;
      await assert.rejects(f.broker.refresh(), /조회 시간/); assert.equal(f.requests.length, calls);
      await assert.rejects(f.client.quote('069500', true), /조회 시간/); assert.equal(f.requests.length, calls);
    } finally { f.store.close(); }
  }
});

test('approved attempt and halt survive SQLite restart, with no unguarded server or new approval ID', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const directory = mkdtempSync(join(tmpdir(), 'paper-approval-')); const path = join(directory, 'ledger.sqlite');
  const order = approvedInput(); const approval = approvalFor(order); const f = fixture('success'); let store = new Store(path);
  try {
    const broker = new PaperBroker(store, f.client, approval);
    const results = await Promise.all([broker.submit(order), broker.submit(order)]);
    assert.deepEqual(results.map(row => row.status), ['accepted', 'accepted']); assert.equal(f.count(), 1);
    store.close(); store = new Store(path);
    assert.equal(store.read().risk.halted, true);
    assert.throws(() => new PaperBroker(store, f.client), /승인 설정/);
    assert.throws(() => new PaperBroker(store, f.client, { ...approval, date: '2026-11-17' }), /승인/);
    const restarted = new PaperBroker(store, f.client, approval); const calls = f.requests.length;
    assert.equal((await restarted.submit(order)).status, 'accepted');
    await assert.rejects(restarted.refresh(), /조회 시간/); assert.equal(f.requests.length, calls); assert.equal(f.count(), 1);
  } finally { store.close(); f.store.close(); rmSync(directory, { recursive: true }); }
});

test('approved HTTP order path exposes the active restriction and persists halt without enabling cancel', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const f = fixture('success'); const port = apiPort++;
  const server = makeServer(f.store, f.client, [port], approvalFor(order));
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${port}`;
  const headers = { 'content-type': 'application/json', 'x-workbench': 'local' };
  try {
    const ledgerResponse = await fetch(`${base}/api/kis/ledger`, { headers }); assert.equal(ledgerResponse.status, 200);
    const ledger = await ledgerResponse.json();
    assert.deepEqual(ledger.minimumRun, { active: true, ...approvalFor(order) }); assert.equal(f.requests.length, 0);
    const response = await fetch(`${base}/api/kis/order`, { method: 'POST', headers, body: JSON.stringify(order) });
    assert.equal(response.status, 200); assert.equal((await response.json()).order.status, 'accepted');
    assert.equal(f.store.read().risk.halted, true); assert.equal(f.count(), 1);
    const blocked = await fetch(`${base}/api/kis/cancel`, { method: 'POST', headers, body: JSON.stringify({ id: order.requestId }) });
    assert.equal(blocked.status, 409); assert.equal(f.count(), 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); f.store.close(); }
});

test('approved run cannot send when durable claim fails', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const directory = mkdtempSync(join(tmpdir(), 'paper-claim-')); const path = join(directory, 'ledger.sqlite');
  const order = approvedInput(); const f = fixture('success'); const store = new Store(path); const db = new DatabaseSync(path);
  try {
    const broker = new PaperBroker(store, f.client, approvalFor(order));
    db.exec("CREATE TRIGGER fail_claim BEFORE UPDATE ON paper_run BEGIN SELECT RAISE(FAIL, 'claim full'); END;");
    await assert.rejects(broker.submit(order), /claim full/); assert.equal(f.requests.length, 0); assert.equal(f.count(), 0);
  } finally { db.close(); store.close(); f.store.close(); rmSync(directory, { recursive: true }); }
});

test('read deadline aborts an in-flight response and a monotonic expiry survives a backwards wall clock', async t => {
  const credentials = { key: 'key', secret: 'secret', account: '00000000', product: '01' };
  let calls = 0;
  const client = new KisClient(credentials, async (_url, init) => {
    calls++;
    await new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    throw new Error('unreachable');
  }, 0);
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    client.limitRequestsFor(30);
    await assert.rejects(client.balance(), /통신 실패/); assert.equal(calls, 1);
    let mono = 10; t.mock.method(performance, 'now', () => mono);
    const other = new KisClient(credentials, async () => { calls++; return Response.json({}); }, 0);
    other.limitRequestsFor(120000); mono += 120001;
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2000-01-01') });
    await assert.rejects(other.balance(), /조회 시간/); assert.equal(calls, 1);
  } finally { clearTimeout(keepAlive); }
});

test('approved interrupted attempt restores the visible halt as well as preventing more requests', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const directory = mkdtempSync(join(tmpdir(), 'paper-interrupted-')); const path = join(directory, 'ledger.sqlite');
  const order = approvedInput(); const f = fixture('success'); let store = new Store(path);
  try {
    new PaperBroker(store, f.client, approvalFor(order)); store.claimPaperRun();
    store.savePaper({ ...order, createdAt: new Date().toISOString(), tradeDate: koreaDate(), status: 'sending', filled: 0, remaining: 1, message: 'fixture interrupted' });
    store.close(); store = new Store(path);
    const broker = new PaperBroker(store, f.client, approvalFor(order));
    assert.equal(store.read().risk.halted, true); assert.equal(store.paperOrders()[0].status, 'unknown');
    assert.equal((await broker.submit(order)).status, 'unknown'); assert.equal(f.count(), 0);
    await assert.rejects(broker.refresh(), /조회 시간/); assert.equal(f.requests.length, 0);
  } finally { store.close(); f.store.close(); rmSync(directory, { recursive: true }); }
});

test('approved paper run fits the quote budget with production 1100ms pacing and isolated fixture traffic', { timeout: 20000 }, async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const f = fixture('success', 1100, approvalFor(order));
  try {
    assert.equal((await f.broker.submit(order)).status, 'accepted'); assert.equal(f.count(), 1);
    assert.equal(f.store.read().risk.halted, true);
    for (let i = 1; i < f.requests.length; i++) assert.ok(f.requests[i].startedAt - f.requests[i - 1].startedAt >= 1100);
  } finally { f.store.close(); }
});

test('experimental cancellation requires explicit approval before any broker traffic', async () => {
  await apiFixture(async (f, post) => {
    const response = await post('cancel-probe', { id: randomUUID() });
    assert.equal(response.status, 409);
    assert.equal(f.requests.length, 0);
  });
});

test('cancel probe sends one VTS full-cancel and ACK stays unknown until REST reconciliation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, { ...approvalFor(order), cancelProbe: true });
  try {
    await f.broker.submit(order);
    const results = await Promise.allSettled([f.broker.cancelProbe(order.requestId), f.broker.cancelProbe(order.requestId)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.equal(f.store.paperOrders()[0].status, 'unknown'); assert.equal(f.store.read().risk.halted, true);
    const calls = f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl'));
    assert.equal(calls.length, 1); assert.equal(calls[0].url.origin, 'https://openapivts.koreainvestment.com:29443');
    assert.equal(new Headers(calls[0].init?.headers).get('tr_id'), 'VTTC0013U');
    const body = JSON.parse(String(calls[0].init?.body));
    assert.equal(body.QTY_ALL_ORD_YN, 'Y'); assert.equal(body.ORD_QTY, '0'); assert.equal(body.ORD_UNPR, '0');
    assert.equal(body.ORGN_ODNO, '001'); assert.equal(body.KRX_FWDG_ORD_ORGNO, '12345');
    assert.equal(body.RVSE_CNCL_DVSN_CD, '02'); assert.equal(body.EXCG_ID_DVSN_CD, 'KRX');
    f.response.rows = [brokerRow({ pdno: '069500' })];
    await f.broker.refresh();
    await assert.rejects(f.broker.cancelProbe(order.requestId), /이미 시도/);
    f.response.rows = [brokerRow({ pdno: '069500', rmn_qty: '0', cncl_yn: 'Y' })];
    assert.equal((await f.broker.refresh()).orders[0].status, 'cancelled');
    assert.equal(f.count(), 1);
    assert.equal(f.store.paperAudit(order.requestId).filter(a => a.action === 'cancel-attempt').length, 1);
  } finally { f.store.close(); }
});

test('cancel rejection, lost response and malformed ACK consume attempt without retry or secret disclosure', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  for (const mode of ['reject', 'timeout', 'malformed', 'unauthorized', 'error-code-only']) {
    const order = approvedInput(); const approval = { ...approvalFor(order), cancelProbe: true as const };
    const f = fixture('success', 0, approval);
    try {
      await f.broker.submit(order); f.response.cancelMode = mode;
      const result = await f.broker.cancelProbe(order.requestId);
      assert.equal(result.status, 'unknown'); assert.doesNotMatch(result.message, /secret/);
      f.response.rows = [brokerRow({ pdno: '069500' })]; await f.broker.refresh();
      const restarted = new PaperBroker(f.store, f.client, approval);
      await assert.rejects(restarted.cancelProbe(order.requestId), /이미 시도/);
      assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 1);
    } finally { f.store.close(); }
  }
});

test('cancel probe rechecks regular-session close after waiting in the transport queue', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T15:29:58+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, { ...approvalFor(order), cancelProbe: true });
  const entered = deferred(), release = deferred();
  try {
    await f.broker.submit(order);
    f.response.before = async path => { if (path.endsWith('/inquire-price')) { entered.resolve(); await release.promise; } };
    const quote = f.client.quote('069500', true); await entered.promise;
    const cancellation = f.broker.cancelProbe(order.requestId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.store.paperOrders()[0].status, 'unknown');
    t.mock.timers.setTime(new Date('2026-11-16T15:30:00+09:00').getTime());
    release.resolve(); await quote;
    const result = await cancellation;
    assert.equal(result.status, 'unknown'); assert.match(result.message, /시간창/);
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 0);
    assert.equal(f.store.paperAudit(order.requestId).filter(a => a.action === 'cancel-attempt').length, 1);
  } finally { release.resolve(); f.store.close(); }
});

test('cancel probe rejects wrong identity, finished orders and expired attempts before sending', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, { ...approvalFor(order), cancelProbe: true });
  try {
    await f.broker.submit(order);
    await assert.rejects(f.broker.cancelProbe(randomUUID()), /승인/);
    t.mock.timers.setTime(new Date('2026-11-16T10:03:00+09:00').getTime());
    await assert.rejects(f.broker.cancelProbe(order.requestId), /시간/);
    f.store.savePaper({ ...f.store.paperOrders()[0], status: 'filled', filled: 1, remaining: 0 });
    await assert.rejects(f.broker.cancelProbe(order.requestId), /미체결/);
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 0);
  } finally { f.store.close(); }
});

test('cancel attempt survives disk reopen and a failed atomic audit prevents transmission', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const directory = mkdtempSync(join(tmpdir(), 'cancel-probe-')); const path = join(directory, 'ledger.sqlite');
  const order = approvedInput(); const approval = { ...approvalFor(order), cancelProbe: true as const };
  const f = fixture('success'); let store = new Store(path); const db = new DatabaseSync(path);
  try {
    const broker = new PaperBroker(store, f.client, approval); await broker.submit(order);
    db.exec("CREATE TRIGGER fail_cancel_audit BEFORE INSERT ON paper_audit WHEN json_extract(NEW.body,'$.action')='cancel-attempt' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
    await assert.rejects(broker.cancelProbe(order.requestId), /audit unavailable/);
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 0);
    assert.equal(store.paperOrders()[0].status, 'accepted');
    db.exec('DROP TRIGGER fail_cancel_audit;');
    await broker.cancelProbe(order.requestId);
    f.response.rows = [brokerRow({ pdno: '069500' })]; await broker.refresh();
    store.close(); store = new Store(path);
    const restarted = new PaperBroker(store, f.client, approval);
    await assert.rejects(restarted.cancelProbe(order.requestId), /이미 시도/);
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 1);
  } finally { db.close(); store.close(); f.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP cancel probe is opt-in while ordinary cancel and revise remain blocked', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const approval = { ...approvalFor(order), cancelProbe: true as const };
  const f = fixture('success'); const port = 15429;
  const server = makeServer(f.store, f.client, [port], approval);
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const post = (path: string, body: unknown) => fetch(`http://127.0.0.1:${port}/api/kis/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workbench': 'local' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post('order', order)).status, 200);
    for (const path of ['cancel', 'revise']) assert.equal((await post(path, { id: order.requestId })).status, 409);
    const response = await post('cancel-probe', { id: order.requestId });
    assert.equal(response.status, 200); assert.equal((await response.json()).order.status, 'unknown');
    assert.equal((await post('cancel-probe', { id: order.requestId })).status, 400);
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 1);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); f.store.close(); }
});

test('cancel probe expires while queued for transport and consumes its attempt without sending', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const f = fixture('success', 0, { ...approvalFor(order), cancelProbe: true });
  const entered = deferred(), release = deferred();
  try {
    await f.broker.submit(order);
    f.response.before = async path => { if (path.endsWith('/inquire-price')) { entered.resolve(); await release.promise; } };
    const quote = f.client.quote('069500', true); await entered.promise;
    const cancellation = f.broker.cancelProbe(order.requestId);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.store.paperOrders()[0].status, 'unknown');
    t.mock.timers.setTime(new Date('2026-11-16T10:03:00+09:00').getTime());
    release.resolve(); await quote;
    const result = await cancellation;
    assert.equal(result.status, 'unknown'); assert.match(result.message, /검증 시간이 종료/);
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 0);
    assert.equal(f.store.paperAudit(order.requestId).filter(a => a.action === 'cancel-attempt').length, 1);
  } finally { release.resolve(); f.store.close(); }
});

test('restart before the first cancel probe cannot open a fresh broker request window', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T10:01:00+09:00') });
  const order = approvedInput(); const approval = { ...approvalFor(order), cancelProbe: true as const };
  const f = fixture('success', 0, approval); const fresh = fixture('success');
  try {
    await f.broker.submit(order);
    const restarted = new PaperBroker(f.store, fresh.client, approval);
    const result = await restarted.cancelProbe(order.requestId);
    assert.equal(result.status, 'unknown'); assert.match(result.message, /인증을 완료하지 못해/);
    assert.equal(fresh.requests.length, 0);
    assert.equal(f.store.read().risk.halted, true);
    await assert.rejects(restarted.cancelProbe(order.requestId));
    assert.equal(fresh.requests.length, 0);
    assert.equal(f.store.paperAudit(order.requestId).filter(a => a.action === 'cancel-attempt').length, 1);
  } finally { f.store.close(); fresh.store.close(); }
});


test('Samsung approval pins symbol and cap across restart and supports one cancel probe', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T15:20:00+09:00') });
  const order = { ...input(), price: 195900 };
  const approval = { ...approvalFor(order), code: '005930' as const, maxAmount: 200000, cancelProbe: true as const };
  const f = fixture('success', 0, approval);
  try {
    f.response.price = '195900'; f.response.upper = '250000';
    assert.throws(() => new PaperBroker(f.store, f.client, { ...approval, code: '069500' }), /승인/);
    assert.throws(() => new PaperBroker(f.store, f.client, { ...approval, maxAmount: 100000 }), /승인/);
    for (const invalid of [{ ...order, code: '069500' }, { ...order, price: 200100 }, { ...order, qty: 2 }]) await assert.rejects(f.broker.submit(invalid), /승인/);
    assert.equal(f.count(), 0);
    assert.equal((await f.broker.submit(order)).status, 'accepted');
    await f.broker.submit(order); assert.equal(f.count(), 1);
    await f.broker.cancelProbe(order.requestId);
    await assert.rejects(f.broker.cancelProbe(order.requestId));
    assert.equal(f.requests.filter(r => r.url.pathname.endsWith('/order-rvsecncl')).length, 1);
    assert.equal(f.store.read().risk.halted, true);
  } finally { f.store.close(); }
});

test('approved quote failures distinguish price, tick and latency without submitting', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T15:20:00+09:00') });
  for (const reason of ['지정가 불일치', '호가 단위 오류', '시세 조회 지연']) {
    const order = approvedInput(); const f = fixture('success', 0, approvalFor(order));
    try {
      if (reason === '지정가 불일치') f.response.price = '70100';
      if (reason === '호가 단위 오류') f.response.tick = '300';
      if (reason === '시세 조회 지연') f.response.before = async path => { if (path.endsWith('/inquire-price')) t.mock.timers.tick(5001); };
      await assert.rejects(f.broker.submit(order), new RegExp(reason));
      assert.equal(f.count(), 0); assert.equal(f.store.read().risk.halted, true);
    } finally { f.store.close(); }
  }
});


test('explicit holding approval preserves existing positions and remains pinned on restart', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-16T15:22:00+09:00') });
  const order = input(); const approval = { ...approvalFor(order), code: '005930' as const, allowExistingHolding: true as const };
  const f = fixture('success', 0, approval);
  try {
    f.response.positions = [{ pdno: '005930', prdt_name: 'fixture', hldg_qty: '2', pchs_avg_pric: '70000' }];
    assert.throws(() => new PaperBroker(f.store, f.client, { ...approval, allowExistingHolding: undefined }), /승인/);
    assert.equal((await f.broker.submit(order)).status, 'accepted');
    assert.equal(f.count(), 1); assert.equal(f.store.read().risk.halted, true);
    assert.equal(f.response.positions[0].hldg_qty, '2');
  } finally { f.store.close(); }
});
