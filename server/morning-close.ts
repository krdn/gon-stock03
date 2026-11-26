import type { BrokerOrder, PaperOrder } from '../shared/model.ts';
import { randomUUID } from 'node:crypto';
import type { KisClient } from './kis.ts';
import { isKstWeekend, krxHours } from '../shared/trading-policy.ts';
import type { MorningCloseWarning, MorningReport } from '../shared/morning.ts';
import { seoulDay } from './morning.ts';

export function morningCloseWarning(
  report: MorningReport | null, close: MorningClose | null, now: number,
  verifiedClose: string | null, dedicatedRun: boolean, configured: boolean,
): MorningCloseWarning | null {
  if (!report || report.approvedAt === null || isKstWeekend(report.day) || close?.hold != null) return null;
  const day = report.day;
  const today = seoulDay(now);
  const closeAt = Date.parse(day + 'T' + (verifiedClose ?? krxHours(day).close) + ':00+09:00');
  if (day > today || (day === today && now < closeAt)) return null;
  const reason = close ? 'incomplete' : 'missing';
  const reasons = [close ? '보유 유지 평가액이 없어 장후 마감이 미완성입니다.' : '장후 마감 기록이 없습니다.'];
  const blocked = (reasonCode: MorningCloseWarning['reasonCode'], message: string): MorningCloseWarning =>
    ({ missing: true, reason, canClose: false, reasonCode, reasons: [...reasons, message] });
  if (day < today) return blocked('PAST_TRADING_DAY', '해당 거래일의 수동 마감 기한이 지났습니다.');
  if (!verifiedClose) return blocked('MISSING_VERIFIED_SESSION', '당일 검증된 거래 세션이 없어 마감할 수 없습니다.');
  if (dedicatedRun) return blocked('RESTRICTED_MODE', '일반 실행 모드에서만 마감할 수 있습니다.');
  if (!configured) return blocked('UNCONFIGURED_ACCOUNT', 'KIS 모의 계좌 설정이 필요합니다.');
  if (report.cash === null || report.equity === null) return blocked('MISSING_BALANCE', '장전 잔고가 없어 마감할 수 없습니다.');
  return { missing: true, reason, canClose: true, reasonCode: 'MISSING_CLOSE', reasons };
}

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
export async function closeMorning(report: MorningReport, kis: KisClient, close: string, local: PaperOrder[], now = Date.now) {
  const start = now(),
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
  if (!balance || seoulDay(now()) !== report.day) throw new Error('당일 마감 잔고를 확인하지 못했습니다.');
  const benchmark = report.holdings.every((h) => prices.has(h.code))
    ? report.holdings.reduce((v, h) => v + h.qty * prices.get(h.code)!, report.cash)
    : null;
  return {
    contribution,
    positions: balance.positions.map((p) => ({ code: p.code, qty: p.qty })),
    at: new Date(now()).toISOString(),
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
