import { randomUUID } from 'node:crypto';
import { equity, type State, type BacktestInput, type BacktestResult, type Event } from '../shared/model.ts';
import type { OrderInput } from '../shared/contracts.ts';

const fee = (amount: number, bps = 1.5) => Math.ceil(amount * bps / 10000);
export function record(state: State, title: string, detail: string, level: Event['level'] = 'info') {
  state.events.unshift({ id: randomUUID(), time: new Date().toISOString(), title, detail, level, read: false });
  state.events = state.events.slice(0, 1000);
}
export function halt(state: State, stopped: boolean) {
  state.risk.halted = stopped;
  if (stopped) { state.playing = false; state.strategies.forEach(s => { s.active = false; }); }
  record(state, stopped ? '신규 주문 긴급정지' : '신규 주문 허용', stopped ? '전략이 정지되었습니다. 미체결 주문은 별도 취소가 필요합니다.' : '전략은 개별 시작이 필요합니다.', stopped ? 'warning' : 'info');
}
export function placeOrder(state: State, input: OrderInput, source = 'manual') {
  const existing = state.orders.find(o => o.requestId === input.requestId);
  if (existing) {
    if (existing.code !== input.code || existing.qty !== input.qty || existing.price !== input.price || existing.side !== input.side) throw new Error('동일 요청 ID로 다른 주문을 보낼 수 없습니다.');
    return existing;
  }
  const instrument = state.instruments.find(s => s.code === input.code);
  if (!instrument) throw new Error('지원하지 않는 종목입니다.');
  if (state.risk.halted) throw new Error('신규 주문 정지 상태입니다.');
  if (state.startingEquity - equity(state) >= state.risk.dailyLoss) throw new Error('손실 한도를 초과했습니다.');
  const amount = input.price * input.qty;
  if (!Number.isSafeInteger(amount) || amount > state.risk.maxOrder) throw new Error('1회 주문 한도를 초과했습니다.');
  const pending = state.orders.filter(o => o.status === 'pending');
  const position = state.positions.find(p => p.code === input.code);
  if (input.side === 'buy') {
    const reserved = pending.filter(o => o.side === 'buy').reduce((sum, o) => sum + o.price * o.qty + fee(o.price * o.qty), 0);
    if (amount + fee(amount) > state.cash - reserved) throw new Error('주문 가능한 현금이 부족합니다. 미체결 예약액을 확인하세요.');
    const pendingExposure = pending.filter(o => o.side === 'buy' && o.code === input.code).reduce((sum, o) => sum + o.price * o.qty, 0);
    if ((position?.qty ?? 0) * instrument.price + pendingExposure + amount > state.risk.maxPosition) throw new Error('종목별 최대 투자금을 초과했습니다.');
  } else {
    const reserved = pending.filter(o => o.side === 'sell' && o.code === input.code).reduce((sum, o) => sum + o.qty, 0);
    if (input.qty > (position?.qty ?? 0) - reserved) throw new Error('매도 가능한 보유 수량이 부족합니다.');
  }
  if (state.orders.length >= 10000) throw new Error('데모 주문 보관 한도에 도달했습니다.');
  const order = { ...input, id: randomUUID(), status: 'pending' as const, createdAt: new Date().toISOString(), source, fee: 0 };
  state.orders.unshift(order);
  record(state, '데모 주문 접수', `${instrument.name} ${input.side === 'buy' ? '매수' : '매도'} ${input.qty}주 · 아직 체결되지 않았습니다.`);
  return order;
}
export function cancelOrder(state: State, id: string) {
  const order = state.orders.find(o => o.id === id);
  if (!order || order.status !== 'pending') throw new Error('미체결 주문만 취소할 수 있습니다.');
  order.status = 'cancelled'; record(state, '데모 주문 취소', `${order.code} ${order.qty}주 예약을 해제했습니다.`);
}
export function advanceTick(state: State) {
  state.tick += 1;
  state.instruments.forEach((instrument, index) => {
    const oldPrice = instrument.price;
    instrument.price = Math.max(10, Math.round(oldPrice * (1 + Math.sin(state.tick * .7 + index) * .008) / 10) * 10);
    instrument.change = (instrument.price / oldPrice - 1) * 100;
    instrument.history.push(instrument.price); instrument.history = instrument.history.slice(-500);
  });
  for (const order of [...state.orders].reverse()) {
    if (order.status !== 'pending') continue;
    const instrument = state.instruments.find(i => i.code === order.code)!;
    if (order.side === 'buy' ? instrument.price > order.price : instrument.price < order.price) {
      if (order.source !== 'manual') cancelOrder(state, order.id);
      continue;
    }
    const amount = instrument.price * order.qty, cost = fee(amount);
    let position = state.positions.find(p => p.code === order.code);
    if (order.side === 'buy') {
      state.cash -= amount + cost;
      if (!position) { position = { code: order.code, qty: 0, average: 0 }; state.positions.push(position); }
      position.average = (position.qty * position.average + amount) / (position.qty + order.qty);
      position.qty += order.qty;
    } else {
      if (!position || position.qty < order.qty) throw new Error('보유 수량 대조가 필요합니다.');
      state.cash += amount - cost; position.qty -= order.qty;
    }
    order.status = 'filled'; order.filledPrice = instrument.price; order.filledAt = new Date().toISOString(); order.fee = cost;
    record(state, '데모 주문 체결', `${instrument.name} ${order.qty}주 · ${instrument.price.toLocaleString('ko-KR')}원 · 비용 ${cost}원`);
  }
  if (!state.risk.halted && state.startingEquity - equity(state) >= state.risk.dailyLoss) halt(state, true);
  for (const strategy of state.strategies) {
    if (!strategy.active || strategy.lastTick === state.tick || state.risk.halted) continue;
    strategy.lastTick = state.tick;
    const instrument = state.instruments.find(i => i.code === strategy.code)!;
    strategy.lastSignal = signal(instrument.history, strategy.fast, strategy.slow);
    if (strategy.lastSignal === 'hold') continue;
    try {
      placeOrder(state, { code: strategy.code, side: strategy.lastSignal, qty: strategy.qty, price: instrument.price, requestId: randomUUID() }, strategy.id);
    } catch (error) { record(state, '전략 주문 차단', `${strategy.name}: ${error instanceof Error ? error.message : '검증 실패'}`, 'warning'); }
  }
  state.updatedAt = new Date().toISOString();
}
function mean(prices: number[], end: number, count: number) { return prices.slice(end - count, end).reduce((a, b) => a + b, 0) / count; }
export function signal(prices: number[], fast: number, slow: number): 'buy' | 'sell' | 'hold' {
  if (prices.length < slow + 1) return 'hold';
  const end = prices.length;
  const before = mean(prices, end - 1, fast) - mean(prices, end - 1, slow);
  const now = mean(prices, end, fast) - mean(prices, end, slow);
  return before <= 0 && now > 0 ? 'buy' : before >= 0 && now < 0 ? 'sell' : 'hold';
}
export function backtest(prices: number[], input: BacktestInput): BacktestResult {
  if (prices.length <= input.slow + 1 || prices.some(p => !Number.isFinite(p) || p <= 0)) throw new Error('유효한 가격 표본이 부족합니다.');
  let cash = input.capital, qty = 0, fees = 0, peak = input.capital, drawdown = 0;
  const values: number[] = [], trades: BacktestResult['trades'] = [];
  for (let i = 0; i < prices.length; i++) {
    const direction = signal(prices.slice(0, i), input.fast, input.slow);
    const price = prices[i] * (1 + (direction === 'buy' ? 1 : -1) * input.slippageBps / 10000);
    if (direction === 'buy' && qty === 0) {
      let units = Math.floor(cash / (price * (1 + input.feeBps / 10000)));
      if (units * price + fee(units * price, input.feeBps) > cash) units -= 1;
      if (units > 0) {
        const cost = fee(units * price, input.feeBps); cash -= units * price + cost; qty = units; fees += cost;
        trades.push({ bar: i, side: 'buy', price, qty: units, fee: cost });
      }
    } else if (direction === 'sell' && qty > 0) {
      const cost = fee(qty * price, input.feeBps); cash += qty * price - cost; fees += cost;
      trades.push({ bar: i, side: 'sell', price, qty, fee: cost }); qty = 0;
    }
    const value = cash + qty * prices[i]; values.push(value); peak = Math.max(peak, value); drawdown = Math.max(drawdown, (peak - value) / peak * 100);
  }
  const finalEquity = values.at(-1)!;
  return { equity: values, trades, finalEquity, returnPct: (finalEquity / input.capital - 1) * 100, maxDrawdown: drawdown, fees, source: `합성 ${prices.length}봉 · 다음 봉 종가 체결 가정 · 세금 미포함` };
}
