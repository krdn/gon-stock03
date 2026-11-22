import { randomUUID } from 'node:crypto';
import type { KisClient } from './kis.ts';
import type { MorningReport } from '../shared/morning.ts';
import { seoulDay } from './morning.ts';

export async function closeMorning(report: MorningReport, kis: KisClient, close: string) {
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
  for (const code of new Set([...report.holdings, ...report.candidates].map((p) => p.code))) {
    const rows = await kis.dailyPage(
      { id: randomUUID(), from: date, to: date, code, adjustment: 'raw' },
      date,
      date,
    );
    if (rows.length === 1 && rows[0].date === date) prices.set(code, rows[0].close);
  }
  const balance = (await kis.balance(true)).balance;
  if (!balance || seoulDay(Date.now()) !== report.day) throw new Error('당일 마감 잔고를 확인하지 못했습니다.');
  const benchmark = report.holdings.every((h) => prices.has(h.code))
    ? report.holdings.reduce((v, h) => v + h.qty * prices.get(h.code)!, report.cash)
    : null;
  return {
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
