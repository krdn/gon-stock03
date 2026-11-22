import type { BrokerOrder, PaperOrder } from '../shared/model.ts';
import { randomUUID } from 'node:crypto';
import type { KisClient } from './kis.ts';
import type { MorningReport } from '../shared/morning.ts';
import { seoulDay } from './morning.ts';

export function tradingContribution(
  local: PaperOrder[],
  broker: BrokerOrder[],
  prices: Map<string, number>,
  fees: MorningReport['costBps'],
) {
  let gross = 0,
    cost = 0,
    fills = 0;
  const seen = new Set<string>();
  const normalize = (id: string | undefined) => id?.replace(/^0+(?=\d)/, '');
  for (const o of local) {
    if (o.status === 'rejected') continue;
    if (!o.brokerId || !o.organization) return null;
    const rows = broker.filter(
      (b) =>
        normalize(b.brokerId) === normalize(o.brokerId) &&
        normalize(b.organization) === normalize(o.organization) &&
        b.date === o.tradeDate &&
        b.code === o.code &&
        b.side === o.side &&
        b.qty === o.qty,
    );
    const key = normalize(o.brokerId) + ':' + normalize(o.organization);
    if (rows.length !== 1 || seen.has(key)) return null;
    seen.add(key);
    const row = rows[0];
    if (!row.filled) continue;
    const close = prices.get(o.code);
    if (!close || !row.fillAmount || row.filled > o.qty) return null;
    gross += (o.side === 'buy' ? 1 : -1) * (row.filled * close - row.fillAmount);
    if (fees) cost += (row.fillAmount * fees[o.side]) / 10000;
    fills++;
  }
  return { gross, estimatedCost: fees || !fills ? cost : null, net: fees || !fills ? gross - cost : null, fills };
}
export async function closeMorning(report: MorningReport, kis: KisClient, close: string, local: PaperOrder[]) {
  const start = Date.now(),
    date = report.day.replaceAll('-', '');
  if (
    seoulDay(start) !== report.day ||
    start < Date.parse(report.day + 'T' + close + ':00+09:00') ||
    report.equity === null ||
    report.cash === null
  )
    throw new Error('당일 장 마감과 장전 잔고가 필요합니다.');
  const prices = new Map<string, number>();
  for (const code of new Set([...report.holdings, ...report.candidates, ...local].map((p) => p.code))) {
    const rows = await kis.dailyPage(
      { id: randomUUID(), from: date, to: date, code, adjustment: 'raw' },
      date,
      date,
    );
    if (rows.length === 1 && rows[0].date === date) prices.set(code, rows[0].close);
  }
  const contribution = tradingContribution(
    local,
    local.length ? await kis.dailyOrders(date) : [],
    prices,
    report.costBps,
  );
  const balance = (await kis.balance(true)).balance;
  if (!balance || seoulDay(Date.now()) !== report.day) throw new Error('당일 마감 잔고를 확인하지 못했습니다.');
  const benchmark = report.holdings.every((h) => prices.has(h.code))
    ? report.holdings.reduce((v, h) => v + h.qty * prices.get(h.code)!, report.cash)
    : null;
  return {
    contribution,
    positions: balance.positions.map((p) => ({ code: p.code, qty: p.qty })),
    at: new Date().toISOString(),
    equity: balance.totalEquity,
    change: balance.totalEquity - report.equity,
    hold: benchmark,
    difference: benchmark === null ? null : balance.totalEquity - benchmark,
    predictions: report.candidates.map((p) => ({
      code: p.code,
      reference: p.reference,
      close: prices.get(p.code) ?? null,
    })),
  };
}
export type MorningClose = Awaited<ReturnType<typeof closeMorning>>;
