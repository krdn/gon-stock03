import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import type { StateSnapshot } from '../shared/model.ts';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';

test('실시간은 재시작 시 미연결이며 GET 상태는 비밀값이나 네트워크 호출 없이 차단 사유를 제공한다', async () => {
  const store = new Store(':memory:'); const server = makeServer(store, undefined, [4319]);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const port = (server.address() as AddressInfo).port;
    const state = await new Promise<StateSnapshot>((resolve, reject) => {
      const req = request(`http://127.0.0.1:${port}/api/state`, { headers: { Host: '127.0.0.1:4319' } }, res => {
        const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => { try { assert.equal(res.statusCode, 200); resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (error) { reject(error); } });
      });
      req.on('error', reject); req.end();
    });
    assert.equal(state.realtime?.phase, 'stopped');
    assert.equal(state.realtime?.ordersAllowed, false);
    assert.equal(state.realtime?.lastQuoteAt, null);
  } finally { server.close(); await once(server, 'close'); store.close(); }
});

import { EventEmitter } from 'node:events';
import { createCipheriv, randomUUID } from 'node:crypto';
import { Realtime, type SocketFactory } from '../server/realtime.ts';
import { PaperBroker, type PaperApproval } from '../server/paper.ts';
import { KisClient, koreaDate } from '../server/kis.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = Date.parse('2026-11-16T10:00:00+09:00');
const key = '0123456789abcdef0123456789abcdef', iv = '0123456789abcdef';
class FakeSocket extends EventEmitter {
  sent: string[] = []; pongs: string[] = []; closed = false;
  send(raw: string) { this.sent.push(raw); }
  pong(raw: string) { this.pongs.push(raw); }
  terminate() { this.closed = true; this.emit('close'); }
  frame(raw: string) { this.emit('message', Buffer.from(raw), false); }
  acknowledge() {
    for (const [tr_id, tr_key] of [['H0STCNT0', '005930'], ['H0STCNI9', 'fixture-hts']]) this.frame(JSON.stringify({ header: { tr_id, tr_key }, body: { rt_cd: '0', output: { key, iv } } }));
  }
}
const priceFrame = (volume = 1, price = 70000, hour = '100000', date = '20261116', stopped = 'N') => {
  const row = Array(47).fill('0'); row[0] = '005930'; row[1] = hour; row[2] = String(price); row[13] = String(volume); row[33] = date; row[35] = stopped;
  return '0|H0STCNT0|001|' + row.join('^');
};
function noticeFrame(qty = '1') {
  const row = Array(26).fill('0'); row[0] = 'fixture-private-customer'; row[1] = 'fixture-private-account'; row[2] = '0001'; row[8] = '005930'; row[9] = qty; row[13] = '2';
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  return '1|H0STCNI9|001|' + Buffer.concat([cipher.update(row.join('^')), cipher.final()]).toString('base64');
}
function fixture(path = ':memory:', approval?: PaperApproval) {
  const urls: string[] = [];
  const store = new Store(path); const sockets: FakeSocket[] = [], requests: string[] = [];
  const sentOrders: { tr: string | null }[] = [];
  const response = { positions: [] as Record<string, string>[], rows: [] as Record<string, string>[], before: async (_path: string) => {} };
  const transport: typeof fetch = async (url, init) => {
    assert.equal(new URL(String(url)).origin, 'https://openapivts.koreainvestment.com:29443');
    if (String(url).endsWith('/order-cash')) sentOrders.push({ tr: new Headers(init?.headers).get('tr_id') });
    const path = new URL(String(url)).pathname; requests.push(path); await response.before(path);
    if (path.endsWith('/tokenP')) return Response.json({ access_token: 'test-token', expires_in: 86400 });
    if (path.endsWith('/inquire-balance')) return Response.json({ rt_cd: '0', output1: response.positions, output2: [{ dnca_tot_amt: '10000000', tot_evlu_amt: '10000000' }] });
    if (path.endsWith('/inquire-daily-ccld')) return Response.json({ rt_cd: '0', output1: response.rows });
    if (path.endsWith('/inquire-price')) return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
    if (path.endsWith('/inquire-psbl-order')) return Response.json({ rt_cd: '0', output: { nrcvb_buy_qty: '100', nrcvb_buy_amt: '10000000', ord_psbl_cash: '10000000' } });
    if (path.endsWith('/order-cash')) return Response.json({ rt_cd: '0', output: { ODNO: '001', KRX_FWDG_ORD_ORGNO: '12345' } });
    assert.fail(`unexpected REST endpoint ${path}`);
  };
  const kis = new KisClient({ key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' }, transport, 0);
  const paper = new PaperBroker(store, kis, approval);
  let now = base;
  const realtime = new Realtime(store, paper, { approvalKey: 'fixture-approval-secret', htsId: 'fixture-hts', session: { date: '2026-11-16', open: '09:00', close: '15:30', verified: true } }, ((url: string) => {
    urls.push(url); const socket = new FakeSocket(); sockets.push(socket); return socket;
  }) as unknown as SocketFactory, () => now);
  return { store, paper, realtime, sockets, urls, requests, response, sentOrders, setNow: (n: number) => { now = n; }, close: () => { realtime.stop(); store.close(); }, start: () => { realtime.start('005930'); const socket = sockets.at(-1)!; socket.emit('open'); socket.acknowledge(); return socket; } };
}
const order = () => ({ code: '005930', side: 'buy' as const, price: 70000, qty: 1, requestId: randomUUID() });
const row = () => ({ odno: '001', ord_dt: koreaDate(), pdno: '005930', prdt_name: '삼성전자', sll_buy_dvsn_cd: '02', ord_qty: '1', ord_unpr: '70000', tot_ccld_qty: '1', rmn_qty: '0', cncl_yn: 'N', ord_gno_brno: '12345' });

test('모의 구독·AES 통보·중복 제거·REST 원장 대조와 전송 차단', async () => {
  const f = fixture();
  try {
    const ws = f.start();
    assert.deepEqual(ws.sent.map(raw => JSON.parse(raw).body.input.tr_id), ['H0STCNT0', 'H0STCNI9']);
    assert.equal(f.requests.length, 0);
    ws.frame(priceFrame());
    await assert.rejects(f.paper.submit(order()), /실시간/); assert.equal(f.requests.length, 0);
    await f.realtime.reconcile(); assert.equal(f.realtime.status().ordersAllowed, true);
    const input = order(); await f.paper.submit(input);
    ws.frame(noticeFrame());
    assert.equal(f.store.paperOrders()[0].filled, 0); assert.equal(f.realtime.status().ordersAllowed, false);
    const eventCount = f.store.read().events.length;
    ws.frame(noticeFrame()); assert.equal(f.store.read().events.length, eventCount);
    await assert.rejects(f.paper.submit(order()), /실시간/);
    f.response.rows = [row()]; await f.realtime.reconcile();
    assert.equal(f.store.paperOrders()[0].filled, 1);
    ws.frame(noticeFrame()); assert.equal(f.realtime.status().ordersAllowed, true);
    await f.paper.submit(input); assert.equal(f.requests.filter(p => p.endsWith('/order-cash')).length, 1);
    const exposed = JSON.stringify({ status: f.realtime.status(), events: f.store.events() });
    for (const secret of ['fixture-private', 'fixture-hts', 'fixture-approval', key, iv]) assert.equal(exposed.includes(secret), false);
    const ping = JSON.stringify({ header: { tr_id: 'PINGPONG' } }); ws.frame(ping); assert.deepEqual(ws.pongs, [ping]);
  } finally { f.close(); }
});

test('중복·역전·지연·미래·타거래일·거래정지 시세와 장외 입력은 신규 주문을 허용하지 않는다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile();
    for (const frame of [priceFrame(1, 70000, '095954'), priceFrame(1, 70000, '100001'), priceFrame(1, 70000, '100000', '20261115')]) ws.frame(frame);
    assert.equal(f.realtime.status().lastQuoteAt, null);
    ws.frame(priceFrame(2)); ws.frame(priceFrame(2, 80000)); ws.frame(priceFrame(1, 80000)); ws.frame(priceFrame(3, 80000, '095959'));
    assert.equal(f.realtime.status().price, 70000);
    f.setNow(base + 5001); assert.equal(f.realtime.status().ordersAllowed, false);
    ws.frame(priceFrame(4, 70100, '100005')); assert.equal(f.realtime.status().ordersAllowed, true);
    ws.frame(priceFrame(5, 70100, '100005', '20261116', 'Y')); assert.equal(f.realtime.status().ordersAllowed, false);
    f.setNow(Date.parse('2026-11-16T15:30:00+09:00')); ws.frame(priceFrame(6, 71000, '153000'));
    await assert.rejects(f.paper.submit(order()), /실시간/);
  } finally { f.close(); }
});

test('REST 대조 중 새 통보 또는 끊김은 늦은 성공 응답으로 해제되지 않는다', async () => {
  for (const disconnect of [false, true]) {
    const f = fixture();
    try {
      const ws = f.start(); ws.frame(priceFrame());
      f.response.before = async path => { if (path.endsWith('/inquire-daily-ccld')) { if (disconnect) ws.emit('close'); else ws.frame(noticeFrame()); } };
      await assert.rejects(f.realtime.reconcile(), /완료하지/);
      assert.equal(f.realtime.status().ordersAllowed, false);
    } finally { f.close(); }
  }
});

test('전송 대기 중 실시간 끊김은 실제 REST 주문 POST 전에 거부한다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); ws.frame(priceFrame()); await f.realtime.reconcile();
    f.response.before = async path => { if (path.endsWith('/inquire-psbl-order')) ws.emit('close'); };
    const result = await f.paper.submit(order());
    assert.equal(result.status, 'rejected'); assert.equal(f.requests.some(p => p.endsWith('/order-cash')), false);
  } finally { f.close(); }
});

test('재연결은 재구독·대조 전 차단하고 이전 소켓 메시지를 무시한다', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture();
  try {
    const old = f.start(); old.frame(priceFrame()); await f.realtime.reconcile();
    old.emit('close'); assert.equal(f.realtime.status().phase, 'disconnected');
    t.mock.timers.tick(1000); const next = f.sockets.at(-1)!; assert.notEqual(old, next);
    assert.deepEqual(f.urls, Array(2).fill('ws://ops.koreainvestment.com:31000/tryitout'));
    next.emit('open'); next.acknowledge(); next.frame(priceFrame());
    assert.equal(f.realtime.status().ordersAllowed, false);
    old.frame(noticeFrame()); assert.equal(f.realtime.status().lastNoticeAt, null);
    await f.realtime.reconcile(); assert.equal(f.realtime.status().ordersAllowed, true);
    f.store.update(s => { s.risk.halted = true; }); t.mock.timers.tick(1000);
    assert.equal(next.closed, true); assert.equal(f.realtime.status().phase, 'stopped');
    t.mock.timers.tick(10000); assert.equal(f.sockets.length, 2);
  } finally { f.close(); }
});

test('서버 재시작 후 실시간을 자동 연결하지 않으며 영구 대조 차단을 보존한다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gon19-')); const path = join(dir, 'test.sqlite');
  try {
    const first = fixture(path); first.start(); first.close();
    const next = fixture(path);
    try {
      assert.equal(next.sockets.length, 0); assert.equal(next.realtime.status().required, true);
      await assert.rejects(next.paper.submit(order()), /실시간/); assert.equal(next.requests.length, 0);
    } finally { next.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('미설정·휴장/장외와 실전TR·손상 암호문은 fail closed', async () => {
  const f = fixture();
  try {
    f.setNow(Date.parse('2026-11-17T10:00:00+09:00')); assert.throws(() => f.realtime.start('005930'), /개장/);
    assert.equal(f.sockets.length, 0); f.setNow(base);
    let ws = f.start(); ws.frame('0|H0STCNI0|001|sensitive-error');
    assert.equal(f.realtime.status().phase, 'disconnected'); f.realtime.stop();
    ws = f.start(); ws.frame('1|H0STCNI9|001|AAAA');
    assert.equal(f.realtime.status().ordersAllowed, false);
    assert.equal(JSON.stringify(f.store.events()).includes('sensitive-error'), false);
  } finally { f.close(); }
});

test('같은 시세의 반복 신호 평가는 공통 주문 경로에서 1회만 실행한다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile();
    for (const [index, price] of [70000, 69000, 71000].entries()) ws.frame(priceFrame(index + 1, price));
    const input = { requestId: randomUUID(), qty: 1, fast: 1, slow: 2 };
    const first = await f.realtime.submitSignal(input); const repeated = await f.realtime.submitSignal({ ...input, requestId: randomUUID() });
    assert.equal(first?.status, 'accepted'); assert.equal(repeated, null);
    assert.equal(f.requests.filter(p => p.endsWith('/order-cash')).length, 1);
  } finally { f.close(); }
});

test('영구 실시간 차단은 별도 PaperBroker와 미설정 재시작 경로에도 적용된다', async () => {
  const f = fixture();
  try {
    f.start();
    const isolated = new PaperBroker(f.store, new KisClient({ key: '', secret: '', account: '', product: '' }, async () => assert.fail('network forbidden')));
    await assert.rejects(isolated.submit(order()), /안전장치/);
  } finally { f.close(); }
});

test('구독 거부·재연결 한도·수신 타임아웃은 주문 차단을 유지한다', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const f = fixture();
  try {
    const first = f.start(); first.frame(priceFrame()); await f.realtime.reconcile();
    f.setNow(base + 45001); t.mock.timers.tick(1000);
    assert.equal(f.realtime.status().phase, 'disconnected');
    for (const delay of [1000, 2000, 4000]) {
      t.mock.timers.tick(delay); const ws = f.sockets.at(-1)!; ws.emit('open');
      ws.frame(JSON.stringify({ header: { tr_id: 'H0STCNI9', tr_key: 'fixture-hts' }, body: { rt_cd: '1', msg1: 'private broker rejection' } }));
    }
    assert.equal(f.sockets.length, 4); t.mock.timers.tick(60000); assert.equal(f.sockets.length, 4);
    assert.equal(JSON.stringify(f.store.events()).includes('private broker rejection'), false);
  } finally { f.close(); }
});

test('REST 큐에서 오래 대기한 전략 신호는 새 시세가 와도 전송하지 않는다', async () => {
  const f = fixture();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  try {
    const ws = f.start(); await f.realtime.reconcile();
    for (const [index, price] of [70000, 69000, 71000].entries()) ws.frame(priceFrame(index + 1, price));
    let waiting = true;
    f.response.before = async path => { if (waiting && path.endsWith('/inquire-balance')) { waiting = false; entered(); await gate; } };
    const refresh = f.paper.refresh(true); await started;
    const pending = f.realtime.submitSignal({ requestId: randomUUID(), qty: 1, fast: 1, slow: 2 });
    const rejected = assert.rejects(pending, /시세|실시간|신호/);
    f.setNow(base + 6000); ws.frame(priceFrame(4, 72000, '100006'));
    release(); await refresh; await rejected;
    assert.equal(f.requests.some(path => path.endsWith('/order-cash')), false);
  } finally { release?.(); f.close(); }
});

test('거래정지 워터마크는 과거 시세로 해제되지 않고 같은 거래량의 정지도 적용한다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile(); f.setNow(base + 5000);
    ws.frame(priceFrame(4, 70100, '100005'));
    ws.frame(priceFrame(5, 70100, '100005', '20261116', 'Y'));
    ws.frame(priceFrame(6, 70000, '100002'));
    assert.equal(f.realtime.status().ordersAllowed, false);
    ws.frame(priceFrame(6, 70200, '100005')); assert.equal(f.realtime.status().ordersAllowed, true);
    ws.frame(priceFrame(6, 70200, '100005', '20261116', 'Y')); assert.equal(f.realtime.status().ordersAllowed, false);
    ws.frame(priceFrame(6, 70200, '100005')); assert.equal(f.realtime.status().ordersAllowed, false);
    f.setNow(base + 6000); ws.frame(priceFrame(7, 70300, '100006')); assert.equal(f.realtime.status().ordersAllowed, true);
    ws.frame(priceFrame(8, 70300, '100000', '20261115', 'Y')); assert.equal(f.realtime.status().ordersAllowed, true);
  } finally { f.close(); }
});

test('이전 대조의 실패는 통보 이후 시작한 대조를 무효화하지 않는다', async () => {
  const f = fixture(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  try {
    const ws = f.start(); ws.frame(priceFrame()); let waiting = true;
    f.response.before = async path => { if (waiting && path.endsWith('/inquire-balance')) { waiting = false; entered(); await gate; } };
    const first = assert.rejects(f.realtime.reconcile(), /완료하지/); await started;
    ws.frame(noticeFrame()); const second = f.realtime.reconcile(); release();
    await first; await second; assert.equal(f.realtime.status().ordersAllowed, true);
  } finally { release?.(); f.close(); }
});

test('잘못된 전략 입력은 유효한 같은 시세 신호를 소모하지 않는다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile();
    for (const [index, price] of [70000, 69000, 71000].entries()) ws.frame(priceFrame(index + 1, price));
    await assert.rejects(f.realtime.submitSignal({ requestId: randomUUID(), qty: 0, fast: 1, slow: 2 }));
    assert.ok(await f.realtime.submitSignal({ requestId: randomUUID(), qty: 1, fast: 1, slow: 2 }));
  } finally { f.close(); }
});

test('중복 구독 ACK는 기존 대조를 해제하고 연결을 닫는다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile(); ws.frame(priceFrame()); ws.acknowledge();
    assert.equal(ws.closed, true); assert.equal(f.realtime.status().ordersAllowed, false);
  } finally { f.close(); }
});

test('끊김 뒤 명시적 시작은 대기 중인 재연결 타이머를 대체한다', () => {
  const f = fixture();
  try {
    const ws = f.start(); ws.emit('close'); f.start();
    assert.equal(f.sockets.length, 2); assert.equal(f.realtime.status().phase, 'reconciling');
  } finally { f.close(); }
});

test('저장 KIS 전략은 각 이벤트의 관망·교차와 주문 연결을 보존하고 중복을 보내지 않는다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile();
    f.store.update(s => s.strategies.push({ id: 'kis-strategy', name: 'KIS 교차', code: '005930', fast: 2, slow: 3, qty: 1, active: true, lastTick: -1, lastSignal: 'hold', environment: 'kis-paper', revision: 1, run: 1 }));
    for (const [i, price] of [70000, 70000, 69000, 73000].entries()) ws.frame(priceFrame(i + 1, price));
    await evaluated(f, 'kis-strategy');
    const strategy = f.store.read().strategies.find(s => s.id === 'kis-strategy')!;
    assert.equal(strategy.evaluations?.length, 4);
    assert.equal(strategy.lastSignal, 'buy');
    const evaluation = strategy.evaluations![0];
    assert.equal(evaluation.revision, 1); assert.equal(evaluation.status, 'accepted');
    assert.equal(f.store.paperOrders()[0].requestId, evaluation.requestId);
    assert.deepEqual(f.store.paperOrders()[0].strategy, { id: strategy.id, revision: 1, event: '20261116:4', signal: 'buy' });
    assert.deepEqual(f.sentOrders.map(o => o.tr), ['VTTC0012U']);
    ws.frame(priceFrame(4, 73000));
    assert.equal(f.requests.filter(p => p.endsWith('/order-cash')).length, 1);
  } finally { f.close(); }
});

function savedStrategy(f: ReturnType<typeof fixture>) {
  const id = randomUUID();
  f.store.update(s => s.strategies.push({ id, name: '저장 KIS', code: '005930', fast: 2, slow: 3, qty: 1, active: true, lastTick: -1, lastSignal: 'hold', environment: 'kis-paper', revision: 1, run: 1 }));
  return id;
}
async function evaluated(f: ReturnType<typeof fixture>, id: string) {
  for (let i = 0; i < 1000; i++) {
    const evaluation = f.store.read().strategies.find(s => s.id === id)?.evaluations?.[0];
    if (evaluation && evaluation.status !== 'sending') return evaluation;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.fail('전략 평가 완료 시간 초과');
}
function crossing(ws: FakeSocket, side: 'buy' | 'sell' = 'buy', offset = 0) {
  for (const [i, price] of (side === 'buy' ? [70000, 70000, 69000, 73000] : [70000, 70000, 71000, 67000]).entries()) ws.frame(priceFrame(i + 1 + offset, price));
}

test('KIS 저장 전략도 공통 금액·종목·손실·긴급정지·수동 보유/예약 한도로 차단한다', async () => {
  for (const reason of ['order', 'position', 'loss', 'halt', 'holding', 'reserved'] as const) {
    const f = fixture();
    try {
      const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
      if (reason === 'order') f.store.update(s => { s.risk.maxOrder = 10000; });
      if (reason === 'position') f.store.update(s => { s.risk.maxPosition = 60000; });
      if (reason === 'loss') f.store.paperBaseline(koreaDate(), 20000000);
      if (reason === 'halt') f.store.update(s => { s.risk.halted = true; });
      if (reason === 'reserved') { f.response.positions = [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '1', pchs_avg_pric: '70000', prpr: '70000' }]; f.response.rows = [{ ...row(), sll_buy_dvsn_cd: '01', tot_ccld_qty: '0', rmn_qty: '1' }]; }
      crossing(ws, reason === 'holding' || reason === 'reserved' ? 'sell' : 'buy');
      const evaluation = await evaluated(f, id);
      assert.equal(evaluation.status, 'blocked', reason);
      assert.match(evaluation.reason, { order: /1회 주문/, position: /종목별/, loss: /손실/, halt: /실시간/, holding: /매도 가능/, reserved: /매도 가능/ }[reason]);
      assert.equal(f.requests.some(p => p.endsWith('/order-cash')), false);
    } finally { f.close(); }
  }
});

test('KIS 매도 교차는 수동 보유를 공통 주문 경로로 매도하며 모의 도메인/TR을 유지한다', async () => {
  const f = fixture();
  try {
    f.response.positions = [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '1', pchs_avg_pric: '70000', prpr: '70000' }];
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws, 'sell');
    const evaluation = await evaluated(f, id); assert.equal(evaluation.signal, 'sell'); assert.equal(evaluation.status, 'accepted');
    assert.equal(f.store.paperOrders()[0].side, 'sell');
    assert.deepEqual(f.sentOrders.map(o => o.tr), ['VTTC0011U']);
  } finally { f.close(); }
});

test('KIS 전략 정지와 즉시 재시작은 이미 큐에 들어간 신호를 부활시키지 않는다', async () => {
  for (const restart of [false, true]) {
    const f = fixture();
    try {
      const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
      f.response.before = async path => { if (path.endsWith('/inquire-psbl-order')) { f.realtime.setStrategyActive(id, false); if (restart) f.realtime.setStrategyActive(id, true); } };
      crossing(ws); const evaluation = await evaluated(f, id);
      assert.equal(evaluation.status, 'rejected'); assert.match(evaluation.reason, /전략 정지/);
      assert.equal(f.sentOrders.length, 0);
      ws.frame(priceFrame(4, 73000));
      assert.equal(f.store.read().strategies.find(s => s.id === id)!.evaluations!.length, 4);
    } finally { f.close(); }
  }
});

test('연결 중단 뒤 재대조만으로 전략이 재개되지 않고 시작도 과거 이벤트를 재전송하지 않는다', async () => {
  const f = fixture();
  try {
    let ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws); await evaluated(f, id);
    f.realtime.stop(); assert.equal(f.store.read().strategies.find(s => s.id === id)!.active, false);
    f.response.rows = [{ ...row(), ord_unpr: '73000' }];
    ws = f.start(); ws.frame(priceFrame(1)); await f.realtime.reconcile();
    f.realtime.setStrategyActive(id, true); crossing(ws);
    assert.equal(f.store.read().strategies.find(s => s.id === id)!.evaluations!.length, 4);
    assert.equal(f.sentOrders.length, 1);
  } finally { f.close(); }
});

test('KIS 전략 실행/이력은 DB 재시작 뒤 정지로 복구하며 합성 봉은 KIS 전략을 실행하지 않는다', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strategy-restart-')), path = join(dir, 'db.sqlite');
  const f = fixture(path); let reopened: Store | undefined;
  try {
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws); await evaluated(f, id);
    const { advanceTick } = await import('../server/engine.ts'); f.store.update(advanceTick);
    assert.equal(f.store.read().orders.length, 0); assert.equal(f.sentOrders.length, 1);
    reopened = new Store(path);
    assert.equal(reopened.read().strategies.find(s => s.id === id)!.active, false);
    assert.equal(reopened.read().strategies.find(s => s.id === id)!.evaluations![0].status, 'accepted');
    assert.equal(reopened.paperOrders().length, 1);
  } finally { reopened?.close(); f.close(); rmSync(dir, { recursive: true }); }
});

test('고정 1회 승인 UUID를 전략 요청으로 바꾸거나 소비하지 않는다', async () => {
  const approval = { date: '2026-11-16', requestId: randomUUID() };
  const f = fixture(':memory:', approval);
  try {
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws);
    const evaluation = await evaluated(f, id); assert.equal(evaluation.status, 'blocked');
    assert.match(evaluation.reason, /1회 승인 범위/); assert.equal(f.sentOrders.length, 0);
    assert.equal(f.store.paperOrders().length, 0); assert.equal(f.store.read().risk.halted, false);
    assert.notEqual(evaluation.requestId, approval.requestId);
  } finally { f.close(); }
});

test('최근 평가 한도 이후에도 영구 주문 원장의 전략·revision·이벤트 출처를 유지한다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws); const first = await evaluated(f, id);
    for (let i = 5; i < 160; i++) ws.frame(priceFrame(i, 73000));
    const strategy = f.store.read().strategies.find(s => s.id === id)!;
    assert.ok(strategy.evaluations!.length <= 100);
    assert.equal(strategy.evaluations!.some(e => e.requestId === first.requestId), false);
    assert.deepEqual(f.store.paperOrders()[0].strategy, { id, revision: 1, event: '20261116:4', signal: 'buy' });
    assert.equal(f.sentOrders.length, 1);
  } finally { f.close(); }
});

test('응답 불명인 KIS 전략 주문은 재전송하지 않고 다음 교차도 차단한다', async () => {
  const f = fixture();
  try {
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
    f.response.before = async path => { if (path.endsWith('/order-cash')) throw new Error('fixture lost response'); };
    crossing(ws); assert.equal((await evaluated(f, id)).status, 'unknown');
    ws.frame(priceFrame(5, 70000)); ws.frame(priceFrame(6, 69000)); const next = await evaluated(f, id);
    assert.equal(next.status, 'blocked'); assert.match(next.reason, /응답 불명/);
    assert.equal(f.sentOrders.length, 1);
  } finally { f.close(); }
});

test('전략 정지 저장 실패도 메모리 전송 가드를 먼저 닫는다', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'strategy-storage-')), path = join(dir, 'db.sqlite');
  const f = fixture(path), db = new DatabaseSync(path);
  try {
    const ws = f.start(); ws.frame(priceFrame()); await f.realtime.reconcile(); savedStrategy(f);
    db.exec("CREATE TRIGGER fail_workspace BEFORE UPDATE ON workspace BEGIN SELECT RAISE(FAIL, 'fixture storage failure'); END");
    assert.throws(() => f.realtime.stop(), /fixture storage failure/);
    assert.equal(f.realtime.status().ordersAllowed, false);
    assert.equal(ws.closed, true);
    await assert.rejects(f.paper.submit(order()), /실시간/);
    assert.equal(f.sentOrders.length, 0);
  } finally { db.exec('DROP TRIGGER IF EXISTS fail_workspace'); db.close(); f.close(); rmSync(dir, { recursive: true }); }
});

test('전송 중 새 이벤트가 와도 최근 평가 100건의 시간순과 막 완료된 주문 연결을 유지한다', { timeout: 5000 }, async () => {
  const f = fixture(); let release = () => {};
  try {
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
    for (let volume = 1; volume <= 100; volume++) ws.frame(priceFrame(volume, 80000 - volume * 100));
    assert.equal(f.store.read().strategies.find(s => s.id === id)!.evaluations!.length, 100);
    let started!: () => void; const reached = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.response.before = async path => { if (path.endsWith('/inquire-psbl-order')) { started(); await gate; } };
    ws.frame(priceFrame(101, 70000)); ws.frame(priceFrame(102, 73000)); await reached;
    ws.frame(priceFrame(103, 73000));
    let history = f.store.read().strategies.find(s => s.id === id)!.evaluations!;
    assert.equal(history[1].event, '20261116:102'); assert.equal(history[1].status, 'sending');
    release();
    for (let i = 0; i < 1000 && f.store.read().strategies.find(s => s.id === id)!.evaluations!.some(e => e.status === 'sending'); i++) await new Promise<void>(resolve => setImmediate(resolve));
    ws.frame(priceFrame(104, 73000));
    history = f.store.read().strategies.find(s => s.id === id)!.evaluations!;
    assert.equal(history[2].event, '20261116:102'); assert.equal(history[2].status, 'accepted');
    assert.equal(history[2].requestId, f.store.paperOrders()[0].requestId); assert.equal(history.length, 100);
  } finally { release(); f.close(); }
});
