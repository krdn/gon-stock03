import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KisClient } from '../server/kis.ts';
import { KisNotSent } from '../server/kis.ts';
import { randomUUID } from 'node:crypto';

const credentials = { key: 'fixture-key', secret: 'fixture-secret', account: '00000000', product: '01' };
const empty = { rt_cd: '0', output1: [], output2: [{ dnca_tot_amt: '1000000', tot_evlu_amt: '1071000' }] };
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
