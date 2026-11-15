import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { KisClient, koreaDate } from '../server/kis.ts';
import { PaperBroker } from '../server/paper.ts';
import { Store } from '../server/store.ts';

function fixture(mode: 'success' | 'timeout' | 'reject') {
  let submits = 0;
  const response = { cash: '10000000', totalEquity: '10000000', rows: [] as Record<string, string>[] };
  const transport: typeof fetch = async url => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/tokenP')) return Response.json({ access_token: 'test-token', expires_in: 86400 });
    if (path.endsWith('/inquire-balance')) return Response.json({ rt_cd: '0', output1: [], output2: [{ dnca_tot_amt: response.cash, tot_evlu_amt: response.totalEquity }] });
    if (path.endsWith('/inquire-price')) return Response.json({ rt_cd: '0', output: { stck_prpr: '70000', prdy_ctrt: '1.0', stck_mxpr: '91000', stck_llam: '49000', aspr_unit: '100', temp_stop_yn: 'N' } });
    if (path.endsWith('/inquire-psbl-order')) return Response.json({ rt_cd: '0', output: { nrcvb_buy_qty: '100', ord_psbl_cash: '10000000' } });
    if (path.endsWith('/inquire-daily-ccld')) return Response.json({ rt_cd: '0', output1: response.rows });
    if (path.endsWith('/order-cash')) {
      submits += 1;
      if (mode === 'timeout') throw new Error('network timeout after broker accepted');
      if (mode === 'reject') return Response.json({ rt_cd: '1', msg_cd: 'TEST_REJECT', msg1: 'secret upstream text' });
      return Response.json({ rt_cd: '0', output: { ODNO: '001', KRX_FWDG_ORD_ORGNO: '12345' } });
    }
    assert.fail(`unexpected endpoint: ${path}`);
  };
  const store = new Store(':memory:');
  const client = new KisClient({ key: 'key', secret: 'secret', account: '00000000', product: '01' }, transport, 0);
  return { store, broker: new PaperBroker(store, client), count: () => submits, response };
}
const input = () => ({ code: '005930', side: 'buy' as const, qty: 1, price: 70000, requestId: randomUUID() });
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
test('paper risk limits fail before broker mutation and sell cannot exceed holdings', async () => {
  const f = fixture('success'); try {
    f.store.update(state => { state.risk.halted = true; }); await assert.rejects(f.broker.submit(input()), /정지/); assert.equal(f.count(), 0);
    f.store.update(state => { state.risk.halted = false; }); await assert.rejects(f.broker.submit({ ...input(), side: 'sell' }), /보유/); assert.equal(f.count(), 0);
    await assert.rejects(f.broker.submit({ ...input(), qty: 20 }), /주문 한도/); assert.equal(f.count(), 0);
  } finally { f.store.close(); }
});
