import { evaluateClose } from '../shared/strategy-rules.ts';
import { dailyFixture } from './backtest-fixture.ts';
import { test } from 'node:test';
import { defaultStrategyPolicy } from '../shared/trading-policy.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import type { StateSnapshot } from '../shared/model.ts';
import type { StrategyContract } from '../server/strategy-contract.ts';
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
import { Worker } from 'node:worker_threads';
import { createCipheriv, randomUUID } from 'node:crypto';
import { Realtime, dailyHolding, type SocketFactory } from '../server/realtime.ts';
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
function fixture(path = ':memory:', approval?: PaperApproval, terms?: Partial<StrategyContract>) {
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
    if (path.endsWith('/inquire-price')) return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N', stck_shrn_iscd: '005930', sltr_yn: 'N' } });
    if (path.endsWith('/inquire-psbl-order')) return Response.json({ rt_cd: '0', output: { nrcvb_buy_qty: '100', nrcvb_buy_amt: '10000000', ord_psbl_cash: '10000000' } });
    if (path.endsWith('/order-cash')) return Response.json({ rt_cd: '0', output: { ODNO: String(sentOrders.length).padStart(3, '0'), KRX_FWDG_ORD_ORGNO: '12345' } });
    assert.fail(`unexpected REST endpoint ${path}`);
  };
  const kis = new KisClient({ key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' }, transport, 0);
  const contract: StrategyContract | undefined = terms && {
    contractId: 'ccc0ebaa-88a4-4aaf-a7e7-87b973b51254', ledgerPath: path, accountFingerprint: kis.accountFingerprint(),
    strategyId: 'kis-strategy', revision: 1, code: '005930', fast: 2, slow: 3, qty: 1,
    startsAt: '2020-01-01T00:00:00Z', endsAt: '2100-01-01T00:00:00Z',
    maxOrderAmount: 90000, maxTotalAmount: 900000, maxAttempts: 10, sellPolicy: 'account', ...terms,
  };
  const paper = new PaperBroker(store, kis, approval, contract);
  let now = base;
  const realtime = new Realtime(store, paper, { approvalKey: 'fixture-approval-secret', htsId: 'fixture-hts', session: { date: '2026-11-16', open: '09:00', close: '15:30', verified: true } }, ((url: string) => {
    urls.push(url); const socket = new FakeSocket(); sockets.push(socket); return socket;
  }) as unknown as SocketFactory, () => now);
  return { store, kis, paper, realtime, sockets, urls, requests, response, sentOrders, setNow: (n: number) => { now = n; }, close: () => { realtime.stop(); store.close(); }, start: () => { realtime.start('005930'); const socket = sockets.at(-1)!; socket.emit('open'); socket.acknowledge(); return socket; } };
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
  const f = fixture(':memory:', undefined, {});
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
  const id = 'kis-strategy';
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

for (const slowStage of ['inquire-daily-ccld', 'inquire-price']) {
  test(`계약 전략은 ${slowStage} 중 원 신호가 만료되면 남은 조회를 생략한다`, async () => {
    const f = fixture(':memory:', undefined, {});
    try {
      const ws = f.start();
      await f.realtime.reconcile();
      const id = savedStrategy(f);
      const initial = f.requests.length;
      f.response.before = async path => {
        if (path.endsWith(slowStage)) f.setNow(base + 5001);
      };
      crossing(ws);
      assert.equal((await evaluated(f, id)).status, 'blocked');
      const reads = f.requests.slice(initial).map(path => path.split('/').at(-1));
      const expected = ['inquire-balance', 'inquire-daily-ccld'];
      if (slowStage === 'inquire-price') expected.push('inquire-price');
      assert.deepEqual(reads, expected);
      assert.equal(f.store.strategyUsage().attempts, 0);
      assert.equal(f.store.paperOrders().length, 0);
    } finally { f.close(); }
  });
}

test('필수 요청 간격 안에 원 신호가 만료되면 예약과 전송을 모두 생략한다', async t => {
  const f = fixture(':memory:', undefined, {});
  try {
    const ws = f.start();
    await f.realtime.reconcile();
    const id = savedStrategy(f);
    f.response.before = async path => {
      if (path.endsWith('/inquire-psbl-order')) {
        f.setNow(base + 4300);
        t.mock.method(f.kis, 'minimumRequestWaitMs').mock.mockImplementationOnce(() => 1100);
      }
    };
    crossing(ws);
    assert.equal((await evaluated(f, id)).status, 'blocked');
    assert.equal(f.store.strategyUsage().attempts, 0);
    assert.equal(f.sentOrders.length, 0);
  } finally { f.close(); }
});

test('동일한 4407ms 사전검사도 원 신호의 나이에 따라 전송 직전에 다르게 판정한다', async t => {
  for (const [signalAge, expected] of [[500, 'accepted'], [700, 'rejected']] as const) {
    const f = fixture(':memory:', undefined, {});
    try {
      const ws = f.start();
      await f.realtime.reconcile();
      const id = savedStrategy(f);
      f.setNow(base + signalAge);
      // 장외 GET 측정의 다음 요청 가능 시점을 마지막 전송 검사 직전에 재생한다.
      const save = f.store.savePaper.bind(f.store);
      t.mock.method(f.store, 'savePaper', (...args: Parameters<typeof save>) => {
        save(...args);
        if (args[0].status === 'sending') f.setNow(base + signalAge + 4407);
      });
      crossing(ws);
      assert.equal((await evaluated(f, id)).status, expected);
      assert.equal(f.sentOrders.length, expected === 'accepted' ? 1 : 0);
      assert.equal(f.store.strategyUsage().attempts, 1);
    } finally { f.close(); }
  }
});

test('KIS 저장 전략도 공통 금액·종목·손실·긴급정지·수동 보유/예약 한도로 차단한다', async () => {
  for (const reason of ['order', 'position', 'loss', 'halt', 'holding', 'reserved'] as const) {
    const f = fixture(':memory:', undefined, {});
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
  const f = fixture(':memory:', undefined, {});
  try {
    f.response.positions = [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '1', ord_psbl_qty: '1', pchs_avg_pric: '70000', prpr: '70000' }];
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws, 'sell');
    const evaluation = await evaluated(f, id); assert.equal(evaluation.signal, 'sell'); assert.equal(evaluation.status, 'accepted');
    assert.equal(f.store.paperOrders()[0].side, 'sell');
    assert.deepEqual(f.sentOrders.map(o => o.tr), ['VTTC0011U']);
  } finally { f.close(); }
});

test('KIS 전략 정지와 즉시 재시작은 이미 큐에 들어간 신호를 부활시키지 않는다', async () => {
  for (const restart of [false, true]) {
    const f = fixture(':memory:', undefined, {});
    try {
      const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
      f.response.before = async path => { if (path.endsWith('/inquire-psbl-order')) { f.realtime.setStrategyActive(id, false); if (restart) f.realtime.setStrategyActive(id, true); } };
      crossing(ws); const evaluation = await evaluated(f, id);
      assert.equal(evaluation.status, 'blocked'); assert.match(evaluation.reason, /전략 정지/);
      assert.equal(f.store.strategyUsage().attempts, 0);
      assert.equal(f.sentOrders.length, 0);
      ws.frame(priceFrame(4, 73000));
      assert.equal(f.store.read().strategies.find(s => s.id === id)!.evaluations!.length, 4);
    } finally { f.close(); }
  }
});

test('연결 중단 뒤 재대조만으로 전략이 재개되지 않고 시작도 과거 이벤트를 재전송하지 않는다', async () => {
  const f = fixture(':memory:', undefined, {});
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
  const f = fixture(path, undefined, {}); let reopened: Store | undefined;
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
  const f = fixture(':memory:', undefined, {});
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
  const f = fixture(':memory:', undefined, {});
  try {
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
    f.response.before = async path => { if (path.endsWith('/order-cash')) throw new Error('fixture lost response'); };
    crossing(ws); assert.equal((await evaluated(f, id)).status, 'unknown');
    ws.frame(priceFrame(5, 70000)); ws.frame(priceFrame(6, 69000));
    assert.equal(f.store.read().strategies.find(s => s.id === id)?.active, false);
    assert.throws(() => f.realtime.setStrategyActive(id, true), /응답 불명/);
    assert.equal(f.store.strategyUsage().attempts, 1);
    assert.equal(f.sentOrders.length, 1);
  } finally { f.close(); }
});

test('전략 정지 저장 실패도 메모리 전송 가드를 먼저 닫는다', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'strategy-storage-')), path = join(dir, 'db.sqlite');
  const f = fixture(path, undefined, {}), db = new DatabaseSync(path);
  try {
    const ws = f.start(); ws.frame(priceFrame()); await f.realtime.reconcile(); savedStrategy(f);
    db.exec("CREATE TRIGGER fail_workspace BEFORE UPDATE ON workspace BEGIN SELECT RAISE(FAIL, 'fixture storage failure'); END");
    assert.throws(() => f.realtime.stop(), /fixture storage failure/);
    assert.equal(f.realtime.status().ordersAllowed, false);
    assert.equal(ws.closed, true);
    await assert.rejects(f.paper.submit(order()), /전략 계약/);
    assert.equal(f.sentOrders.length, 0);
  } finally { db.exec('DROP TRIGGER IF EXISTS fail_workspace'); db.close(); f.close(); rmSync(dir, { recursive: true }); }
});

test('전송 중 새 이벤트가 와도 최근 평가 100건의 시간순과 막 완료된 주문 연결을 유지한다', { timeout: 5000 }, async () => {
  const f = fixture(':memory:', undefined, {}); let release = () => {};
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

test('전략 계약 누락·시간·revision·매도 정책·주문당 금액 거부 시 전송과 차감은 0이다', async () => {
  for (const terms of [undefined, { revision: 2 }, { fast: 3, slow: 4 }, { maxOrderAmount: 72999 }, { endsAt: '2020-01-02T00:00:00Z' }, { sellPolicy: 'deny' as const }]) {
    const f = fixture(':memory:', undefined, terms);
    try {
      const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
      const reads = f.requests.length;
      crossing(ws, terms?.sellPolicy ? 'sell' : 'buy');
      assert.equal((await evaluated(f, id)).status, 'blocked');
      assert.equal(f.sentOrders.length, 0); assert.equal(f.store.strategyUsage().attempts, 0);
      assert.equal(f.requests.length, reads);
    } finally { f.close(); }
  }
});

test('계약 전송 총액·횟수 경계와 재시작 후 같은 승인만 유지한다', async () => {
  for (const terms of [{ maxAttempts: 1 }, { maxOrderAmount: 73000, maxTotalAmount: 73000 }]) {
    const dir = mkdtempSync(join(tmpdir(), 'contract-limit-')), path = join(dir, 'ledger');
    try {
      const f = fixture(path, undefined, terms);
      try {
        const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws);
        assert.equal((await evaluated(f, id)).status, 'accepted'); assert.equal(f.sentOrders.length, 1);
        assert.equal(f.store.strategyUsage().amount, 73000);
        await assert.rejects(f.paper.submit({ ...order(), requestId: f.store.paperOrders()[0].requestId, price: 73000 }), /전략 계약/);
      } finally { f.close(); }
      const next = fixture(path, undefined, terms);
      try {
        next.response.rows = [{ ...row(), ord_unpr: '73000' }];
        const ws = next.start(); ws.frame(priceFrame()); await next.realtime.reconcile();
        assert.throws(() => next.realtime.setStrategyActive('kis-strategy', true), /소진/);
        assert.equal(next.store.strategyUsage().attempts, 1); assert.equal(next.sentOrders.length, 0);
        const kis = new KisClient({ key: 'fixture', secret: 'fixture', account: '00000000', product: '01' });
        assert.throws(() => new PaperBroker(next.store, kis), /계약이 필요/);
        const pinned = JSON.parse(String(next.store.strategyContract()));
        const differentAccount = new KisClient({ key: 'fixture', secret: 'fixture', account: '11111111', product: '01' });
        assert.throws(() => new PaperBroker(next.store, differentAccount, undefined, pinned), /계좌/);
        assert.throws(() => new PaperBroker(next.store, kis, undefined, { ...pinned, ledgerPath: path + '.copy' }), /원장/);
        assert.throws(() => next.store.configurePaperRun({ date: '2026-11-16', requestId: randomUUID() }), /혼용/);
        assert.equal(next.store.hasPaperRun(), false);
        assert.throws(() => new PaperBroker(next.store, kis, undefined, { ...pinned, maxAttempts: 999 }), /고정된/);
      } finally { next.close(); }
    } finally { rmSync(dir, { recursive: true }); }
  }
});

test('계약 원장 중복·경합, 거절 뒤 비복원, 감사 실패 롤백 및 wire 단일 소비', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = mkdtempSync(join(tmpdir(), 'atomic-contract-')), path = join(dir, 'paper.db');
  const f = fixture(path, undefined, { maxAttempts: 2, maxTotalAmount: 140000 });
  const other = new Store(path);
  const db = new DatabaseSync(path);
  try {
    const c = JSON.parse(String(f.store.strategyContract())) as StrategyContract;
    const first = { ...order(), status: 'sending' as const, createdAt: new Date().toISOString(), tradeDate: koreaDate(), filled: 0, remaining: 1, message: '', strategy: { id: c.strategyId, revision: 1, signal: 'buy' as const, event: '1' } };
    const audit = { actor: 'system' as const, action: 'sending' as const, before: null };
    db.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON paper_audit BEGIN SELECT RAISE(FAIL,'fixture'); END");
    assert.throws(() => f.store.savePaper(first, audit, c), /fixture/);
    assert.equal(other.strategyUsage().amount, 0); assert.equal(other.paperOrders().length, 0);
    db.exec('DROP TRIGGER fail_audit');
    f.store.savePaper(first, audit, c);
    assert.equal(other.markStrategyDispatch({ ...first, price: first.price + 1 }), false);
    assert.equal(other.markStrategyDispatch(first), true); assert.equal(f.store.markStrategyDispatch(first), false);
    f.store.savePaper({ ...first, status: 'rejected' });
    assert.throws(() => other.savePaper({ ...first, requestId: randomUUID() }, audit, c));
    assert.throws(() => other.savePaper({ ...first, strategy: { ...first.strategy, event: '2' } }, audit, c));
    assert.equal(other.strategyUsage().attempts, 1);
    // 두 독립 writer가 마지막 예약을 동시에 시도한다.
    const workers = [2, 3].map(event => new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const { Store } = require('tsx/cjs/api').require('./server/store.ts', process.cwd() + '/test.cjs');
      const { path, order, audit, contract } = workerData;
      const store = new Store(path);
      parentPort.once('message', () => {
        try { store.savePaper(order, audit, contract); parentPort.postMessage('reserved'); }
        catch (e) { parentPort.postMessage(e.message); }
        finally { store.close(); }
      });
      parentPort.postMessage('ready');
    `, { eval: true, workerData: { path, order: { ...first, requestId: randomUUID(), strategy: { ...first.strategy, event: String(event) } }, audit, contract: c } }));
    try {
      await Promise.all(workers.map(w => once(w, 'message')));
      const results = Promise.all(workers.map(w => once(w, 'message')));
      workers.forEach(w => w.postMessage('reserve'));
      const messages = (await results).flat();
      assert.equal(messages.filter(m => m === 'reserved').length, 1);
      assert.equal(messages.filter(m => /한도/.test(m)).length, 1);
    } finally { await Promise.all(workers.map(w => w.terminate())); }
    assert.equal(other.strategyUsage().amount, 140000);
  } finally { other.close(); db.close(); f.close(); rmSync(dir, { recursive: true }); }
});

test('예약 후 시간창이 끝나면 wire 0회, 예약 한도는 그대로 소비된다', async t => {
  const end = Date.now() + 60000;
  const f = fixture(':memory:', undefined, { endsAt: new Date(end).toISOString() });
  try {
    const save = f.store.savePaper.bind(f.store);
    t.mock.method(f.store, 'savePaper', (...args: Parameters<typeof save>) => {
      save(...args);
      if (args[0].status === 'sending') t.mock.method(Date, 'now', () => end);
    });
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws);
    assert.equal((await evaluated(f, id)).status, 'rejected'); assert.equal(f.sentOrders.length, 0);
    assert.equal(f.store.strategyUsage().amount, 73000);
  } finally { f.close(); }
});

test('원장 복구 전에 누락·변경 계약을 거부하고 sending은 재시작 후 불명·한도 유지', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contract-crash-')), path = join(dir, 'db');
  const f = fixture(path, undefined, {});
  try {
    const c = JSON.parse(String(f.store.strategyContract())) as StrategyContract;
    const sending = { ...order(), status: 'sending' as const, createdAt: new Date().toISOString(), tradeDate: koreaDate(), filled: 0, remaining: 1, message: '', strategy: { id: c.strategyId, revision: 1, signal: 'buy' as const, event: 'fixture:1' } };
    f.store.savePaper(sending, { actor: 'system', action: 'sending', before: null }, c);
    assert.throws(() => new Store(path, {}), /고정된 전략 계약/);
    assert.throws(() => new Store(path, { contract: { ...c, maxTotalAmount: c.maxTotalAmount + 1 } }), /고정된 전략 계약/);
    assert.equal(f.store.paperOrders()[0].status, 'sending');
    const reopened = new Store(path, { contract: c });
    try {
      assert.equal(reopened.paperOrders()[0].status, 'unknown'); assert.equal(reopened.strategyUsage().amount, 70000);
      assert.equal(reopened.markStrategyDispatch(sending), false);
    } finally { reopened.close(); }
  } finally { f.close(); rmSync(dir, { recursive: true }); }
});

test('계약 매도는 계좌 주문가능수량 누락·부족 시 차감하지 않는다', async () => {
  for (const sellable of [undefined, '0', 'invalid']) {
    const f = fixture(':memory:', undefined, {});
    try {
      f.response.positions = [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '3', pchs_avg_pric: '70000', prpr: '70000', ...(sellable === undefined ? {} : { ord_psbl_qty: sellable }) }];
      const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f); crossing(ws, 'sell');
      assert.match((await evaluated(f, id)).reason, /매도 가능/);
      assert.equal(f.store.strategyUsage().attempts, 0); assert.equal(f.sentOrders.length, 0);
    } finally { f.close(); }
  }
});

test('격리 대조에서 부분체결이 되어도 최초 지정가×전체 수량만큼 계약 한도를 보존한다', async () => {
  const f = fixture(':memory:', undefined, { qty: 2, maxOrderAmount: 146000, maxTotalAmount: 146000 });
  try {
    const ws = f.start(); await f.realtime.reconcile(); const id = savedStrategy(f);
    f.store.update(s => { s.strategies.find(strategy => strategy.id === id)!.qty = 2; s.risk.maxOrder = 146000; });
    crossing(ws); assert.equal((await evaluated(f, id)).status, 'accepted');
    f.response.rows = [{ ...row(), ord_unpr: '73000', ord_qty: '2', tot_ccld_qty: '1', rmn_qty: '1' }];
    await f.paper.refresh();
    assert.equal(f.store.paperOrders()[0].status, 'partial');
    assert.equal(f.store.strategyUsage().amount, 146000); assert.equal(f.store.strategyUsage().attempts, 1);
    assert.equal(f.store.read().strategies.find(s => s.id === id)?.active, false);
  } finally { f.close(); }
});

test('계약 도입 전 원장의 전략 주문 ID로 수동 요청을 재사용하지 않는다', async () => {
  const f = fixture();
  try {
    const input = order();
    f.store.savePaper({ ...input, status: 'filled', createdAt: new Date().toISOString(), tradeDate: koreaDate(), filled: 1, remaining: 0, message: '', strategy: { id: 'legacy', revision: 1, event: '20261116:2', signal: 'buy' } });
    await assert.rejects(f.paper.submit(input), /전략 출처/);
    assert.equal(f.requests.length, 0); assert.equal(f.sentOrders.length, 0);
  } finally { f.close(); }
});

test('10분 격리 계약은 매수·매도 신호를 각각 주문에 연결하고 재시작 뒤 소진 상태를 유지한다', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  const terms = {
    startsAt: new Date(base).toISOString(), endsAt: new Date(base + 600_000).toISOString(),
    maxOrderAmount: 73000, maxAttempts: 2, maxTotalAmount: 140000, sellPolicy: 'account' as const,
  };
  const dir = mkdtempSync(join(tmpdir(), 'two-signal-contract-'));
  const path = join(dir, 'ledger');
  try {
    const f = fixture(path, undefined, terms);
    try {
      f.response.positions = [{ pdno: '005930', prdt_name: '삼성전자', hldg_qty: '1', ord_psbl_qty: '1', pchs_avg_pric: '70000', prpr: '70000' }];
      const ws = f.start();
      await f.realtime.reconcile();
      const id = savedStrategy(f);
      crossing(ws);
      const buy = await evaluated(f, id);
      assert.equal(buy.status, 'accepted');
      f.response.rows = [{ ...row(), ord_unpr: '73000' }];
      ws.frame(priceFrame(4, 73000));
      ws.frame(priceFrame(5, 67000));
      ws.frame(priceFrame(6, 67000));
      const sell = await evaluated(f, id);
      assert.equal(sell.status, 'accepted', sell.reason);
      assert.deepEqual(f.store.paperOrders().map(o => [o.strategy?.signal, o.requestId, o.price]), [
        ['sell', sell.requestId, 67000], ['buy', buy.requestId, 73000],
      ]);
      assert.notEqual(buy.requestId, sell.requestId);
      assert.deepEqual(f.sentOrders.map(o => o.tr), ['VTTC0012U', 'VTTC0011U']);
      assert.equal(f.store.strategyUsage().amount, 140000);
      assert.equal(f.store.strategyUsage().attempts, 2);
    } finally { f.close(); }
    const next = fixture(path, undefined, terms);
    try {
      next.response.rows = [
        { ...row(), ord_unpr: '73000' },
        { ...row(), odno: '002', sll_buy_dvsn_cd: '01', ord_unpr: '67000' },
      ];
      const ws = next.start(); ws.frame(priceFrame()); await next.realtime.reconcile();
      assert.throws(() => next.realtime.setStrategyActive('kis-strategy', true), /소진/);
      assert.equal(next.sentOrders.length, 0);
    } finally { next.close(); }
  } finally { rmSync(dir, { recursive: true }); }
});

test('고정한 시세와 원 신호 유효시간이 각각 지연 주문을 제한한다', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  for (const [quoteSeconds, signalSeconds, expected] of [
    [5, 15, 'blocked'],
    [15, 5, 'blocked'],
    [15, 15, 'accepted'],
  ] as const) {
    const f = fixture(':memory:', undefined, { policy: { ...defaultStrategyPolicy(), quoteSeconds, signalSeconds } });
    try {
      const ws = f.start();
      await f.realtime.reconcile();
      const id = savedStrategy(f);
      f.response.before = async (path) => {
        if (path.endsWith('/inquire-price')) f.setNow(base + 6000);
      };
      crossing(ws);
      const outcome = await evaluated(f, id);
      assert.equal(outcome.status, expected, outcome.reason);
      assert.equal(f.sentOrders.length, expected === 'accepted' ? 1 : 0);
    } finally {
      f.close();
    }
  }
});
test('계약 체결분 매도는 기존 계좌 보유만으로 전송하지 않는다', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  const f = fixture(':memory:', undefined, { policy: defaultStrategyPolicy(), sellPolicy: 'contract' });
  try {
    f.response.positions = [
      {
        pdno: '005930',
        prdt_name: '삼성전자',
        hldg_qty: '3',
        ord_psbl_qty: '3',
        pchs_avg_pric: '70000',
        prpr: '70000',
      },
    ];
    const ws = f.start();
    await f.realtime.reconcile();
    const id = savedStrategy(f);
    crossing(ws, 'sell');
    assert.match((await evaluated(f, id)).reason, /계약의 확인된 매수/);
    assert.equal(f.sentOrders.length, 0);
  } finally {
    f.close();
  }
});

test('전략 시장가 주문은 단가 0으로 전송하고 KRX 상한가를 SQLite 계약 예산에 예약한다', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: base });
  for (const cap of [90999, 91000]) {
    const f = fixture(':memory:', undefined, {
      policy: { ...defaultStrategyPolicy(), orderType: 'market' },
      maxOrderAmount: cap,
      maxTotalAmount: cap,
    });
    try {
      const ws = f.start();
      await f.realtime.reconcile();
      const id = savedStrategy(f);
      crossing(ws);
      const result = await evaluated(f, id);
      assert.equal(result.status, cap === 91000 ? 'accepted' : 'blocked', result.reason);
      assert.equal(f.store.strategyUsage().amount, cap === 91000 ? 91000 : 0);
      assert.equal(f.sentOrders.length, cap === 91000 ? 1 : 0);
      if (cap === 91000) {
        const order = f.store.paperOrders()[0];
        assert.equal(order.price, 0);
        assert.equal(order.orderType, 'market');
      }
    } finally {
      f.close();
    }
  }
});

for (const expiry of ['REST 시세', 'KIS 요청창'] as const)
  test(`확장 전략의 전송 직전 ${expiry} 만료 시 예약을 보존하고 dispatched는 0이다`, async (t) => {
    const { DatabaseSync } = await import('node:sqlite');
    t.mock.timers.enable({ apis: ['Date'], now: base });
    const dir = mkdtempSync(join(tmpdir(), 'strategy-dispatch-ttl-')),
      path = join(dir, 'run.sqlite');
    const f = fixture(path, undefined, { policy: { ...defaultStrategyPolicy(), quoteSeconds: 1, signalSeconds: 15 } });
    try {
      const ws = f.start();
      await f.realtime.reconcile();
      const id = savedStrategy(f);
      if (expiry === 'REST 시세')
        f.response.before = async (path) => {
          if (path.endsWith('/inquire-psbl-order')) t.mock.timers.tick(1001);
        };
      else {
        const save = f.store.savePaper.bind(f.store);
        t.mock.method(f.store, 'savePaper', (...args: Parameters<typeof save>) => {
          save(...args);
          if (args[0].status === 'sending') f.kis.limitRequestsFor(0);
        });
      }
      crossing(ws);
      const result = await evaluated(f, id);
      assert.equal(result.status, 'rejected');
      assert.match(result.reason, expiry === 'REST 시세' ? /1초 유효기간/ : /조회 시간이 종료/);
      const db = new DatabaseSync(path, { readOnly: true });
      try {
        assert.equal(db.prepare('SELECT dispatched FROM strategy_claim').get()?.dispatched, 0);
      } finally {
        db.close();
      }
      assert.equal(f.store.strategyUsage().attempts, 1);
      assert.equal(f.sentOrders.length, 0);
    } finally {
      f.close();
      rmSync(dir, { recursive: true });
    }
  });

test('장전 승인 전 가상 신호·당일 승인 후 KIS 모의 어댑터·손실 도달 후 추가 매수 차단',async t=>{
  t.mock.timers.enable({apis:['Date'],now:base});
  const f=fixture();
  try{
    const {buildMorning}=await import('../server/morning.ts');
    const report=buildMorning(f.store,f.kis.connection(),base,[],[]);
    const c={code:'005930',name:'검증',held:0,reference:69900,exit:65000,limit:100000,relativeVolume:2,closes:[],asOf:'20261113'};
    Object.assign(report,{equity:10000000,cash:10000000,retainedCash:9900000,candidates:[c],exposureComplete:true});
    const account=f.kis.accountFingerprint();
    f.store.saveMorning(account,report);
    const codes=f.realtime.prepareMorning(report);
    f.realtime.armMorning(codes,null);
    const socket=f.sockets.at(-1)!;socket.emit('open');socket.acknowledge();
    await new Promise(resolve=>setTimeout(resolve,30));
    socket.frame(priceFrame(1,69800));socket.frame(priceFrame(2));
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(f.sentOrders.length,0);
    assert.equal(f.store.morningSignals(report.id)[0]?.outcome,'가상 신호 · 매매 미승인');
    f.store.approveMorning(account,report.day,report.id,new Date(base).toISOString());
    f.realtime.armMorning(codes,report.id);
    assert.equal(f.realtime.canMonitorCarry(report.day),false);
    socket.frame(priceFrame(3,69800));socket.frame(priceFrame(4));
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(f.sentOrders.length,1,JSON.stringify(f.store.morningSignals(report.id)));
    f.store.morningStopped(account,report.day,true);
    socket.frame(priceFrame(5,69800));socket.frame(priceFrame(6));
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(f.sentOrders.length,1);
  }finally{f.close();}
});

test('당일 매수 승인 없이 지정한 날의 이월 수량만 매도하고 장중 편입 승인은 만료·중복을 검사한다',async t=>{
  t.mock.timers.enable({apis:['Date'],now:base});
  const f=fixture();
  try{
    const {buildMorning}=await import('../server/morning.ts');
    const report=buildMorning(f.store,f.kis.connection(),base-3*86400000,[],[]);
    const c={code:'005930',name:'검증',held:1,reference:72000,exit:70100,limit:100000,relativeVolume:2,closes:[],asOf:'20261112'};
    Object.assign(report,{equity:10000000,cash:9000000,retainedCash:8900000,candidates:[c],exposureComplete:true});
    f.response.positions=[{pdno:'005930',prdt_name:'검증',hldg_qty:'1',ord_psbl_qty:'1',pchs_avg_pric:'69000',prpr:'70000'}];
    const account=f.kis.accountFingerprint();
    f.store.saveMorning(account,report);f.store.approveMorning(account,report.day,report.id,new Date(base-3*86400000).toISOString());
    const approved=f.store.morning(account,report.day)!;
    f.store.proposeMorning(report.id,{...c,code:'000660'},base+60000);
    assert.throws(()=>f.store.approveAddition(approved,'000660',base+60000,base+60001));
    f.store.approveAddition(approved,'000660',base+60000,base);
    assert.throws(()=>f.store.approveAddition(approved,'000660',base+60000,base));
    f.store.saveCarry(account,'2026-11-16',report.id,[{code:c.code,qty:1}]);
    f.realtime.armMorning([c.code]);
    const ws=f.sockets.at(-1)!;ws.emit('open');ws.acknowledge();
    await new Promise(resolve=>setTimeout(resolve,20));
    ws.frame(priceFrame(1,70200));ws.frame(priceFrame(2,70000));
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(f.sentOrders,[{tr:'VTTC0011U'}],JSON.stringify(f.store.morningSignals(report.id)));
    assert.equal(f.store.carry(account,'2026-11-16').length,0);
  }finally{f.close();}
});

test('자동 재연결된 포트폴리오 소켓에서는 이월 매도 감시를 재개하고 수동 단일 소켓은 차단한다', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: base });
  const f = fixture();
  try {
    const { buildMorning } = await import('../server/morning.ts');
    const report = buildMorning(f.store, f.kis.connection(), base - 3 * 86400000, [], []);
    const c = { code: '005930', name: '검증', held: 1, reference: 72000, exit: 70100, limit: 100000, relativeVolume: 2, closes: [], asOf: '20261112' };
    Object.assign(report, { equity: 10000000, cash: 9000000, retainedCash: 8900000, candidates: [c], exposureComplete: true });
    const account = f.kis.accountFingerprint();
    f.store.saveMorning(account, report);
    f.store.approveMorning(account, report.day, report.id, new Date(base - 3 * 86400000).toISOString());
    f.store.saveCarry(account, '2026-11-16', report.id, [{ code: c.code, qty: 1 }]);
    f.realtime.armMorning([c.code]);
    const ws1 = f.sockets.at(-1)!;
    ws1.emit('open');
    ws1.acknowledge();
    ws1.emit('close');
    t.mock.timers.tick(1500);
    const ws2 = f.sockets.at(-1)!;
    assert.notEqual(ws2, ws1);
    ws2.emit('open');
    ws2.acknowledge();
    assert.equal(f.realtime.canMonitorCarry('2026-11-16', ['005930']), true);
    assert.equal(f.realtime.canMonitorCarry('2026-11-16', ['000660']), false);
    f.realtime.armMorning([c.code]);
    assert.equal(f.realtime.canMonitorCarry('2026-11-16', ['005930']), false);
    f.realtime.stop();
    f.start();
    assert.equal(f.realtime.canMonitorCarry('2026-11-16', ['005930']), false);
  } finally {
    f.close();
  }
});

test('재연결 대기(retry) 중인 포트폴리오 세션은 기존 morningCodes를 유지하며 이월 재무장을 허용한다', () => {
  const f = fixture();
  try {
    f.realtime.armMorning(['005930', '000660']);
    const ws1 = f.sockets.at(-1)!;
    ws1.emit('open');
    ws1.emit('close');
    // 소켓이 끊겨 retry 타이머가 대기 중인 상태
    assert.equal(f.realtime.canMonitorCarry('2026-11-16', ['005930']), true);
    assert.equal(f.realtime.canMonitorCarry('2026-11-16', ['035420']), false);
    f.realtime.armMorning(['005930']);
    assert.equal(f.realtime.morningRun().subscriptions, 2);
    assert.equal(f.realtime.morningRun().armed, true);
  } finally {
    f.close();
  }
});

test('재연결 대기(retry) 중 prepareMorning은 수동 소켓이나 새 종목 집합으로 기존 구독을 덮어쓰지 못한다', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: base });
  const f = fixture();
  try {
    const { buildMorning } = await import('../server/morning.ts');
    const report = buildMorning(f.store, f.kis.connection(), base, [], []);
    const c = (code: string) => ({ code, name: code, held: 0, reference: 72000, exit: 70000, limit: 100000, relativeVolume: 2, closes: [], asOf: '20261113' });
    // 1) 포트폴리오 retry 대기 중 새 종목 포함 보고서는 차단되고, 기존 부분집합은 retry 타이머를 보존
    f.realtime.armMorning(['005930', '000660']);
    const ws1 = f.sockets.at(-1)!;
    ws1.emit('open');
    ws1.emit('close');
    Object.assign(report, { candidates: [c('005930'), c('035420')], watch: [] });
    assert.throws(() => f.realtime.prepareMorning(report), /정지한 뒤/);
    Object.assign(report, { candidates: [c('005930')], watch: [] });
    const subset = f.realtime.prepareMorning(report);
    assert.deepEqual(subset, ['005930']);
    f.realtime.armMorning(subset, report.id);
    assert.equal(f.realtime.morningRun().subscriptions, 2);
    t.mock.timers.tick(1500);
    assert.equal(f.sockets.length, 2);

    // 2) 수동 단일 종목 retry 대기 중에는 prepareMorning 자체가 차단됨
    f.realtime.stop();
    const wsManual = f.start();
    wsManual.emit('close');
    Object.assign(report, { candidates: [c('005930')], watch: [] });
    assert.throws(() => f.realtime.prepareMorning(report), /정지한 뒤/);
  } finally {
    f.close();
  }
});

for (const side of ['buy','sell'] as const) test('확정 종가 '+side+'는 당일 봉·미검증 수집을 제외하고 같은 날 한 번만 전송한다', async t => {
  t.mock.timers.enable({apis:['Date'],now:base});
  const rule = {kind:'ma_crossover',maType:'ema',fast:2,slow:3} as const;
  const f = fixture(':memory:',undefined,{rule});
  try {
    if (side === 'sell') f.response.positions=[{pdno:'005930',prdt_name:'검증',hldg_qty:'1',ord_psbl_qty:'1',pchs_avg_pric:'69000',prpr:'70000'}];
    const socket = f.start();
    await f.realtime.reconcile();
    const id = savedStrategy(f);
    f.store.update(s => { s.strategies.at(-1)!.rule = rule; });
    socket.frame(priceFrame(1));
    assert.equal((await evaluated(f,id)).reason,'확정 일봉 준비 봉 부족');
    const {run,bars} = dailyFixture();
    run.code = '005930';
    const prior = (side === 'buy' ? [10,10,9,15] : [10,10,11,5]).map((close,i)=>({...bars[i],date:['20261110','20261111','20261112','20261113'][i],code:run.code,close}));
    run.from = prior[0].date; run.to = '20261116'; run.calendar = undefined;
    f.store.saveDaily(run,[...prior,{...prior[3],close:side === 'buy' ? 1 : 200,date:'20261116'}]);
    f.store.saveDaily({...run,id:randomUUID(),startedAt:'2026-11-15T00:00:00Z',coverageComplete:false},[]);
    socket.frame(priceFrame(2));
    socket.frame(priceFrame(3));
    for (let i=0; i<1000 && !f.store.paperOrders().some(o=>o.status==='accepted'); i++) await new Promise<void>(r=>setImmediate(r));
    socket.frame(priceFrame(4));
    const latest = await evaluated(f,id);
    assert.equal(latest.reason,'당일 확정 일봉 신호 이미 집행됨');
    assert.equal(f.sentOrders.length,1);
    const [order] = f.store.paperOrders();
    assert.deepEqual([order.strategy?.event,order.side,order.price,order.qty],['20261116:daily',side,70000,1]);
    assert.equal(order.strategy?.signalBarDate,'20261113');
    assert.equal(f.store.strategyUsage().attempts,1);
  } finally { f.close(); }
});

test('부분매도·추가 매수·전량 청산 후 재진입의 체결원가와 샹들리에 래칫을 복원한다', () => {
  const store = new Store(':memory:');
  const {bars} = dailyFixture();
  const overlay = {chandelier:{atrPeriod:7,atrMultiplier:2}};
  const rule = {kind:'ma_crossover',maType:'sma',fast:2,slow:3} as const;
  const recordFill = (day: number, side: 'buy'|'sell', filled: number, amount: number) => {
    const date = bars[day].date;
    const id = randomUUID();
    const order = {requestId:id,brokerId:id,qty:filled,code:'005930',side,filled,createdAt:date,tradeDate:date,
      price:0,orderType:'market' as const,status:'filled' as const,message:'fixture',remaining:0};
    store.savePaper(order,{action:'reconcile',actor:'system',before:'accepted',evidence:{
      tradeDate:date,observedAt:date,balance:{cash:0,totalEquity:0,positions:[]},
      orders:[{...order,name:'fixture',date,organization:'001',cancelled:false,fillAmount:amount}]}});
  };
  const holding = () => dailyHolding(store,store.paperOrders(),bars,7,overlay);
  try {
    recordFill(0,'buy',4,40); recordFill(1,'sell',2,30); recordFill(2,'buy',2,60);
    assert.equal(holding()?.entryPrice,20);
    recordFill(3,'sell',4,100);
    assert.equal(holding(),undefined);
    recordFill(7,'buy',3,90);
    bars[8].high=80;
    bars[11].low=0; bars[11].high=105;
    let stop: number | undefined;
    for (let i=7;i<bars.length;i++) {
      stop=evaluateClose(bars.slice(0,i+1),rule,{barsHeld:i-6,entryPrice:30,trailStop:stop},overlay).trailStop;
    }
    assert.deepEqual(holding(),{entryPrice:30,barsHeld:bars.length-7,trailStop:stop});
  } finally { store.close(); }
});

test('당일 raw event의 UNIQUE claim은 재개 후에도 남고 다른 전략·revision의 전용 원장은 독립이다', () => {
  const dir=mkdtempSync(join(tmpdir(),'daily-claims-'));
  try {
    for (const [id,revision] of [['first',1],['first',2],['second',1]] as const) {
      const path=join(dir,id+revision+'.sqlite');
      const f=fixture(path,undefined,{strategyId:id,revision});
      const contract=JSON.parse(String(f.store.strategyContract())) as StrategyContract;
      const order={...makeClaimOrder(),strategy:{id,revision,event:'20261116:daily',signal:'buy' as const}};
      try {
        f.store.savePaper(order,{actor:'system',action:'sending',before:null},contract);
        f.store.savePaper({...order,status:'accepted'});
      } finally { f.close(); }
      const reopened=new Store(path,{contract});
      try {
        assert.throws(()=>reopened.savePaper({...order,requestId:randomUUID()},{actor:'system',action:'sending',before:null},contract),/UNIQUE/);
        assert.equal(reopened.strategyUsage().attempts,1);
        assert.equal(reopened.paperOrders().length,1);
      } finally { reopened.close(); }
    }
  } finally { rmSync(dir,{recursive:true}); }
});
function makeClaimOrder() {
  return {...order(),status:'sending' as const,tradeDate:'20261116',createdAt:new Date(base).toISOString(),filled:0,remaining:1,message:'fixture'};
}

test('직전 개장일·중간 개장일·달력 연도 미입증 및 과거 원장의 동일 일봉은 전송 0건', async t => {
  t.mock.timers.enable({apis:['Date'],now:base});
  const rule = {kind:'ma_crossover',maType:'ema',fast:2,slow:3} as const;
  for (const dates of [
    ['20261109','20261110','20261111','20261112'],
    ['20261109','20261111','20261112','20261113'],
    ['20251230','20261111','20261112','20261113'],
    ['20261110','20261111','20261112','20261113'],
  ]) {
    const duplicate = dates[0] === '20261110';
    const dir = mkdtempSync(join(tmpdir(),'signal-bar-'));
    const path = join(dir,'strategy.sqlite');
    if (duplicate) {
      const first = fixture(path,undefined,{rule});
      try {
        const strategy={id:'kis-strategy',revision:1,event:'20261113:daily',signal:'buy' as const,signalBarDate:'20261113'};
        first.store.savePaper({...makeClaimOrder(),tradeDate:'20261113',status:'accepted',strategy});
      } finally { first.close(); }
    }
    const f = fixture(path,undefined,{rule});
    try {
      const socket=f.start(); await f.realtime.reconcile(); const id=savedStrategy(f);
      f.store.update(s=>{ s.strategies.at(-1)!.rule=rule; });
      const {run,bars}=dailyFixture();
      run.code='005930'; run.from=dates[0]; run.to=dates[3];
      f.store.saveDaily(run,[10,10,9,15].map((close,i)=>({...bars[i],code:run.code,date:dates[i],close})));
      if (duplicate) assert.equal(f.store.paperOrders()[0].strategy?.signalBarDate,'20261113');
      socket.frame(priceFrame(1));
      assert.equal((await evaluated(f,id)).reason,duplicate?'동일 확정 일봉 신호 이미 집행됨':'직전 거래일 확정 일봉 미확인');
      assert.equal(f.sentOrders.length,0);
      assert.equal(f.store.strategyUsage().attempts,0);
    } finally { f.close(); rmSync(dir,{recursive:true}); }
  }
});
