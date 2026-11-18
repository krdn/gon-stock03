import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testOrder } from '../scripts/vts-runner.ts';
import { KisClient, KisNotSent } from '../server/kis.ts';
import { Store } from '../server/store.ts';

function setup(lost = false) {
  const orders: { qty: string; price: string; type: string }[] = [];
  const client = new KisClient({key:'test',secret:'test',account:'00000000',product:'01'}, async (url, init) => {
    const endpoint = new URL(String(url));
    assert.equal(endpoint.origin, 'https://openapivts.koreainvestment.com:29443');
    if (endpoint.pathname === '/oauth2/tokenP') return Response.json({access_token:'fixture',expires_in:3600});
    assert.equal(endpoint.pathname, '/uapi/domestic-stock/v1/trading/order-cash');
    const body = JSON.parse(String(init?.body));
    orders.push({qty:body.ORD_QTY,price:body.ORD_UNPR,type:body.ORD_DVSN});
    if (lost) throw new Error('lost receipt');
    return Response.json({rt_cd:'0',output:{ODNO:String(orders.length),KRX_FWDG_ORD_ORGNO:'1'}});
  }, 0);
  return {store:new Store(':memory:'),client,orders};
}
test('전용 VTS는 횟수·계약금액 제한 없이 지정가와 시장가를 보내고 같은 ID는 보존한다', async () => {
  const {store,client,orders} = setup();
  try {
    const input = {requestId:randomUUID(), code:'005930', side:'buy', qty:10, price:193000};
    for (let i=0;i<3;i++) {
      const order = {...input,requestId:randomUUID()};
      assert.equal((await testOrder(store,client,order,()=>{})).status,'accepted');
      assert.equal((await testOrder(store,client,order,()=>{})).status,'accepted');
      await assert.rejects(testOrder(store,client,{...order,qty:20},()=>{}),/같은 요청/);
    }
    const market = {...input,side:'sell',orderType:'market',price:0};
    await testOrder(store,client,market,()=>{});
    assert.equal(orders.length,4);
    assert.deepEqual(orders[3],{qty:'10',price:'0',type:'01'});
    await assert.rejects(testOrder(store,client,{...input,requestId:randomUUID()},()=>{throw new KisNotSent('closed')}),/closed/);
    assert.equal(orders.length,4);
  } finally {store.close();}
});
test('전용 VTS에서도 불명은 새 주문과 동일 ID 재전송을 차단한다', async () => {
  const {store,client,orders} = setup(true);
  const input = {requestId:randomUUID(),code:'005930',side:'buy',qty:2,price:193000};
  try {
    assert.equal((await testOrder(store,client,input,()=>{})).status,'unknown');
    assert.equal((await testOrder(store,client,input,()=>{})).status,'unknown');
    await assert.rejects(testOrder(store,client,{...input,requestId:randomUUID()},()=>{}),/응답 불명/);
    assert.equal(orders.length,1);
  } finally {store.close();}
});

test('장 마감과 전송이 겹치면 브로커 호출 직전 차단되고 동일 ID는 재전송되지 않는다', async () => {
  const { store, client, orders } = setup();
  const order = { requestId: randomUUID(), code: '005930', side: 'buy', qty: 3, price: 193000 };
  let checks = 0;
  try {
    const result = await testOrder(store, client, order, () => {
      if (++checks === 2) throw new KisNotSent('장 마감');
    });
    assert.equal(result.status, 'rejected');
    assert.equal(result.remaining, 0);
    assert.equal((await testOrder(store, client, order, () => {})).status, 'rejected');
    assert.equal(orders.length, 0);
  } finally { store.close(); }
});
