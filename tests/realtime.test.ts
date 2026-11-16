import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Store } from '../server/store.ts';
import { makeServer } from '../server/http.ts';

test('실시간은 재시작 시 미연결이며 GET 상태는 비밀값이나 네트워크 호출 없이 차단 사유를 제공한다', async () => {
  const store = new Store(':memory:'); const server = makeServer(store, undefined, [4319]);
  server.listen(4319, '127.0.0.1'); await once(server, 'listening');
  try {
    const state = await (await fetch('http://127.0.0.1:4319/api/state')).json();
    assert.equal(state.realtime?.phase, 'stopped');
    assert.equal(state.realtime?.ordersAllowed, false);
    assert.equal(state.realtime?.lastQuoteAt, null);
  } finally { server.close(); await once(server, 'close'); store.close(); }
});

import { EventEmitter } from 'node:events';
import { createCipheriv, randomUUID } from 'node:crypto';
import { Realtime, type SocketFactory } from '../server/realtime.ts';
import { PaperBroker } from '../server/paper.ts';
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
function fixture(path = ':memory:') {
  const store = new Store(path); const sockets: FakeSocket[] = [], requests: string[] = [];
  const response = { rows: [] as Record<string, string>[], before: async (_path: string) => {} };
  const transport: typeof fetch = async (url) => {
    const path = new URL(String(url)).pathname; requests.push(path); await response.before(path);
    if (path.endsWith('/tokenP')) return Response.json({ access_token: 'test-token', expires_in: 86400 });
    if (path.endsWith('/inquire-balance')) return Response.json({ rt_cd: '0', output1: [], output2: [{ dnca_tot_amt: '10000000', tot_evlu_amt: '10000000' }] });
    if (path.endsWith('/inquire-daily-ccld')) return Response.json({ rt_cd: '0', output1: response.rows });
    if (path.endsWith('/inquire-price')) return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
    if (path.endsWith('/inquire-psbl-order')) return Response.json({ rt_cd: '0', output: { nrcvb_buy_qty: '100', nrcvb_buy_amt: '10000000', ord_psbl_cash: '10000000' } });
    if (path.endsWith('/order-cash')) return Response.json({ rt_cd: '0', output: { ODNO: '001', KRX_FWDG_ORD_ORGNO: '12345' } });
    assert.fail(`unexpected REST endpoint ${path}`);
  };
  const kis = new KisClient({ key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' }, transport, 0);
  const paper = new PaperBroker(store, kis);
  let now = base;
  const realtime = new Realtime(store, paper, { approvalKey: 'fixture-approval-secret', htsId: 'fixture-hts', session: { date: '2026-11-16', open: '09:00', close: '15:30', verified: true } }, ((url: string) => {
    assert.equal(url, 'ws://ops.koreainvestment.com:31000'); const socket = new FakeSocket(); sockets.push(socket); return socket;
  }) as unknown as SocketFactory, () => now);
  return { store, paper, realtime, sockets, requests, response, setNow: (n: number) => { now = n; }, close: () => { realtime.stop(); store.close(); }, start: () => { realtime.start('005930'); const socket = sockets.at(-1)!; socket.emit('open'); socket.acknowledge(); return socket; } };
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
