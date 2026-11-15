import test from 'node:test';
import assert from 'node:assert/strict';
import { portfolioValue } from '../shared/portfolio.ts';
import { connectionSchema } from '../shared/contracts.ts';
import { disconnectedConnection } from '../shared/status.ts';

const holding = (code: string, qty: number, average: number, price: number | null) => ({ code, name: code, qty, average, price });

test('portfolio totals, weights and PnL share the same quantities and exclude zero holdings', () => {
  const p = portfolioValue(1000, [holding('005930', 2, 100, 150), holding('000660', 4, 200, 175), holding('069500', 0, 0, null)]);
  assert.equal(p.total, 2000); assert.equal(p.invested, 1000); assert.equal(p.profit, 0);
  assert.deepEqual(p.positions.map(p => [p.value, p.profit, p.weight]), [[300, 100, 15], [700, -100, 35]]);
  assert.equal(p.cashWeight, 50); assert.equal(p.investedWeight, 50);
  assert.equal(p.cashWeight! + p.positions.reduce((sum, p) => sum + p.weight!, 0), 100);
});

test('missing or zero prices do not turn into zero valuation or fabricated loss', () => {
  for (const price of [null, 0]) {
    const p = portfolioValue(1000, [holding('005930', 2, 100, price), holding('000660', 1, 200, 175)]);
    assert.equal(p.total, null); assert.equal(p.invested, null); assert.equal(p.profit, null); assert.equal(p.unpriced, 1);
    assert.equal(p.cashWeight, null); assert.equal(p.investedWeight, null);
    assert.deepEqual(p.positions.map(p => [p.value, p.profit, p.weight]), [[null, null, null], [175, -25, null]]);
  }
});

test('zero assets have no percentage and cash-only assets are 100 percent cash', () => {
  const zero = portfolioValue(0, [holding('005930', 0, 100, null)]);
  assert.equal(zero.total, 0); assert.equal(zero.cashWeight, null); assert.equal(zero.investedWeight, null); assert.deepEqual(zero.positions, []);
  const cash = portfolioValue(2000, []);
  assert.equal(cash.total, 2000); assert.equal(cash.cashWeight, 100); assert.equal(cash.investedWeight, 0); assert.equal(cash.profit, 0);
});

test('snapshot accepts an explicitly unavailable price and rejects invalid prices', () => {
  const connection = { ...disconnectedConnection(), balance: { cash: 0, totalEquity: 0, positions: [holding('005930', 1, 100, null)] } };
  assert.equal(connectionSchema.safeParse(connection).success, true);
  for (const price of [-1, Infinity, NaN, 'bad']) assert.equal(connectionSchema.safeParse({ ...connection, balance: { ...connection.balance, positions: [{ ...connection.balance.positions[0], price }] } }).success, false);
});
