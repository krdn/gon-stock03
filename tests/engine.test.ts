import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initialState } from '../shared/fixtures.ts';
import { equity } from '../shared/model.ts';
import { placeOrder, cancelOrder, advanceTick, signal, backtest } from '../server/engine.ts';
import { orderInput } from '../shared/contracts.ts';

const input = (patch = {}) => ({ code: '005930', side: 'buy' as const, qty: 1, price: 72800, requestId: randomUUID(), ...patch });
test('duplicate request ID returns one order, changed body with same ID is rejected', () => {
  const state = initialState(), order = input();
  placeOrder(state, order); placeOrder(state, order);
  assert.equal(state.orders.length, 1);
  assert.throws(() => placeOrder(state, { ...order, qty: 2 }), /동일 요청/);
});
test('pending buy reserves cash including fee and cancel releases it', () => {
  const state = initialState(); state.cash = 73000; state.startingEquity = equity(state);
  const order = placeOrder(state, input());
  assert.throws(() => placeOrder(state, input()), /현금/);
  cancelOrder(state, order.id); placeOrder(state, input());
  assert.equal(state.orders.filter(o => o.status === 'pending').length, 1);
});
test('pending sells reserve position and reject overselling', () => {
  const state = initialState(); state.risk.maxOrder = 5000000;
  placeOrder(state, input({ side: 'sell', qty: 30 }));
  assert.throws(() => placeOrder(state, input({ side: 'sell' })), /보유/);
});
test('halt, order limit, position exposure and loss limit are server rules', () => {
  const state = initialState(); state.risk.halted = true;
  assert.throws(() => placeOrder(state, input()), /정지/);
  state.risk.halted = false;
  assert.throws(() => placeOrder(state, input({ qty: 20 })), /주문 한도/);
  state.risk.maxPosition = 2185000;
  assert.throws(() => placeOrder(state, input()), /종목/);
  state.risk.maxPosition = 4000000; state.cash = 0;
  assert.throws(() => placeOrder(state, input()), /손실/);
});
test('invalid quantity and unknown instrument do not create orders', () => {
  assert.equal(orderInput.safeParse(input({ qty: 0 })).success, false);
  assert.equal(orderInput.safeParse(input({ qty: 1.1 })).success, false);
  assert.throws(() => placeOrder(initialState(), input({ code: '999999' })), /종목/);
});
test('acceptance does not fill immediately, next tick fills and fee is charged', () => {
  const state = initialState(), cash = state.cash;
  const order = placeOrder(state, input({ price: 80000 }));
  assert.equal(order.status, 'pending'); assert.equal(state.cash, cash);
  advanceTick(state);
  assert.equal(order.status, 'filled');
  assert.equal(state.positions.find(p => p.code === '005930')?.qty, 31);
  assert.ok(state.cash < cash - 70000);
  assert.throws(() => cancelOrder(state, order.id), /미체결/);
});
test('unfilled strategy orders expire after one bar while manual orders stay pending', () => {
  const state = initialState();
  const strategy = placeOrder(state, input({ price: 100 }), state.strategies[0].id);
  const manual = placeOrder(state, input({ price: 100 }));
  advanceTick(state);
  assert.equal(strategy.status, 'cancelled'); assert.equal(manual.status, 'pending');
});
test('crossover signals require a transition, not just above or below', () => {
  assert.equal(signal([10, 10, 10, 8, 7, 15], 2, 4), 'buy');
  assert.equal(signal([10, 10, 10, 12, 13, 5], 2, 4), 'sell');
  assert.equal(signal([1, 2, 3, 4, 5, 6], 2, 4), 'hold');
  assert.equal(signal([1, 2], 2, 4), 'hold');
});
test('backtest signals execute next bar, costs affect cash, future bars do not rewrite past trades', () => {
  const prices = [10, 10, 10, 8, 7, 15, 16, 18, 17, 5, 4, 6, 8, 12, 15];
  const config = { code: '005930', fast: 2, slow: 4, capital: 100000, feeBps: 10, slippageBps: 5 };
  const result = backtest(prices, config);
  assert.equal(result.trades[0]?.bar, 6);
  assert.ok(result.fees > 0); assert.equal(result.equity.length, prices.length);
  const prefix = backtest(prices.slice(0, 10), config);
  assert.deepEqual(result.trades.filter(t => t.bar < 10), prefix.trades);
  const free = backtest(prices, { ...config, feeBps: 0, slippageBps: 0 });
  assert.ok(result.finalEquity < free.finalEquity);
  assert.ok(result.maxDrawdown > 0);
});
